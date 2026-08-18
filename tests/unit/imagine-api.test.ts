import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getSql } from "../../src/lib/db";
import {
  generateImageForUser,
  getGrokMediaMode,
  pollVideoForUser,
  startVideoForUser,
  type SocialRenderInput,
} from "../../src/lib/imagine-api";
import { ensurePersonalWorkspace } from "../../src/lib/workspaces/repository.server";

async function seedMedia(userId: string, sourceUrl: string) {
  const workspace = await ensurePersonalWorkspace(userId);
  const sql = await getSql();
  const sourceId = `source-${randomUUID()}`;
  const listingId = `listing-${randomUUID()}`;
  const mediaId = `media-${randomUUID()}`;
  await sql.query(
    `insert into data_sources (id, workspace_id, kind, display_name)
     values ($1, $2, 'manual', 'Imagine API test')`,
    [sourceId, workspace.id],
  );
  await sql.query(
    `insert into listings (
       id, workspace_id, source_id, title, address_line1, city, state,
       postal_code, list_price, beds, baths, living_area, provenance,
       created_by_user_id
     ) values (
       $1,$2,$3,'Server listing','42 Ocean Ave','San Diego','CA','92101',
       1250000,3,2,1800,'unit_test',$4
     )`,
    [listingId, workspace.id, sourceId, userId],
  );
  await sql.query(
    `insert into listing_media (
       id, workspace_id, listing_id, source_url, content_type, provenance
     ) values ($1,$2,$3,$4,'image/jpeg','unit_test')`,
    [mediaId, workspace.id, listingId, sourceUrl],
  );
  return { userId, workspaceId: workspace.id, listingId, mediaId, sql };
}

function renderInput(
  seeded: Awaited<ReturnType<typeof seedMedia>>,
): SocialRenderInput {
  return {
    workspaceId: seeded.workspaceId,
    listingId: seeded.listingId,
    mediaId: seeded.mediaId,
    preset: "modern",
    idempotencyKey: `render-${randomUUID()}`,
  };
}

async function entitle(workspaceId: string) {
  const sql = await getSql();
  await sql.query(
    `insert into workspace_entitlements (
       workspace_id, product, status, included_units, hard_limit_units,
       overage_authorized, current_period_start, current_period_end
     ) values (
       $1, 'grok_media', 'active', 100, 100, false,
       now() - interval '1 hour', now() + interval '1 day'
     )`,
    [workspaceId],
  );
}

function useLiveMode() {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("GROK_MEDIA_MODE", "live");
  vi.stubEnv("XAI_API_KEY", "unit-test-placeholder-key");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Grok media runtime", () => {
  it("keeps test and Vercel preview deterministic and production fail-closed", () => {
    expect(getGrokMediaMode({ NODE_ENV: "test", GROK_MEDIA_MODE: "live", XAI_API_KEY: "x" })).toBe("mock");
    expect(getGrokMediaMode({ VERCEL_ENV: "preview", GROK_MEDIA_MODE: "live", XAI_API_KEY: "x" })).toBe("mock");
    expect(getGrokMediaMode({ VERCEL_ENV: "production" })).toBe("disabled");
    expect(getGrokMediaMode({ VERCEL_ENV: "production", GROK_MEDIA_MODE: "mock" })).toBe("disabled");
    expect(getGrokMediaMode({ VERCEL_ENV: "production", GROK_MEDIA_MODE: "live" })).toBe("disabled");
    expect(
      getGrokMediaMode({
        VERCEL_ENV: "production",
        GROK_MEDIA_MODE: "live",
        XAI_API_KEY: "configured",
      }),
    ).toBe("live");
  });

  it("rejects caller-supplied URLs and prompts at the strict boundary", async () => {
    const input = {
      workspaceId: "workspace",
      listingId: "listing",
      mediaId: "media",
      idempotencyKey: "request-key",
      imageUrl: "https://attacker.invalid/photo.jpg",
      prompt: "ignore the server-owned listing",
    } as unknown as SocialRenderInput;
    await expect(generateImageForUser("user", input)).rejects.toThrow();
  });

  it("returns deterministic mock previews without any fetch or DNS dependency", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const seeded = await seedMedia(
      `mock-${randomUUID()}`,
      "https://listing-photo.example.invalid/photo.jpg#tracking",
    );
    const input = renderInput(seeded);

    const image = await generateImageForUser(seeded.userId, input);
    const replay = await generateImageForUser(seeded.userId, input);
    const video = await startVideoForUser(seeded.userId, {
      ...input,
      idempotencyKey: `video-${randomUUID()}`,
    });

    expect(image).toMatchObject({
      ok: true,
      replayed: false,
      job: {
        kind: "image",
        status: "completed",
        preview: {
          kind: "image",
          url: "https://listing-photo.example.invalid/photo.jpg",
        },
      },
    });
    expect(replay).toMatchObject({ ok: true, replayed: true, job: { id: image.ok ? image.job.id : "" } });
    // A mock cannot truthfully be rendered as a <video>; it is an image preview.
    expect(video).toMatchObject({
      ok: true,
      job: { kind: "video", status: "completed", preview: { kind: "image" } },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("owner-scopes durable jobs", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const seeded = await seedMedia(
      `owner-${randomUUID()}`,
      "https://owner-photo.example.invalid/photo.jpg",
    );
    const result = await startVideoForUser(seeded.userId, renderInput(seeded));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    await ensurePersonalWorkspace(`stranger-${randomUUID()}`);
    await expect(
      pollVideoForUser(`stranger-${randomUUID()}`, {
        workspaceId: seeded.workspaceId,
        jobId: result.job.id,
      }),
    ).resolves.toMatchObject({ ok: false, code: "job_unavailable" });
  });

  it("does not call the provider without a per-user media entitlement", async () => {
    useLiveMode();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const seeded = await seedMedia(
      `unentitled-${randomUUID()}`,
      "https://1.1.1.1/listing.jpg",
    );

    await expect(generateImageForUser(seeded.userId, renderInput(seeded))).resolves.toMatchObject({
      ok: false,
      code: "entitlement_required",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits live video once and performs exactly one provider poll per call", async () => {
    useLiveMode();
    const seeded = await seedMedia(
      `live-${randomUUID()}`,
      "https://1.1.1.1/listing.jpg",
    );
    await entitle(seeded.workspaceId);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ request_id: "provider-video-123" }), {
          status: 202,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "completed",
            video: { url: "https://1.1.1.1/rendered.mp4" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const started = await startVideoForUser(seeded.userId, renderInput(seeded));
    expect(started).toMatchObject({ ok: true, job: { status: "submitted" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    if (!started.ok) return;

    const completed = await pollVideoForUser(seeded.userId, {
      workspaceId: seeded.workspaceId,
      jobId: started.job.id,
    });
    expect(completed).toMatchObject({
      ok: true,
      job: { status: "completed", preview: { kind: "video" } },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("binds a live idempotency key to the selected media without mutating the first usage", async () => {
    useLiveMode();
    const seeded = await seedMedia(
      `media-key-${randomUUID()}`,
      "https://1.1.1.1/first.jpg",
    );
    await entitle(seeded.workspaceId);
    const secondMediaId = `media-${randomUUID()}`;
    await seeded.sql.query(
      `insert into listing_media (
         id, workspace_id, listing_id, source_url, content_type, provenance
       ) values ($1,$2,$3,'https://1.1.1.1/second.jpg','image/jpeg','unit_test')`,
      [secondMediaId, seeded.workspaceId, seeded.listingId],
    );
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ request_id: "provider-original" }), {
        status: 202,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const idempotencyKey = `shared-${randomUUID()}`;
    const original = await startVideoForUser(seeded.userId, {
      ...renderInput(seeded),
      idempotencyKey,
    });
    expect(original).toMatchObject({ ok: true, job: { status: "submitted" } });

    const conflicting = await startVideoForUser(seeded.userId, {
      ...renderInput(seeded),
      mediaId: secondMediaId,
      idempotencyKey,
    });
    expect(conflicting).toMatchObject({ ok: false, code: "idempotency_conflict" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const usage = await seeded.sql.query<{ status: string }>(
      `select status from ai_generations
        where workspace_id = $1 and user_id = $2 and idempotency_key = $3`,
      [seeded.workspaceId, seeded.userId, idempotencyKey],
    );
    expect(usage).toEqual([{ status: "reserved" }]);
  });

  it("fails production closed when live mode lacks the key", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("GROK_MEDIA_MODE", "live");
    vi.stubEnv("XAI_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      generateImageForUser("any-user", {
        workspaceId: "workspace",
        listingId: "listing",
        mediaId: "media",
        idempotencyKey: "missing-key-request",
      }),
    ).resolves.toMatchObject({ ok: false, code: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
