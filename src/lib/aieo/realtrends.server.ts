/**
 * Independent production-source adapter — RealTrends Verified.
 *
 * Replaces the curated acceptance fixture with a live, cached ingestion path.
 * Two modes, both fail closed:
 *
 * - Enterprise API (`REALTRENDS_API_URL` + `REALTRENDS_API_KEY`): a normalized
 *   JSON contract for the licensed RealTrends data feed.
 * - Public profile fallback: fetches the agent's RealTrends Verified profile
 *   page over `safeFetch` and parses year-scoped sales volume and sides.
 *
 * Observations are cached in `citelock_production_observations` with a TTL so
 * repeated scans never hammer the provider. A failed fetch or parse yields an
 * `unavailable` outcome and zero evidence — never a fabricated claim.
 */
import { randomUUID } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";
import { readResponseText, safeFetch } from "@/lib/safe-outbound-url.server";
import type { CiteEvidence } from "./types";
import type { CiteSourceOutcome } from "./scan-types";
import { isRealTrendsProfileUrl, sanitizeCiteLockPublicUrl } from "./scan-types";

const SOURCE_LABEL = "RealTrends Verified";
const DEFAULT_CACHE_HOURS = 24;

export type ProductionObservation = {
  claimScope: string;
  field: "transaction_volume" | "transaction_sides";
  value: string;
  note?: string;
};

export type ProductionFetchResult = {
  evidence: CiteEvidence[];
  outcomes: CiteSourceOutcome[];
};

function moneyToNumber(raw: string, unit?: string): number {
  const amount = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(amount)) return Number.NaN;
  const multiplier = /^(?:b|bn|billion)$/i.test(unit || "")
    ? 1_000_000_000
    : /^(?:m|mm|million)$/i.test(unit || "")
      ? 1_000_000
      : /^(?:k|thousand)$/i.test(unit || "")
        ? 1_000
        : 1;
  return Math.round(amount * multiplier);
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function htmlLines(html: string): string[] {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<\/?(?:tr|td|th|div|p|br|li|h\d|span|section)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * Parse year-scoped production figures from a RealTrends Verified profile.
 * Only figures with an unambiguous year and dollar amount are emitted; a page
 * we cannot read deterministically yields no observations at all.
 */
export function parseRealTrendsProduction(
  html: string,
): ProductionObservation[] {
  const lines = htmlLines(html);
  const observations = new Map<string, ProductionObservation>();
  const sidesByYear = new Map<string, number>();
  let contextYear: string | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const yearMatch = line.match(/\b(20\d{2})\b/);
    if (yearMatch) contextYear = yearMatch[1];

    if (/(?:sales\s*)?volume/i.test(line)) {
      const window = [line, lines[index + 1] || "", lines[index + 2] || ""].join(
        " ",
      );
      const amount = window.match(
        /\$\s*([\d][\d,.]*)\s*(billion|million|thousand|bn|mm|[bmk])?\b/i,
      );
      const year =
        window.match(/\b(20\d{2})\b/)?.[1] || (yearMatch ? yearMatch[1] : contextYear);
      if (amount && year) {
        const numeric = moneyToNumber(amount[1]!, amount[2]);
        if (Number.isFinite(numeric) && numeric > 0) {
          const scope = `sales-volume:${year}:full-year`;
          observations.set(scope, {
            claimScope: scope,
            field: "transaction_volume",
            value: `$${numeric.toLocaleString("en-US")} in ${year}`,
          });
        }
      }
    }

    if (/(?:transaction\s*)?sides/i.test(line)) {
      const window = [line, lines[index + 1] || ""].join(" ");
      const year = window.match(/\b(20\d{2})\b/)?.[1] || contextYear;
      // Years and dollar figures must never be misread as a sides count.
      const sides = window
        .replace(/\b20\d{2}\b/g, " ")
        .replace(/\$\s*[\d,.]+/g, " ")
        .match(/\b(\d{1,4}(?:\.\d)?)\b(?!\s*%)/);
      if (sides && year) {
        const count = Number(sides[1]);
        if (Number.isFinite(count) && count > 0 && count < 10_000)
          sidesByYear.set(year, count);
      }
    }
  }

  for (const [year, count] of sidesByYear) {
    const scope = `sales-sides:${year}:full-year`;
    observations.set(scope, {
      claimScope: scope,
      field: "transaction_sides",
      value: `${count} sides in ${year}`,
    });
  }
  return [...observations.values()].sort((a, b) =>
    a.claimScope.localeCompare(b.claimScope),
  );
}

function parseEnterprisePayload(payload: unknown): ProductionObservation[] {
  const entries = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object"
      ? Array.isArray((payload as { results?: unknown }).results)
        ? ((payload as { results: unknown[] }).results)
        : [payload]
      : [];
  const observations: ProductionObservation[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const year = String(row.year ?? "").match(/^20\d{2}$/)?.[0];
    if (!year) continue;
    const volume = Number(row.salesVolumeUsd ?? row.sales_volume_usd);
    if (Number.isFinite(volume) && volume > 0) {
      observations.push({
        claimScope: `sales-volume:${year}:full-year`,
        field: "transaction_volume",
        value: `$${Math.round(volume).toLocaleString("en-US")} in ${year}`,
      });
    }
    const sides = Number(row.transactionSides ?? row.transaction_sides);
    if (Number.isFinite(sides) && sides > 0) {
      observations.push({
        claimScope: `sales-sides:${year}:full-year`,
        field: "transaction_sides",
        value: `${Math.round(sides)} sides in ${year}`,
      });
    }
  }
  return observations;
}

type CachedRow = {
  claim_scope: string;
  field: string;
  value: string;
  note: string | null;
  observed_at: string | Date;
};

function toEvidence(
  observations: { claimScope: string; field: string; value: string; note?: string | null }[],
  profileUrl: string,
  observedAt: string,
): CiteEvidence[] {
  return observations.map((observation) => ({
    id: `realtrends:${observation.claimScope}`,
    subject: "agent" as const,
    field: observation.field,
    value: observation.value,
    claimScope: observation.claimScope,
    sourceLabel: SOURCE_LABEL,
    sourceTier: "independent" as const,
    status: "verified" as const,
    sourceUrl: profileUrl,
    observedAt,
    note: observation.note || undefined,
  }));
}

export type RealTrendsDependencies = {
  sql?: Sql;
  now?: () => string;
  fetchText?: (url: string) => Promise<string>;
  fetchEnterprise?: (url: string, key: string) => Promise<unknown>;
};

async function defaultFetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const { response, finalUrl } = await safeFetch(
      url,
      {
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent":
            "CiteLock-Verification/2.0 (+https://github.com/Gnoscenti/realestate-ai)",
        },
      },
      { allowCrossOriginRedirects: false, maxRedirects: 2 },
    );
    if (!response.ok || !isRealTrendsProfileUrl(finalUrl.toString()))
      throw new Error("production_source_unavailable");
    return readResponseText(response, 2_000_000);
  } finally {
    clearTimeout(timer);
  }
}

async function defaultFetchEnterprise(
  url: string,
  key: string,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const { response } = await safeFetch(
      url,
      {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${key}`,
        },
      },
      { allowCrossOriginRedirects: false, maxRedirects: 0 },
    );
    if (!response.ok) throw new Error("production_source_unavailable");
    const text = await readResponseText(response, 2_000_000);
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

function cacheHours(): number {
  const raw = Number(process.env.REALTRENDS_CACHE_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CACHE_HOURS;
}

/**
 * Fetch independent production observations for one RealTrends profile URL,
 * serving from the durable cache inside the TTL window.
 */
export async function fetchRealTrendsProduction(
  input: { profileUrl: string; observedAt: string },
  dependencies: RealTrendsDependencies = {},
): Promise<ProductionFetchResult> {
  const profileUrl = sanitizeCiteLockPublicUrl(input.profileUrl);
  if (!profileUrl || !isRealTrendsProfileUrl(profileUrl)) {
    return {
      evidence: [],
      outcomes: [
        {
          source: "production",
          status: "unavailable",
          label: "The production-source profile URL is not a RealTrends profile",
          code: "production_source_invalid_url",
        },
      ],
    };
  }
  const sql = dependencies.sql || (await getSql());
  const nowIso = (dependencies.now || (() => new Date().toISOString()))();

  const cached = await sql.query<CachedRow>(
    `select claim_scope, field, value, note, observed_at
       from citelock_production_observations
      where profile_url = $1 and expires_at > $2
      order by observed_at desc, claim_scope`,
    [profileUrl, nowIso],
  );
  if (cached.length) {
    const latest = new Map<string, CachedRow>();
    for (const row of cached)
      if (!latest.has(row.claim_scope)) latest.set(row.claim_scope, row);
    const rows = [...latest.values()];
    const observedAt =
      rows[0]!.observed_at instanceof Date
        ? rows[0]!.observed_at.toISOString()
        : String(rows[0]!.observed_at);
    return {
      evidence: toEvidence(
        rows.map((row) => ({
          claimScope: row.claim_scope,
          field: row.field,
          value: row.value,
          note: row.note,
        })),
        profileUrl,
        observedAt,
      ),
      outcomes: [
        {
          source: "production",
          status: "verified",
          label: `${SOURCE_LABEL} production figures served from the verified cache`,
          url: profileUrl,
        },
      ],
    };
  }

  let observations: ProductionObservation[];
  try {
    const enterpriseUrl = process.env.REALTRENDS_API_URL?.trim();
    const enterpriseKey = process.env.REALTRENDS_API_KEY?.trim();
    if (enterpriseUrl && enterpriseKey) {
      const endpoint = new URL(enterpriseUrl);
      endpoint.searchParams.set("profileUrl", profileUrl);
      const payload = await (dependencies.fetchEnterprise ||
        defaultFetchEnterprise)(endpoint.toString(), enterpriseKey);
      observations = parseEnterprisePayload(payload);
    } else {
      const html = await (dependencies.fetchText || defaultFetchText)(
        profileUrl,
      );
      observations = parseRealTrendsProduction(html);
    }
  } catch {
    return {
      evidence: [],
      outcomes: [
        {
          source: "production",
          status: "unavailable",
          label: `${SOURCE_LABEL} production verification was unavailable`,
          url: profileUrl,
          code: "production_source_unavailable",
        },
      ],
    };
  }

  if (!observations.length) {
    return {
      evidence: [],
      outcomes: [
        {
          source: "production",
          status: "unavailable",
          label: `${SOURCE_LABEL} returned no year-scoped production figures`,
          url: profileUrl,
          code: "production_source_empty",
        },
      ],
    };
  }

  const expiresAt = new Date(
    Date.parse(nowIso) + cacheHours() * 3_600_000,
  ).toISOString();
  for (const observation of observations) {
    await sql.query(
      `insert into citelock_production_observations (
         id, profile_url, source_label, claim_scope, field, value, note,
         observed_at, expires_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        randomUUID(),
        profileUrl,
        SOURCE_LABEL,
        observation.claimScope,
        observation.field,
        observation.value,
        observation.note || null,
        nowIso,
        expiresAt,
      ],
    );
  }

  return {
    evidence: toEvidence(observations, profileUrl, nowIso),
    outcomes: [
      {
        source: "production",
        status: "verified",
        label: `${SOURCE_LABEL} production figures fetched and cached`,
        url: profileUrl,
      },
    ],
  };
}
