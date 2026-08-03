/**
 * Multi-platform MLS catalog.
 * Maps regional boards → API platforms (RESO Web API family).
 */

export type MlsPlatformId =
  | "bridge"
  | "trestle"
  | "spark"
  | "mls_grid"
  | "reso_web"
  | "website"
  | "csv";

export type MlsBoardId =
  | "sandicor"
  | "crmls"
  | "bright"
  | "onekey"
  | "nwmls"
  | "ntreis"
  | "actris"
  | "miami"
  | "mred"
  | "recolorado"
  | "other";

export type MlsPlatformMeta = {
  id: MlsPlatformId;
  label: string;
  short: string;
  blurb: string;
  /** Typical RESO / OData base pattern */
  defaultBaseUrl?: string;
  docsUrl?: string;
  auth: "oauth2" | "bearer" | "basic" | "none";
  /** Field notes for agent setup */
  setupHints: string[];
};

export type MlsBoardMeta = {
  id: MlsBoardId;
  label: string;
  region: string;
  prefix: string;
  /** Preferred live platforms for this board */
  platforms: MlsPlatformId[];
  /** Common RESO endpoint examples (placeholders agents replace with their vendor URL) */
  endpointHints: Partial<Record<MlsPlatformId, string>>;
};

export const MLS_PLATFORMS: MlsPlatformMeta[] = [
  {
    id: "bridge",
    label: "Bridge Interactive",
    short: "Bridge",
    blurb: "CoreLogic Bridge — RESO Web API for many US boards",
    defaultBaseUrl: "https://api.bridgedataoutput.com/api/v2/OData",
    docsUrl: "https://bridgedataoutput.com/",
    auth: "bearer",
    setupHints: [
      "Paste your Bridge server token (or OAuth access token)",
      "Dataset path often looks like /{dataset}/Property",
      "Filter by ListAgentMlsId or ListAgentKey",
    ],
  },
  {
    id: "trestle",
    label: "Trestle (CoreLogic)",
    short: "Trestle",
    blurb: "Trestle RESO Web API used by many associations",
    defaultBaseUrl: "https://api-trestle.corelogic.com/trestle/odata",
    docsUrl: "https://trestle-documentation.corelogic.com/",
    auth: "oauth2",
    setupHints: [
      "Client ID + Client Secret from your Trestle app",
      "Access token via OAuth client_credentials",
      "Query Property with StandardStatus and agent filters",
    ],
  },
  {
    id: "spark",
    label: "Spark API (FBS)",
    short: "Spark",
    blurb: "Flexmls / Spark API — common for FBS-powered MLSs",
    defaultBaseUrl: "https://sparkapi.com/v1",
    docsUrl: "https://sparkplatform.com/docs/overview/api",
    auth: "oauth2",
    setupHints: [
      "OpenID / OAuth token from Spark",
      "Listings endpoint varies by MLS identity",
      "Map Spark fields → RESO-like inventory in sync",
    ],
  },
  {
    id: "mls_grid",
    label: "MLS Grid",
    short: "MLS Grid",
    blurb: "MLS Grid RESO Web API for participating Midwestern / national feeds",
    defaultBaseUrl: "https://api.mlsgrid.com/v2",
    docsUrl: "https://www.mlsgrid.com/",
    auth: "bearer",
    setupHints: [
      "Bearer token from MLS Grid developer portal",
      "RESO Property resource with Replication or query",
      "Respect replication OriginatingSystemName filters",
    ],
  },
  {
    id: "reso_web",
    label: "Generic RESO Web API",
    short: "RESO",
    blurb: "Any board exposing RESO Web API / OData Property",
    auth: "bearer",
    setupHints: [
      "Base URL ending at OData service root",
      "Access token or API key as Bearer",
      "Optional ListAgentMlsId filter",
    ],
  },
  {
    id: "website",
    label: "Agent website scrape",
    short: "Website",
    blurb: "Fallback when MLS credentials are not connected",
    auth: "none",
    setupHints: ["Uses the website on your profile", "No MLS credentials required"],
  },
  {
    id: "csv",
    label: "CSV / MLS export",
    short: "CSV",
    blurb: "Import a board export (CSV/TSV) when API access is pending",
    auth: "none",
    setupHints: ["Paste or import MLS export columns", "Address + Price required"],
  },
];

export const MLS_BOARDS: MlsBoardMeta[] = [
  {
    id: "sandicor",
    label: "Sandicor (San Diego)",
    region: "San Diego",
    prefix: "SDP",
    platforms: ["bridge", "reso_web", "website", "csv"],
    endpointHints: {
      bridge: "https://api.bridgedataoutput.com/api/v2/OData/{dataset}",
      reso_web: "https://api.your-sandicor-vendor.com/odata",
    },
  },
  {
    id: "crmls",
    label: "CRMLS (SoCal)",
    region: "Los Angeles",
    prefix: "CR",
    platforms: ["bridge", "trestle", "reso_web", "website", "csv"],
    endpointHints: {
      bridge: "https://api.bridgedataoutput.com/api/v2/OData/{dataset}",
      trestle: "https://api-trestle.corelogic.com/trestle/odata",
    },
  },
  {
    id: "bright",
    label: "Bright MLS (Mid-Atlantic)",
    region: "Washington DC",
    prefix: "BR",
    platforms: ["bridge", "reso_web", "website", "csv"],
    endpointHints: {
      bridge: "https://api.bridgedataoutput.com/api/v2/OData/{dataset}",
    },
  },
  {
    id: "onekey",
    label: "OneKey MLS (NY metro)",
    region: "New York",
    prefix: "OK",
    platforms: ["bridge", "reso_web", "website", "csv"],
    endpointHints: {
      bridge: "https://api.bridgedataoutput.com/api/v2/OData/{dataset}",
    },
  },
  {
    id: "nwmls",
    label: "NWMLS (Pacific Northwest)",
    region: "Seattle",
    prefix: "NW",
    platforms: ["reso_web", "bridge", "website", "csv"],
    endpointHints: {
      reso_web: "https://api.your-nwmls-vendor.com/odata",
    },
  },
  {
    id: "ntreis",
    label: "NTREIS (DFW / North Texas)",
    region: "Dallas",
    prefix: "NT",
    platforms: ["trestle", "bridge", "reso_web", "website", "csv"],
    endpointHints: {
      trestle: "https://api-trestle.corelogic.com/trestle/odata",
    },
  },
  {
    id: "actris",
    label: "ACTRIS (Austin / Central TX)",
    region: "Austin",
    prefix: "ATX",
    platforms: ["trestle", "bridge", "reso_web", "website", "csv"],
    endpointHints: {
      trestle: "https://api-trestle.corelogic.com/trestle/odata",
    },
  },
  {
    id: "miami",
    label: "MIAMI / BeachesMLS",
    region: "Miami",
    prefix: "MI",
    platforms: ["spark", "reso_web", "website", "csv"],
    endpointHints: {
      spark: "https://sparkapi.com/v1",
    },
  },
  {
    id: "mred",
    label: "MRED (Chicago)",
    region: "Chicago",
    prefix: "CH",
    platforms: ["mls_grid", "bridge", "reso_web", "website", "csv"],
    endpointHints: {
      mls_grid: "https://api.mlsgrid.com/v2",
    },
  },
  {
    id: "recolorado",
    label: "REColorado",
    region: "Denver",
    prefix: "CO",
    platforms: ["reso_web", "bridge", "website", "csv"],
    endpointHints: {
      reso_web: "https://api.your-recolorado-vendor.com/odata",
    },
  },
  {
    id: "other",
    label: "Other / Independent",
    region: "United States",
    prefix: "MLS",
    platforms: ["reso_web", "bridge", "trestle", "spark", "mls_grid", "website", "csv"],
    endpointHints: {
      reso_web: "https://api.your-mls.com/odata",
    },
  },
];

export function getPlatform(id: MlsPlatformId): MlsPlatformMeta {
  return MLS_PLATFORMS.find((p) => p.id === id) ?? MLS_PLATFORMS[4]!;
}

export function getBoard(id: string): MlsBoardMeta {
  return (
    MLS_BOARDS.find((b) => b.id === id) ??
    MLS_BOARDS.find((b) => b.id === "other")!
  );
}

export function platformsForBoard(boardId: string): MlsPlatformMeta[] {
  const board = getBoard(boardId);
  return board.platforms
    .map((id) => MLS_PLATFORMS.find((p) => p.id === id))
    .filter(Boolean) as MlsPlatformMeta[];
}

/** Connection stored in app state (secrets stay out of this object when possible) */
export type MlsConnection = {
  id: string;
  boardId: string;
  platform: MlsPlatformId;
  label: string;
  status: "disconnected" | "connected" | "error" | "syncing";
  baseUrl: string;
  dataset?: string;
  agentMlsId?: string;
  clientId?: string;
  /** Whether a token is stored in the secret vault */
  hasCredentials: boolean;
  lastSyncAt?: string;
  lastError?: string;
  listingCount?: number;
  createdAt: string;
};

export type MlsCredentials = {
  accessToken?: string;
  clientId?: string;
  clientSecret?: string;
  username?: string;
  password?: string;
};

const SECRET_KEY = "realestate-ai-mls-secrets";

export function loadMlsSecrets(): Record<string, MlsCredentials> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(SECRET_KEY) || localStorage.getItem(SECRET_KEY);
    return raw ? (JSON.parse(raw) as Record<string, MlsCredentials>) : {};
  } catch {
    return {};
  }
}

export function saveMlsSecret(connectionId: string, creds: MlsCredentials) {
  if (typeof window === "undefined") return;
  const all = loadMlsSecrets();
  all[connectionId] = { ...all[connectionId], ...creds };
  // session first (safer), also local so reconnect works after refresh in demo
  sessionStorage.setItem(SECRET_KEY, JSON.stringify(all));
  localStorage.setItem(SECRET_KEY, JSON.stringify(all));
}

export function clearMlsSecret(connectionId: string) {
  if (typeof window === "undefined") return;
  const all = loadMlsSecrets();
  delete all[connectionId];
  sessionStorage.setItem(SECRET_KEY, JSON.stringify(all));
  localStorage.setItem(SECRET_KEY, JSON.stringify(all));
}

export function getMlsSecret(connectionId: string): MlsCredentials | undefined {
  return loadMlsSecrets()[connectionId];
}
