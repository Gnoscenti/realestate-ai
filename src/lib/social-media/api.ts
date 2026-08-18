import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  generateSocialMediaSchema,
  socialMediaJobLookupSchema,
  type SocialMediaErrorCode,
  type SocialMediaGenerateResult,
  type SocialMediaJobView,
  type SocialMediaSetupResult,
} from "./types";

function existingJobResult(
  job: SocialMediaJobView,
): SocialMediaGenerateResult {
  if (job.status === "completed" && job.asset) return { ok: true, job };
  const allowedCodes: SocialMediaErrorCode[] = [
    "not_entitled",
    "quota_exhausted",
    "setup_required",
    "listing_or_photos_not_found",
    "invalid_template",
    "duplicate_request",
    "provider_rate_limit",
    "provider_timeout",
    "provider_rejected",
    "provider_unavailable",
    "provider_response_invalid",
  ];
  const code = allowedCodes.includes(job.errorCode as SocialMediaErrorCode)
    ? (job.errorCode as SocialMediaErrorCode)
    : "duplicate_request";
  return {
    ok: false,
    code,
    error:
      job.errorMessage ??
      (job.status === "processing"
        ? "This render job is already processing."
        : "This request was already received."),
    job,
  };
}

export const getSocialMediaSetup = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<SocialMediaSetupResult> => {
    const [{ getSql }, { ensurePersonalWorkspace }, repository, templates, video] =
      await Promise.all([
        import("@/lib/db"),
        import("@/lib/workspaces/repository.server"),
        import("./repository.server"),
        import("./templates.server"),
        import("./video-provider.server"),
      ]);
    const sql = await getSql();
    const workspace = await ensurePersonalWorkspace(context.userId, sql);
    const config = templates.loadOrshotTemplateConfig(workspace.id);
    const [listings, entitlement, recentJob] = await Promise.all([
      repository.listSocialMediaListings(sql, workspace.id),
      repository.getSocialMediaEntitlement(sql, workspace.id),
      repository.reconcileRecentSocialMediaImageJob(
        sql,
        workspace.id,
        context.userId,
      ),
    ]);
    return {
      listings,
      imageTemplates: config.templates.map(templates.publicTemplateView),
      videoTemplates: [video.SOCIAL_VIDEO_TEMPLATE],
      imageProviderConfigured: config.configured,
      videoProviderStatus: "setup_required",
      entitlement: repository.entitlementView(entitlement),
      recentJob,
    };
  });

export const generateSocialImage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(generateSocialMediaSchema)
  .handler(async ({ context, data }): Promise<SocialMediaGenerateResult> => {
    const [
      { getSql },
      { ensurePersonalWorkspace },
      repository,
      templates,
      orshot,
    ] = await Promise.all([
      import("@/lib/db"),
      import("@/lib/workspaces/repository.server"),
      import("./repository.server"),
      import("./templates.server"),
      import("./orshot.server"),
    ]);
    const sql = await getSql();
    const workspace = await ensurePersonalWorkspace(context.userId, sql);
    const entitlement = await repository.getSocialMediaEntitlement(
      sql,
      workspace.id,
    );
    if (entitlement.status === "unavailable") {
      return {
        ok: false,
        code: "not_entitled",
        error: entitlement.message,
      };
    }
    if (!entitlement.enabled) {
      return {
        ok: false,
        code: "quota_exhausted",
        error: entitlement.message,
      };
    }

    const config = templates.loadOrshotTemplateConfig(workspace.id);
    if (!config.configured) {
      return {
        ok: false,
        code: "setup_required",
        error:
          "Social image rendering is not configured. An administrator must add an Orshot key, approved template mapping, and approved photo/output hosts.",
      };
    }
    const template = config.templates.find(
      (candidate) => candidate.key === data.templateKey,
    );
    if (!template || data.mediaIds.length > template.photoKeys.length) {
      return {
        ok: false,
        code: "invalid_template",
        error: template
          ? `This template supports up to ${template.photoKeys.length} selected photos.`
          : "That social image template is not approved for this workspace.",
      };
    }

    const resolved = await repository.resolveOwnedListingMedia(
      sql,
      workspace.id,
      data.listingId,
      data.mediaIds,
    );
    if (!resolved) {
      return {
        ok: false,
        code: "listing_or_photos_not_found",
        error:
          "The selected listing and photos must belong to this workspace and use an approved public photo host.",
      };
    }

    let claimed = false;
    try {
      claimed = await repository.createSocialMediaJob(sql, {
        id: data.requestId,
        workspaceId: workspace.id,
        userId: context.userId,
        listingId: data.listingId,
        kind: "image",
        templateKey: data.templateKey,
        provider: "orshot",
        status: "processing",
        mediaIds: data.mediaIds,
      });
    } catch {
      return {
        ok: false,
        code: "listing_or_photos_not_found",
        error: "The selected listing photos could not be attached to this job.",
      };
    }
    if (!claimed) {
      const [matches, existing] = await Promise.all([
        repository.mediaJobMatchesInput(
          sql,
          workspace.id,
          context.userId,
          data.requestId,
          {
            listingId: data.listingId,
            kind: "image",
            templateKey: data.templateKey,
            mediaIds: data.mediaIds,
          },
        ),
        repository.getSocialMediaJob(
          sql,
          workspace.id,
          context.userId,
          data.requestId,
        ),
      ]);
      if (matches && existing) return existingJobResult(existing);
      const activeIntentJob = await repository.getActiveSocialMediaJobForIntent(
        sql,
        workspace.id,
        context.userId,
        {
          listingId: data.listingId,
          kind: "image",
          templateKey: data.templateKey,
          mediaIds: data.mediaIds,
        },
      );
      if (activeIntentJob) return existingJobResult(activeIntentJob);
      return {
        ok: false,
        code: "duplicate_request",
        error: "That request ID was already used. Start a new render.",
      };
    }

    const reserved = await repository.reserveSocialMediaQuotaAndChargeJob(
      sql,
      workspace.id,
      data.requestId,
      entitlement,
    );
    if (!reserved) {
      await repository.markSocialMediaJob(sql, workspace.id, data.requestId, {
        status: "blocked",
        errorCode: "quota_exhausted",
        errorMessage:
          "This workspace reached its social media render limit for the billing period.",
        unitCount: 0,
      });
      const job = await repository.getSocialMediaJob(
        sql,
        workspace.id,
        context.userId,
        data.requestId,
      );
      return {
        ok: false,
        code: "quota_exhausted",
        error:
          "This workspace reached its social media render limit for the billing period.",
        ...(job ? { job } : {}),
      };
    }
    try {
      const modifications = templates.buildOrshotModifications(
        template,
        resolved.listing,
        resolved.photos.map((photo) => photo.url),
      );
      const contentUrl = await orshot.renderOrshotImage({
        jobId: data.requestId,
        template,
        modifications,
      });
      const completed = await repository.completeSocialMediaImageJob(sql, {
        workspaceId: workspace.id,
        jobId: data.requestId,
        contentUrl,
      });
      if (!completed) {
        throw new orshot.OrshotRenderError({
          code: "provider_timeout",
          message:
            "The job changed while the render was finishing. Support must reconcile it before any retry.",
          ambiguousProviderOutcome: true,
        });
      }
      const job = await repository.getSocialMediaJob(
        sql,
        workspace.id,
        context.userId,
        data.requestId,
      );
      if (job?.status !== "completed" || !job.asset) {
        throw new Error("Completed render asset was not saved");
      }
      return { ok: true, job };
    } catch (error) {
      const providerError =
        error instanceof orshot.OrshotRenderError ? error : null;
      const code = providerError?.code ?? "provider_unavailable";
      const message =
        providerError?.message ??
        "The render outcome is uncertain. Support must check the job before retrying.";
      await repository.markSocialMediaJob(sql, workspace.id, data.requestId, {
        status: providerError?.ambiguousProviderOutcome === false
          ? "failed"
          : "attention_required",
        errorCode: code,
        errorMessage: message,
        unitCount: 1,
      });
      const job = await repository.getSocialMediaJob(
        sql,
        workspace.id,
        context.userId,
        data.requestId,
      );
      // If the atomic completion succeeded but the subsequent read transiently
      // threw, an idempotent re-read reports the saved asset as completed.
      if (job?.status === "completed" && job.asset) return { ok: true, job };
      return {
        ok: false,
        code,
        error: message,
        ...(job ? { job } : {}),
        ...(providerError?.retryAfterSeconds == null
          ? {}
          : { retryAfterSeconds: providerError.retryAfterSeconds }),
      };
    }
  });

export const generateSocialVideo = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(generateSocialMediaSchema)
  .handler(async (): Promise<SocialMediaGenerateResult> => {
    const { VIDEO_SETUP_REQUIRED_MESSAGE } = await import(
      "./video-provider.server"
    );
    // This authenticated endpoint deliberately performs no database or provider
    // mutation while video is unavailable. In particular, repeated requests do
    // not create placeholder jobs or consume quota.
    return {
      ok: false,
      code: "setup_required",
      error: VIDEO_SETUP_REQUIRED_MESSAGE,
    };
  });

export const getSocialMediaJobStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(socialMediaJobLookupSchema)
  .handler(async ({ context, data }): Promise<SocialMediaJobView | null> => {
    const [{ getSql }, { ensurePersonalWorkspace }, repository] =
      await Promise.all([
        import("@/lib/db"),
        import("@/lib/workspaces/repository.server"),
        import("./repository.server"),
      ]);
    const sql = await getSql();
    const workspace = await ensurePersonalWorkspace(context.userId, sql);
    return repository.getSocialMediaJob(
      sql,
      workspace.id,
      context.userId,
      data.jobId,
    );
  });
