import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { getSql, type Sql } from "@/lib/db";
import { ensurePersonalWorkspace } from "@/lib/workspaces/repository.server";
import {
  buildOrshotModifications,
  loadOrshotTemplateConfig,
} from "@/lib/social-media/templates.server";
import {
  ORSHOT_RENDER_ENDPOINT,
  renderOrshotImage,
} from "@/lib/social-media/orshot.server";
import {
  completeSocialMediaImageJob,
  createSocialMediaJob,
  getSocialMediaJob,
  getSocialMediaEntitlement,
  listingPhotoEligibility,
  markSocialMediaJob,
  reconcileRecentSocialMediaImageJob,
  resolveOwnedListingMedia,
  reserveSocialMediaQuotaAndChargeJob,
  SOCIAL_MEDIA_APPROVED_RASTER_MIME_TYPES,
  SOCIAL_MEDIA_MAX_PHOTO_DIMENSION,
} from "@/lib/social-media/repository.server";
import { publicHttpsUrl } from "@/lib/social-media/url-safety.server";
import { SetupRequiredVideoProvider } from "@/lib/social-media/video-provider.server";
import {
  clearSocialImageRequestIdentity,
  persistSocialImageRequestIdentity,
  readSocialImageRequestIdentity,
  requestIdentityForSocialImage,
} from "@/lib/social-media/request-id";

const templateConfig = JSON.stringify({
  defaults: [
    {
      key: "modern",
      label: "Modern",
      templateId: 12345,
      photoKeys: ["hero_photo", "detail_photo"],
      allImageLayersUseListingPhotos: true,
      fields: {
        address: "address",
        price: "price",
        bedrooms: "beds",
      },
      outputSize: "instagram-post",
    },
  ],
  workspaces: {},
});

const configuredEnv = {
  ORSHOT_API_KEY: "secret-test-key",
  ORSHOT_TEMPLATE_MAPPINGS: templateConfig,
  SOCIAL_MEDIA_PHOTO_HOST_ALLOWLIST: "photos.example.com",
  ORSHOT_OUTPUT_HOST_ALLOWLIST: "renders.example.com",
} as NodeJS.ProcessEnv;

function approvedModifications() {
  const template = loadOrshotTemplateConfig(
    "workspace-1",
    configuredEnv,
  ).templates[0]!;
  return buildOrshotModifications(
    template,
    {
      title: "Example home",
      address: "123 Main St, Portland, OR",
      listPrice: "750000",
      beds: "3",
      baths: "2",
      livingArea: 1800,
      description: "Real listing description",
    },
    ["https://photos.example.com/home.jpg"],
  );
}

async function seedListing(userId: string) {
  const sql = await getSql();
  const workspace = await ensurePersonalWorkspace(userId, sql);
  const listingId = `listing-${randomUUID()}`;
  const mediaId = `media-${randomUUID()}`;
  await sql.query(
    `insert into listings (
       id, workspace_id, title, address_line1, city, state, status,
       list_price, beds, baths, living_area, description, provenance,
       created_by_user_id
     ) values ($1,$2,'Example home','123 Main St','Portland','OR','active',
       750000,3,2,1800,'Real listing description','manual',$3)`,
    [listingId, workspace.id, userId],
  );
  await sql.query(
    `insert into listing_media (
       id, workspace_id, listing_id, source_url, content_type, width, height,
       provenance
     ) values ($1,$2,$3,'https://photos.example.com/home.jpg','image/jpeg',
       1600,1200,'manual')`,
    [mediaId, workspace.id, listingId],
  );
  return { sql, workspace, listingId, mediaId, userId };
}

describe("social media URL and template policy", () => {
  it("requires an explicit photo host allowlist", () => {
    expect(publicHttpsUrl("https://photos.example.com/home.jpg", {})).toBeNull();
    expect(
      publicHttpsUrl("https://photos.example.com/home.jpg", configuredEnv),
    ).toBe("https://photos.example.com/home.jpg");
    expect(
      publicHttpsUrl("https://unapproved.example/home.jpg", configuredEnv),
    ).toBeNull();
    expect(
      publicHttpsUrl("https://127.0.0.1/home.jpg", {
        SOCIAL_MEDIA_PHOTO_HOST_ALLOWLIST: "127.0.0.1",
      }),
    ).toBeNull();
  });

  it("requires verified raster MIME and positive bounded dimensions", () => {
    const photo = {
      source_url: "https://photos.example.com/home.jpg",
      private_storage_key: null,
      content_type: "image/jpeg",
      width: 1600,
      height: 1200,
    };
    for (const content_type of SOCIAL_MEDIA_APPROVED_RASTER_MIME_TYPES) {
      expect(
        listingPhotoEligibility({ ...photo, content_type }, configuredEnv),
      ).toMatchObject({ url: photo.source_url, reason: null });
    }
    expect(
      listingPhotoEligibility(
        { ...photo, content_type: " IMAGE/AVIF " },
        configuredEnv,
      ),
    ).toMatchObject({ url: photo.source_url, reason: null });

    for (const invalid of [
      { ...photo, content_type: null },
      { ...photo, content_type: "image/svg+xml" },
      { ...photo, content_type: "image/gif" },
      { ...photo, content_type: "image/jpg" },
      { ...photo, content_type: "image/jpeg; charset=binary" },
      { ...photo, width: null },
      { ...photo, height: null },
      { ...photo, width: 0 },
      { ...photo, height: -1 },
      { ...photo, width: SOCIAL_MEDIA_MAX_PHOTO_DIMENSION + 1 },
      { ...photo, height: SOCIAL_MEDIA_MAX_PHOTO_DIMENSION + 1 },
    ]) {
      expect(listingPhotoEligibility(invalid, configuredEnv).url).toBeNull();
    }
  });

  it("keeps template IDs and modification keys on the server allowlist", () => {
    const config = loadOrshotTemplateConfig("workspace-1", configuredEnv);
    expect(config.configured).toBe(true);
    expect(config.templates[0]?.templateId).toBe(12345);
    const modifications = buildOrshotModifications(
      config.templates[0]!,
      {
        title: "Example home",
        address: "123 Main St, Portland, OR",
        listPrice: "750000",
        beds: "3",
        baths: "2",
        livingArea: 1800,
        description: "Real listing description",
      },
      ["https://photos.example.com/home.jpg"],
    );
    expect(modifications).toMatchObject({
      hero_photo: "https://photos.example.com/home.jpg",
      detail_photo: "https://photos.example.com/home.jpg",
      address: "123 Main St, Portland, OR",
      price: "$750,000",
      beds: "3 beds",
    });
    expect(Object.keys(modifications).join(" ")).not.toMatch(/prompt/i);
    expect(
      buildOrshotModifications(
        config.templates[0]!,
        {
          title: "Example home",
          address: "123 Main St",
          listPrice: null,
          beds: null,
          baths: null,
          livingArea: null,
          description: null,
        },
        ["https://photos.example.com/home.jpg"],
      ).price,
    ).toBe("Price available on request");
  });

  it("fails configuration when a generative parameter is mapped", () => {
    const unsafe = JSON.stringify({
      defaults: [
        {
          key: "unsafe",
          label: "Unsafe",
          templateId: 9,
          photoKeys: ["hero.prompt"],
          allImageLayersUseListingPhotos: true,
          fields: {},
          outputSize: "instagram-post",
        },
      ],
      workspaces: {},
    });
    expect(
      loadOrshotTemplateConfig("workspace-1", {
        ...configuredEnv,
        ORSHOT_TEMPLATE_MAPPINGS: unsafe,
      }),
    ).toMatchObject({ configured: false, configurationError: true });
  });

  it("fails configuration without an all-image-layer actual-photo audit", () => {
    const parsed = JSON.parse(templateConfig);
    delete parsed.defaults[0].allImageLayersUseListingPhotos;
    expect(
      loadOrshotTemplateConfig("workspace-1", {
        ...configuredEnv,
        ORSHOT_TEMPLATE_MAPPINGS: JSON.stringify(parsed),
      }),
    ).toMatchObject({ configured: false, configurationError: true });
  });
});

describe("Orshot adapter", () => {
  it("uses only the official studio endpoint and data.content URL", async () => {
    const template = loadOrshotTemplateConfig(
      "workspace-1",
      configuredEnv,
    ).templates[0]!;
    const fetchImpl = vi.fn(
      async (
        _input: Parameters<typeof fetch>[0],
        _init?: Parameters<typeof fetch>[1],
      ) =>
        new Response(
          JSON.stringify({
            data: { content: "https://renders.example.com/result.png" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    await expect(
      renderOrshotImage(
        {
          jobId: "0f2be120-d363-4ec0-ab5d-e6db82cc050f",
          template,
          modifications: approvedModifications(),
        },
        { env: configuredEnv, fetchImpl },
      ),
    ).resolves.toBe("https://renders.example.com/result.png");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(ORSHOT_RENDER_ENDPOINT);
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer secret-test-key",
    );
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      templateId: 12345,
      modifications: {
        hero_photo: "https://photos.example.com/home.jpg",
        detail_photo: "https://photos.example.com/home.jpg",
        address: "123 Main St, Portland, OR",
        price: "$750,000",
        beds: "3 beds",
      },
      response: { type: "url", format: "png", includePages: [1] },
    });
    expect(body).not.toHaveProperty("publish");
    expect(JSON.stringify(body)).not.toMatch(/cutcli\.com\/api\/render/i);
  });

  it("rejects a successful response from an unapproved output host", async () => {
    const template = loadOrshotTemplateConfig(
      "workspace-1",
      configuredEnv,
    ).templates[0]!;
    await expect(
      renderOrshotImage(
        {
          jobId: randomUUID(),
          template,
          modifications: approvedModifications(),
        },
        {
          env: configuredEnv,
          fetchImpl: async () =>
            new Response(
              JSON.stringify({
                data: { content: "https://attacker.example/result.png" },
              }),
              { status: 200 },
            ),
        },
      ),
    ).rejects.toMatchObject({
      code: "provider_response_invalid",
      ambiguousProviderOutcome: true,
    });
  });

  it("rejects unknown keys and unapproved photo URLs before fetch", async () => {
    const template = loadOrshotTemplateConfig(
      "workspace-1",
      configuredEnv,
    ).templates[0]!;
    const fetchImpl = vi.fn(
      async (
        _input: Parameters<typeof fetch>[0],
        _init?: Parameters<typeof fetch>[1],
      ) => new Response(null, { status: 500 }),
    );
    await expect(
      renderOrshotImage(
        {
          jobId: randomUUID(),
          template,
          modifications: {
            ...approvedModifications(),
            hero_photo: "https://unapproved.example/home.jpg",
            "hero.prompt": "invent a mansion",
          },
        },
        { env: configuredEnv, fetchImpl },
      ),
    ).rejects.toMatchObject({
      code: "provider_rejected",
      ambiguousProviderOutcome: false,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    {
      status: 429,
      code: "provider_rate_limit",
      ambiguousProviderOutcome: false,
    },
    {
      status: 400,
      code: "provider_rejected",
      ambiguousProviderOutcome: false,
    },
    {
      status: 503,
      code: "provider_unavailable",
      ambiguousProviderOutcome: true,
    },
  ])(
    "classifies provider HTTP $status without exposing its body",
    async ({ status, code, ambiguousProviderOutcome }) => {
      const template = loadOrshotTemplateConfig(
        "workspace-1",
        configuredEnv,
      ).templates[0]!;
      await expect(
        renderOrshotImage(
          {
            jobId: randomUUID(),
            template,
            modifications: approvedModifications(),
          },
          {
            env: configuredEnv,
            fetchImpl: async () =>
              new Response("provider-private-details", {
                status,
                headers: status === 429 ? { "retry-after": "7" } : {},
              }),
          },
        ),
      ).rejects.toMatchObject({ code, ambiguousProviderOutcome });
    },
  );

  it("quarantines malformed success and transport-timeout outcomes", async () => {
    const template = loadOrshotTemplateConfig(
      "workspace-1",
      configuredEnv,
    ).templates[0]!;
    const input = {
      jobId: randomUUID(),
      template,
      modifications: approvedModifications(),
    };
    await expect(
      renderOrshotImage(input, {
        env: configuredEnv,
        fetchImpl: async () => new Response("not-json", { status: 200 }),
      }),
    ).rejects.toMatchObject({
      code: "provider_response_invalid",
      ambiguousProviderOutcome: true,
    });
    await expect(
      renderOrshotImage(input, {
        env: configuredEnv,
        fetchImpl: async () => {
          throw new DOMException("timed out", "TimeoutError");
        },
      }),
    ).rejects.toMatchObject({
      code: "provider_timeout",
      ambiguousProviderOutcome: true,
    });
  });
});

describe("tenant ownership, idempotency, quota, and cascades", () => {
  it("resolves only same-workspace listing media IDs", async () => {
    const owner = await seedListing(`social-owner-${randomUUID()}`);
    const stranger = await seedListing(`social-stranger-${randomUUID()}`);

    await expect(
      resolveOwnedListingMedia(
        owner.sql,
        owner.workspace.id,
        owner.listingId,
        [owner.mediaId],
        configuredEnv,
      ),
    ).resolves.toMatchObject({
      listing: { id: owner.listingId },
      photos: [{ id: owner.mediaId }],
    });
    await expect(
      resolveOwnedListingMedia(
        owner.sql,
        owner.workspace.id,
        owner.listingId,
        [stranger.mediaId],
        configuredEnv,
      ),
    ).resolves.toBeNull();
  });

  it("never exposes another workspace's job or rendered asset", async () => {
    const owner = await seedListing(`social-job-owner-${randomUUID()}`);
    const stranger = await seedListing(`social-job-stranger-${randomUUID()}`);
    const jobId = randomUUID();
    await createSocialMediaJob(owner.sql, {
      id: jobId,
      workspaceId: owner.workspace.id,
      userId: owner.userId,
      listingId: owner.listingId,
      kind: "image",
      templateKey: "modern",
      provider: "orshot",
      status: "processing",
      mediaIds: [owner.mediaId],
    });
    await owner.sql.query(
      `update social_media_jobs set unit_count = 1
        where id = $1 and workspace_id = $2`,
      [jobId, owner.workspace.id],
    );
    await expect(
      completeSocialMediaImageJob(owner.sql, {
        workspaceId: owner.workspace.id,
        jobId,
        contentUrl: "https://renders.example.com/result.png",
      }),
    ).resolves.toBe(true);
    await expect(
      getSocialMediaJob(
        owner.sql,
        owner.workspace.id,
        owner.userId,
        jobId,
      ),
    ).resolves.toMatchObject({
      id: jobId,
      asset: { contentUrl: "https://renders.example.com/result.png" },
    });
    await expect(
      getSocialMediaJob(
        stranger.sql,
        stranger.workspace.id,
        stranger.userId,
        jobId,
      ),
    ).resolves.toBeNull();
  });

  it("fails closed without verified billing and atomically enforces a hard cap", async () => {
    const seeded = await seedListing(`social-quota-${randomUUID()}`);
    await expect(
      getSocialMediaEntitlement(seeded.sql, seeded.workspace.id, configuredEnv),
    ).resolves.toMatchObject({ enabled: false, status: "unavailable" });

    const now = new Date();
    const periodStart = new Date(now.valueOf() - 60_000).toISOString();
    const periodEnd = new Date(now.valueOf() + 86_400_000).toISOString();
    await seeded.sql.query(
      `insert into workspace_entitlements (
         workspace_id, product, status, stripe_customer_id,
         stripe_subscription_id, stripe_price_id, included_units,
         hard_limit_units, current_period_start, current_period_end
       ) values ($1,'social_media','active','cus_test','sub_test_' || $1,
         'price_test',5,5,$2,$3)`,
      [seeded.workspace.id, periodStart, periodEnd],
    );
    const entitlement = await getSocialMediaEntitlement(
      seeded.sql,
      seeded.workspace.id,
      configuredEnv,
      now,
    );
    expect(entitlement).toMatchObject({ enabled: true, limitUnits: 5 });
    const jobId = randomUUID();
    await createSocialMediaJob(seeded.sql, {
      id: jobId,
      workspaceId: seeded.workspace.id,
      userId: seeded.userId,
      listingId: seeded.listingId,
      kind: "image",
      templateKey: "modern",
      provider: "orshot",
      status: "processing",
      mediaIds: [seeded.mediaId],
    });
    const reservations = await Promise.all([
      reserveSocialMediaQuotaAndChargeJob(
        seeded.sql,
        seeded.workspace.id,
        jobId,
        entitlement,
      ),
      reserveSocialMediaQuotaAndChargeJob(
        seeded.sql,
        seeded.workspace.id,
        jobId,
        entitlement,
      ),
    ]);
    expect(reservations.filter(Boolean)).toHaveLength(1);
    await expect(
      reserveSocialMediaQuotaAndChargeJob(
        seeded.sql,
        seeded.workspace.id,
        jobId,
        entitlement,
      ),
    ).resolves.toBe(false);
    await expect(
      seeded.sql.query<{ used_units: number }>(
        `select used_units from social_media_quota_buckets
          where workspace_id = $1 and period_start = $2`,
        [seeded.workspace.id, entitlement.periodStart],
      ),
    ).resolves.toEqual([{ used_units: 1 }]);
    await expect(
      seeded.sql.query<{ unit_count: number }>(
        `select unit_count from social_media_jobs
          where id = $1 and workspace_id = $2`,
        [jobId, seeded.workspace.id],
      ),
    ).resolves.toEqual([{ unit_count: 1 }]);
  });

  it("rechecks billing inside reservation after an entitlement is canceled", async () => {
    const seeded = await seedListing(`social-revoked-${randomUUID()}`);
    const now = new Date();
    const periodStart = new Date(now.valueOf() - 60_000).toISOString();
    const periodEnd = new Date(now.valueOf() + 86_400_000).toISOString();
    await seeded.sql.query(
      `insert into workspace_entitlements (
         workspace_id, product, status, stripe_customer_id,
         stripe_subscription_id, stripe_price_id, included_units,
         hard_limit_units, current_period_start, current_period_end
       ) values ($1,'social_media','active','cus_test','sub_test_' || $1,
         'price_test',5,5,$2,$3)`,
      [seeded.workspace.id, periodStart, periodEnd],
    );
    const entitlement = await getSocialMediaEntitlement(
      seeded.sql,
      seeded.workspace.id,
      configuredEnv,
      now,
    );
    const jobId = randomUUID();
    await createSocialMediaJob(seeded.sql, {
      id: jobId,
      workspaceId: seeded.workspace.id,
      userId: seeded.userId,
      listingId: seeded.listingId,
      kind: "image",
      templateKey: "modern",
      provider: "orshot",
      status: "processing",
      mediaIds: [seeded.mediaId],
    });
    await seeded.sql.query(
      `update workspace_entitlements set status = 'canceled'
        where workspace_id = $1 and product = 'social_media'`,
      [seeded.workspace.id],
    );
    await expect(
      reserveSocialMediaQuotaAndChargeJob(
        seeded.sql,
        seeded.workspace.id,
        jobId,
        entitlement,
      ),
    ).resolves.toBe(false);
    await expect(
      seeded.sql.query<{ unit_count: number }>(
        `select unit_count from social_media_jobs
          where id = $1 and workspace_id = $2`,
        [jobId, seeded.workspace.id],
      ),
    ).resolves.toEqual([{ unit_count: 0 }]);
  });

  it("locks both job and entitlement rows in the reservation statement", async () => {
    const query = vi.fn(async (_text: string, _params?: unknown[]) => [
      { reserved: false },
    ]);
    const sql = { query } as unknown as Sql;
    await reserveSocialMediaQuotaAndChargeJob(sql, "workspace-1", randomUUID(), {
      enabled: true,
      status: "active",
      periodStart: new Date(Date.now() - 1_000).toISOString(),
      periodEnd: new Date(Date.now() + 60_000).toISOString(),
      limitUnits: 5,
      usedUnits: 0,
      message: "Available",
    });
    expect(query).toHaveBeenCalledOnce();
    expect(String(query.mock.calls[0]?.[0])).toMatch(
      /for update of j, e/i,
    );
  });

  it("quarantines a stale job and rejects a late completion asset", async () => {
    const userId = `social-stale-${randomUUID()}`;
    const seeded = await seedListing(userId);
    const jobId = randomUUID();
    await createSocialMediaJob(seeded.sql, {
      id: jobId,
      workspaceId: seeded.workspace.id,
      userId,
      listingId: seeded.listingId,
      kind: "image",
      templateKey: "modern",
      provider: "orshot",
      status: "processing",
      mediaIds: [seeded.mediaId],
    });
    await seeded.sql.query(
      `update social_media_jobs
          set updated_at = now() - interval '5 minutes'
        where id = $1 and workspace_id = $2`,
      [jobId, seeded.workspace.id],
    );
    await expect(
      reconcileRecentSocialMediaImageJob(
        seeded.sql,
        seeded.workspace.id,
        userId,
      ),
    ).resolves.toMatchObject({
      id: jobId,
      status: "attention_required",
      errorCode: "provider_timeout",
      mediaIds: [seeded.mediaId],
      asset: null,
    });
    await expect(
      completeSocialMediaImageJob(seeded.sql, {
        workspaceId: seeded.workspace.id,
        jobId,
        contentUrl: "https://renders.example.com/late-result.png",
      }),
    ).resolves.toBe(false);
    await expect(
      seeded.sql.query<{ count: number }>(
        `select count(*)::int as count from social_media_assets
          where job_id = $1 and workspace_id = $2`,
        [jobId, seeded.workspace.id],
      ),
    ).resolves.toEqual([{ count: 0 }]);
  });

  it("rolls back the job claim when media attachment fails", async () => {
    const userId = `social-atomic-${randomUUID()}`;
    const seeded = await seedListing(userId);
    const jobId = randomUUID();
    await expect(
      createSocialMediaJob(seeded.sql, {
        id: jobId,
        workspaceId: seeded.workspace.id,
        userId,
        listingId: seeded.listingId,
        kind: "image",
        templateKey: "modern",
        provider: "orshot",
        status: "processing",
        mediaIds: [`missing-${randomUUID()}`],
      }),
    ).rejects.toBeDefined();
    await expect(
      seeded.sql.query<{ count: number }>(
        `select count(*)::int as count from social_media_jobs
          where id = $1 and workspace_id = $2`,
        [jobId, seeded.workspace.id],
      ),
    ).resolves.toEqual([{ count: 0 }]);
  });

  it("permits only one concurrent active job for an exact image intent", async () => {
    const userId = `social-active-${randomUUID()}`;
    const seeded = await seedListing(userId);
    const base = {
      workspaceId: seeded.workspace.id,
      userId,
      listingId: seeded.listingId,
      kind: "image" as const,
      templateKey: "modern",
      provider: "orshot" as const,
      status: "processing" as const,
      mediaIds: [seeded.mediaId],
    };
    const claims = await Promise.all([
      createSocialMediaJob(seeded.sql, { ...base, id: randomUUID() }),
      createSocialMediaJob(seeded.sql, { ...base, id: randomUUID() }),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    await expect(
      seeded.sql.query<{ count: number }>(
        `select count(*)::int as count from social_media_jobs
          where workspace_id = $1 and user_id = $2
            and status = 'processing'`,
        [seeded.workspace.id, userId],
      ),
    ).resolves.toEqual([{ count: 1 }]);
  });

  it("allows explicit replacement after terminal failure but not uncertainty", async () => {
    const userId = `social-terminal-${randomUUID()}`;
    const seeded = await seedListing(userId);
    const base = {
      workspaceId: seeded.workspace.id,
      userId,
      listingId: seeded.listingId,
      kind: "image" as const,
      templateKey: "modern",
      provider: "orshot" as const,
      status: "processing" as const,
      mediaIds: [seeded.mediaId],
    };
    const failedId = randomUUID();
    await expect(
      createSocialMediaJob(seeded.sql, { ...base, id: failedId }),
    ).resolves.toBe(true);
    await markSocialMediaJob(seeded.sql, seeded.workspace.id, failedId, {
      status: "failed",
      errorCode: "provider_rate_limit",
      errorMessage: "Rate limited before a render was accepted.",
    });
    const uncertainId = randomUUID();
    await expect(
      createSocialMediaJob(seeded.sql, { ...base, id: uncertainId }),
    ).resolves.toBe(true);
    await markSocialMediaJob(seeded.sql, seeded.workspace.id, uncertainId, {
      status: "attention_required",
      errorCode: "provider_timeout",
      errorMessage: "Provider outcome is uncertain.",
    });
    await expect(
      createSocialMediaJob(seeded.sql, { ...base, id: randomUUID() }),
    ).resolves.toBe(false);

    const blockedBase = { ...base, templateKey: "classic" };
    const blockedId = randomUUID();
    await expect(
      createSocialMediaJob(seeded.sql, { ...blockedBase, id: blockedId }),
    ).resolves.toBe(true);
    await markSocialMediaJob(seeded.sql, seeded.workspace.id, blockedId, {
      status: "blocked",
      errorCode: "quota_exhausted",
      errorMessage: "The period quota is exhausted.",
    });
    await expect(
      createSocialMediaJob(seeded.sql, {
        ...blockedBase,
        id: randomUUID(),
      }),
    ).resolves.toBe(true);
  });

  it("claims one UUID once and permits a whole workspace cascade", async () => {
    const userId = `social-delete-${randomUUID()}`;
    const seeded = await seedListing(userId);
    const jobId = randomUUID();
    const input = {
      id: jobId,
      workspaceId: seeded.workspace.id,
      userId,
      listingId: seeded.listingId,
      kind: "image" as const,
      templateKey: "modern",
      provider: "orshot" as const,
      status: "processing" as const,
      mediaIds: [seeded.mediaId],
    };
    await expect(createSocialMediaJob(seeded.sql, input)).resolves.toBe(true);
    await expect(createSocialMediaJob(seeded.sql, input)).resolves.toBe(false);
    await expect(
      createSocialMediaJob(seeded.sql, { ...input, id: randomUUID() }),
    ).resolves.toBe(false);
    await expect(
      seeded.sql.query<{ count: number }>(
        `select count(*)::int as count from social_media_jobs
          where workspace_id = $1 and user_id = $2
            and status = 'processing'`,
        [seeded.workspace.id, userId],
      ),
    ).resolves.toEqual([{ count: 1 }]);
    await expect(
      seeded.sql.query("delete from workspaces where id = $1", [
        seeded.workspace.id,
      ]),
    ).resolves.toBeDefined();
    await expect(
      seeded.sql.query<{ count: number }>(
        "select count(*)::int as count from social_media_jobs where id = $1",
        [jobId],
      ),
    ).resolves.toEqual([{ count: 0 }]);
  });
});

describe("social video hold point", () => {
  it("is deterministic, performs no provider call, and returns no media URL", async () => {
    const provider = new SetupRequiredVideoProvider();
    const input = {
      jobId: "3cb5f56d-2b0b-4f0e-9c91-a4cfdad142b0",
      listingId: "listing-1",
      mediaIds: ["media-1", "media-2"],
    };
    const first = await provider.prepare(input);
    const second = await provider.prepare(input);
    expect(second).toEqual(first);
    expect(first.status).toBe("setup_required");
    expect(first).not.toHaveProperty("videoUrl");
    expect(JSON.stringify(first)).not.toContain(".mp4");
  });
});

describe("social image request identity", () => {
  it("reuses a UUID across transport retries until the billable intent changes", () => {
    let sequence = 0;
    const createRequestId = () => `request-${++sequence}`;
    const intent = {
      listingId: "listing-1",
      templateKey: "modern",
      mediaIds: ["media-lead", "media-detail"],
    };
    const first = requestIdentityForSocialImage(
      null,
      intent,
      createRequestId,
    );
    const transportRetry = requestIdentityForSocialImage(
      first,
      { ...intent, mediaIds: [...intent.mediaIds] },
      createRequestId,
    );
    expect(transportRetry).toBe(first);
    expect(sequence).toBe(1);

    const changedOrder = requestIdentityForSocialImage(
      first,
      { ...intent, mediaIds: [...intent.mediaIds].reverse() },
      createRequestId,
    );
    expect(changedOrder.requestId).toBe("request-2");
    expect(changedOrder).not.toBe(first);
  });

  it("persists the UUID for refresh recovery and clears only explicitly", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const identity = {
      intentKey: '["listing-1","modern","media-1"]',
      requestId: "3cb5f56d-2b0b-4f0e-9c91-a4cfdad142b0",
    };
    persistSocialImageRequestIdentity(storage, identity);
    expect(readSocialImageRequestIdentity(storage)).toEqual(identity);
    clearSocialImageRequestIdentity(storage);
    expect(readSocialImageRequestIdentity(storage)).toBeNull();
  });
});
