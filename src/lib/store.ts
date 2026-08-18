import { create } from "zustand";
import { persist } from "zustand/middleware";
import { WORKSPACE_STORAGE_BASE_KEY } from "@/lib/auth/workspace-storage-keys";
import {
  SEED_ACTIVITY,
  SEED_DEALS,
  SEED_LEADS,
  SEED_PROPERTIES,
  SEED_RENTALS,
  calculateLeadScore,
  heatFromScore,
  type ActivityItem,
  type AgentProfile,
  type ChatMessage,
  type Deal,
  type Lead,
  type Property,
  type RentalUnit,
} from "@/data/seed";
import { pullActiveListingsFromMls } from "@/lib/mls";
import type { MlsConnection } from "@/lib/mls-platforms";
import type { EmailAlert, EmailConnection } from "@/lib/email-alerts";
import type { SocialAccountConnection, SocialNetworkId } from "@/lib/social-accounts";
import { defaultSocialAccounts } from "@/lib/social-accounts";
import {
  buildDemoInboxScan,
  messagesToAlerts,
  unreadCount as emailUnreadCount,
} from "@/lib/email-alerts";
import { getMlsSecret } from "@/lib/mls-platforms";
import { isMlsSourcedProperty } from "@/lib/mls-sync";
import {
  scrapedListingsToProperties,
  type WebsiteScrapeResult,
} from "@/lib/website-scrape";
import {
  parseLeadsCsv,
  parseListingsCsv,
  looksLikeSeedLead,
  looksLikeSeedProperty,
} from "@/lib/import-data";
import type { CampaignPlan, PostStatus, SocialPost } from "@/lib/social-agent";
import {
  applyMemorySignal,
  createEmptyMemory,
  ensureAgentMemory,
  learnFromLead,
  parseRememberCommand,
  type AgentMemory,
  type MemorySignal,
} from "@/lib/agent-memory";
import { isRsfCorridor } from "@/data/rsf-knowledge";
import { uid } from "@/lib/utils";
import {
  DEFAULT_CONNECTIONS,
  mergeImported,
  type CalendarAppointment,
  type CalendarConnection,
  type CalendarProviderId,
  type AppointmentStatus,
} from "@/lib/calendar";
import { SEED_CONTRACTORS, type Contractor } from "@/lib/contractors";
import {
  emptyBilling,
  activateFreeCode,
  startIntroAccess,
  type BillingState,
} from "@/lib/billing";
import {
  SEED_FEEDBACK,
  createFeedbackItem,
  createComment,
  type FeedbackItem,
  type FeedbackSectionId,
  type FeedbackPriority,
  type FeedbackStatus,
} from "@/lib/feedback";

interface AppState {
  leads: Lead[];
  properties: Property[];
  deals: Deal[];
  rentals: RentalUnit[];
  activity: ActivityItem[];
  favorites: string[];
  chat: ChatMessage[];
  sidebarCollapsed: boolean;
  completedPriorities: string[];
  campaigns: CampaignPlan[];
  agentProfile: AgentProfile | null;
  onboarded: boolean;
  hydrated: boolean;
  agentMemory: AgentMemory;
  appointments: CalendarAppointment[];
  calendarConnections: CalendarConnection[];
  contractors: Contractor[];
  billing: BillingState;
  feedback: FeedbackItem[];
  mlsConnections: MlsConnection[];
  tourCompleted: boolean;
  tourActive: boolean;
  tourStepIndex: number;
  emailAlerts: EmailAlert[];
  emailConnection: EmailConnection | null;
  socialAccounts: SocialAccountConnection[];

  setSidebarCollapsed: (v: boolean) => void;
  setHydrated: (v: boolean) => void;
  startTour: () => void;
  setTourStep: (i: number) => void;
  completeTour: () => void;
  skipTour: () => void;
  connectEmail: (provider: EmailConnection["provider"], email: string) => void;
  disconnectEmail: () => void;
  scanEmailInbox: (opts?: { accessToken?: string; forceDemo?: boolean }) => Promise<{
    added: number;
    total: number;
    error?: string;
    mode: string;
  }>;
  markAlertRead: (id: string) => void;
  markAllAlertsRead: () => void;
  dismissAlert: (id: string) => void;
  connectSocialAccount: (id: SocialNetworkId, handle: string) => void;
  disconnectSocialAccount: (id: SocialNetworkId) => void;
  setSocialAutoPost: (id: SocialNetworkId, autoPost: boolean) => void;
  completePriority: (id: string) => void;
  clearCompletedPriorities: () => void;

  completeOnboarding: (
    profile: Omit<AgentProfile, "onboardedAt" | "lastMlsSyncAt">,
    opts?: { websiteScrape?: WebsiteScrapeResult | null },
  ) => void;
  updateAgentProfile: (
    patch: Partial<Omit<AgentProfile, "onboardedAt">>,
  ) => void;
  applyWebsiteScrape: (scrape: WebsiteScrapeResult) => {
    listings: number;
    profilePatched: boolean;
  };
  resyncFromWebsite: () => Promise<{ listings: number; error?: string }>;
  upsertMlsConnection: (conn: MlsConnection) => void;
  removeMlsConnection: (id: string) => void;
  syncMlsConnection: (id: string) => Promise<{ listings: number; error?: string }>;
  syncAllMls: () => Promise<{ listings: number; errors: string[] }>;
  syncMlsListings: () => void;
  clearOnboarding: () => void;
  recordSignal: (signal: MemorySignal) => void;
  resetMemory: () => void;

  connectCalendar: (id: CalendarProviderId, email?: string) => void;
  disconnectCalendar: (id: CalendarProviderId) => void;
  syncCalendars: () => void;
  addAppointment: (
    apt: Omit<CalendarAppointment, "id" | "importedAt">,
  ) => void;
  updateAppointment: (id: string, patch: Partial<CalendarAppointment>) => void;
  setAppointmentStatus: (id: string, status: AppointmentStatus) => void;
  deleteAppointment: (id: string) => void;

  addContractor: (
    c: Omit<Contractor, "id" | "createdAt" | "useCount" | "active">,
  ) => void;
  updateContractor: (id: string, patch: Partial<Contractor>) => void;
  useContractor: (id: string) => void;
  toggleContractorCommon: (id: string) => void;
  archiveContractor: (id: string) => void;

  activateBilling: (billing: BillingState) => void;
  redeemAccessCode: (code: string) => { ok: true; code: string } | { ok: false; error: string };
  clearBilling: () => void;
  completeDemoCheckout: (sessionId?: string) => void;
  /** A server-verified Stripe payment. Never recorded as a demo. */
  completePaidCheckout: (sessionId: string) => void;
  importLeadsCsv: (raw: string) => { added: number; skipped: number; errors: string[] };
  importListingsCsv: (raw: string) => { added: number; skipped: number; errors: string[] };
  addProperty: (
    input: Omit<Property, "id" | "pricePerSqft" | "estimatedValue" | "accent" | "pattern"> &
      Partial<Pick<Property, "pricePerSqft" | "estimatedValue" | "accent" | "pattern" | "mlsNumber" | "listingSide" | "listAgentName">>,
  ) => Property;
  purgeSeedData: () => { leads: number; properties: number; deals: number; rentals: number };
  loadPracticeSamples: () => void;
  clearBook: () => void;

  addFeedback: (input: {
    section: FeedbackSectionId;
    title: string;
    body: string;
    author?: string;
    priority?: FeedbackPriority;
  }) => FeedbackItem;
  voteFeedback: (id: string) => void;
  addFeedbackComment: (id: string, body: string, author?: string) => void;
  setFeedbackStatus: (id: string, status: FeedbackStatus) => void;

  addLead: (lead: Omit<Lead, "id" | "createdAt" | "score" | "heat">) => Lead;
  updateLead: (id: string, patch: Partial<Lead>) => void;
  deleteLead: (id: string) => void;
  touchLead: (id: string) => void;

  toggleFavorite: (propertyId: string) => void;

  updateDeal: (id: string, patch: Partial<Deal>) => void;
  advanceDeal: (id: string) => void;
  reviewDocument: (dealId: string, docId: string) => void;

  updateRental: (id: string, patch: Partial<RentalUnit>) => void;
  applyMarketRent: (id: string) => void;

  saveCampaign: (plan: CampaignPlan) => void;
  updateCampaignPost: (
    campaignId: string,
    postId: string,
    patch: Partial<SocialPost>,
  ) => void;
  setCampaignPostStatus: (
    campaignId: string,
    postId: string,
    status: PostStatus,
  ) => void;
  deleteCampaign: (id: string) => void;

  pushActivity: (item: Omit<ActivityItem, "id" | "time">) => void;
  pushChat: (msg: Omit<ChatMessage, "id" | "createdAt">) => void;
  clearChat: () => void;

  resetDemo: () => void;
}

const STAGES: Deal["stage"][] = [
  "offer",
  "under_contract",
  "inspection",
  "appraisal",
  "clear_to_close",
  "closed",
];

const STAGE_PROGRESS: Record<Deal["stage"], number> = {
  offer: 15,
  under_contract: 40,
  inspection: 55,
  appraisal: 70,
  clear_to_close: 88,
  closed: 100,
};

function randomInt(maxExclusive: number): number {
  const values = new Uint32Array(1);
  globalThis.crypto.getRandomValues(values);
  return Math.floor((values[0]! / 2 ** 32) * maxExclusive);
}

function welcomeFor(name?: string, area?: string): ChatMessage[] {
  const greet = name ? `Hi ${name.split(" ")[0]}` : "Hello";
  const local = isRsfCorridor(area)
    ? " RSF corridor knowledge is loaded — ask about Covenant, comps, or schools."
    : " Import your leads and listings — we never invent client or inventory data.";
  return [
    {
      id: "welcome",
      role: "assistant",
      content: `${greet} — I'm your AI real estate copilot.${local} Your book starts empty. Import CSV or add records so priorities and CMAs use YOUR data.`,
      createdAt: new Date(0).toISOString(),
    },
  ];
}

function seedMemory(profile: AgentProfile): AgentMemory {
  let memory = createEmptyMemory();
  memory = applyMemorySignal(memory, {
    kind: "onboarding",
    text: `${profile.areaOfOperations} ${profile.name}`,
    meta: {
      neighborhood: profile.areaOfOperations.split(",")[0]?.trim(),
    },
  });
  if (isRsfCorridor(profile.areaOfOperations)) {
    memory = applyMemorySignal(memory, {
      kind: "remember",
      text: "Primary market is Rancho Santa Fe & surrounding North County luxury corridor — use Covenant/Bridges/Fairbanks distinctions in every pricing and content conversation.",
    });
    memory = applyMemorySignal(memory, {
      kind: "onboarding",
      text: "Rancho Santa Fe Covenant Fairbanks Del Mar Solana Beach Encinitas",
    });
  }
  return memory;
}

function applyProfileIdentity(profile: AgentProfile): Pick<AppState, "chat"> {
  return {
    chat: welcomeFor(profile.name, profile.areaOfOperations),
  };
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      leads: [],
      properties: [],
      deals: [],
      rentals: [],
      activity: [],
      favorites: [],
      chat: welcomeFor(),
      sidebarCollapsed: false,
      completedPriorities: [],
      campaigns: [],
      agentProfile: null,
      onboarded: false,
      hydrated: false,
      agentMemory: createEmptyMemory(),
      appointments: [],
      calendarConnections: DEFAULT_CONNECTIONS.map((c) => ({ ...c })),
      contractors: [],
      billing: emptyBilling(),
      feedback: SEED_FEEDBACK.map((f) => ({
        ...f,
        comments: f.comments.map((c) => ({ ...c })),
      })),
      mlsConnections: [],
      tourCompleted: false,
      tourActive: false,
      tourStepIndex: 0,
      emailAlerts: [],
      emailConnection: null,
      socialAccounts: defaultSocialAccounts(),

      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setHydrated: (v) => set({ hydrated: v }),
      startTour: () => set({ tourActive: true, tourStepIndex: 0 }),
      setTourStep: (i) => set({ tourStepIndex: Math.max(0, i) }),
      completeTour: () =>
        set({ tourActive: false, tourCompleted: true, tourStepIndex: 0 }),
      skipTour: () =>
        set({ tourActive: false, tourCompleted: true, tourStepIndex: 0 }),

      connectEmail: (provider, email) => {
        set({
          emailConnection: {
            provider,
            email: email.trim(),
            connectedAt: new Date().toISOString(),
            status: "connected",
          },
        });
      },

      disconnectEmail: () => {
        set({ emailConnection: null });
      },

      scanEmailInbox: async (opts) => {
        const leads = get().leads;
        const conn = get().emailConnection;
        const provider = conn?.provider || "gmail";
        let messages: import("@/lib/email-alerts").RawEmailMessage[] = [];
        let mode = "demo";
        let error: string | undefined;

        if (!opts?.forceDemo) {
          try {
            const { scanConnectedEmail } = await import("@/lib/email-scan");
            const secrets =
              typeof window !== "undefined"
                ? sessionStorage.getItem("realestate-ai-email-token") ||
                  localStorage.getItem("realestate-ai-email-token") ||
                  undefined
                : undefined;
            const res = await scanConnectedEmail({
              data: {
                accessToken: opts?.accessToken || secrets || undefined,
                maxResults: 15,
              },
            });
            if (res.ok && res.messages.length) {
              messages = res.messages;
              mode = res.mode;
            } else if (res.error) {
              error = res.error;
            }
          } catch (e) {
            error = e instanceof Error ? e.message : "Scan failed";
          }
        }

        if (!messages.length) {
          messages = buildDemoInboxScan(leads, conn?.email);
          mode = error ? "demo_fallback" : "demo";
        }

        const incoming = messagesToAlerts(messages, leads, provider);
        const existing = get().emailAlerts;
        const existingKeys = new Set(
          existing.map((a) => `${a.fromEmail}|${a.subject}`),
        );
        const fresh = incoming.filter(
          (a) => !existingKeys.has(`${a.fromEmail}|${a.subject}`),
        );
        // Prefer updating list: keep unread state for known, prepend fresh
        const merged = [
          ...fresh,
          ...existing.map((old) => {
            const match = incoming.find(
              (n) => n.fromEmail === old.fromEmail && n.subject === old.subject,
            );
            return match ? { ...old, snippet: match.snippet, receivedAt: match.receivedAt } : old;
          }),
        ].slice(0, 80);

        set({
          emailAlerts: merged,
          emailConnection: conn
            ? {
                ...conn,
                lastScanAt: new Date().toISOString(),
                status: "connected",
                lastError: mode.startsWith("demo") ? error : undefined,
              }
            : conn,
        });

        if (fresh.length) {
          get().pushActivity({
            type: "chat",
            title: `${fresh.length} new email alert${fresh.length > 1 ? "s" : ""}`,
            description: fresh
              .slice(0, 2)
              .map((a) => a.subject)
              .join(" · "),
            badge: "Email",
          });
        }

        return {
          added: fresh.length,
          total: merged.filter((a) => !a.read).length,
          error: mode === "demo_fallback" ? error : undefined,
          mode,
        };
      },

      markAlertRead: (id) => {
        set((s) => ({
          emailAlerts: s.emailAlerts.map((a) =>
            a.id === id ? { ...a, read: true } : a,
          ),
        }));
      },

      markAllAlertsRead: () => {
        set((s) => ({
          emailAlerts: s.emailAlerts.map((a) => ({ ...a, read: true })),
        }));
      },

      dismissAlert: (id) => {
        set((s) => ({
          emailAlerts: s.emailAlerts.filter((a) => a.id !== id),
        }));
      },

      connectSocialAccount: (id, handle) => {
        set((s) => ({
          socialAccounts: s.socialAccounts.map((a) =>
            a.id === id
              ? {
                  ...a,
                  connected: true,
                  handle: handle.trim() || a.handle || a.label,
                  connectedAt: new Date().toISOString(),
                }
              : a,
          ),
        }));
      },
      disconnectSocialAccount: (id) => {
        set((s) => ({
          socialAccounts: s.socialAccounts.map((a) =>
            a.id === id
              ? { ...a, connected: false, autoPost: false, handle: "" }
              : a,
          ),
        }));
      },
      setSocialAutoPost: (id, autoPost) => {
        set((s) => ({
          socialAccounts: s.socialAccounts.map((a) =>
            a.id === id
              ? {
                  ...a,
                  autoPost: a.connected ? autoPost : false,
                }
              : a,
          ),
        }));
      },

      completePriority: (id) => {
        set((s) => ({
          completedPriorities: s.completedPriorities.includes(id)
            ? s.completedPriorities
            : [...s.completedPriorities, id],
        }));
        get().recordSignal({
          kind: "priority_done",
          text: id,
          meta: { priorityKind: id.split(":")[0] ?? id },
        });
      },
      clearCompletedPriorities: () => set({ completedPriorities: [] }),

      completeOnboarding: (input, opts) => {
        const now = new Date().toISOString();
        const scrape = opts?.websiteScrape;
        const sp = scrape?.profile;
        const profile: AgentProfile = {
          ...input,
          phone: sp?.phone || input.phone,
          email: sp?.email || input.email,
          photoUrl: sp?.photoUrl || input.photoUrl,
          agentMlsId: sp?.mlsNumber || input.agentMlsId,
          license: sp?.license || sp?.mlsNumber || input.license,
          bio: sp?.bio || input.bio,
          title: sp?.title || input.title,
          brokerage: input.brokerage || sp?.brokerage,
          dataSource: scrape?.ok
            ? "website"
            : input.website
              ? "manual"
              : "manual",
          lastWebsiteScrapeAt: scrape?.scrapedAt,
          websiteScrapeSummary: scrape
            ? `${scrape.listings.length} listings · ${scrape.pagesFetched.length} pages`
            : undefined,
          onboardedAt: now,
          lastMlsSyncAt: now,
        };
        const fromSite = scrape?.ok
          ? scrapedListingsToProperties(
              scrape.listings,
              profile.name,
              profile.areaOfOperations,
            )
          : [];
        const identity = applyProfileIdentity(profile);
        const welcomeActivity: ActivityItem = {
          id: uid("act"),
          type: "valuation",
          title:
            fromSite.length > 0
              ? "Website inventory loaded"
              : "Workspace ready — empty book",
          description:
            fromSite.length > 0
              ? `${fromSite.length} listing(s) from ${profile.website} · ${profile.phone || "no phone"} · MLS ID ${profile.agentMlsId || "n/a"}`
              : `${input.areaOfOperations} · add website or import YOUR listings (no sample data)`,
          time: now,
          badge: fromSite.length > 0 ? "Website" : "Ready",
        };
        set({
          agentProfile: profile,
          onboarded: true,
          hydrated: true,
          agentMemory: seedMemory(profile),
          ...identity,
          leads: [],
          properties: fromSite,
          deals: [],
          rentals: [],
          completedPriorities: [],
          campaigns: [],
          appointments: [],
          activity: [welcomeActivity],
          contractors: [],
          favorites: [],
        });
      },

      applyWebsiteScrape: (scrape) => {
        const current = get().agentProfile;
        if (!current) return { listings: 0, profilePatched: false };
        const sp = scrape.profile;
        const profile: AgentProfile = {
          ...current,
          phone: sp.phone || current.phone,
          email: sp.email || current.email,
          photoUrl: sp.photoUrl || current.photoUrl,
          agentMlsId: sp.mlsNumber || current.agentMlsId,
          license: sp.license || sp.mlsNumber || current.license,
          bio: sp.bio || current.bio,
          title: sp.title || current.title,
          brokerage: sp.brokerage || current.brokerage,
          dataSource: scrape.ok ? "website" : current.dataSource,
          lastWebsiteScrapeAt: scrape.scrapedAt,
          websiteScrapeSummary: `${scrape.listings.length} listings · ${scrape.pagesFetched.length} pages`,
          lastMlsSyncAt: new Date().toISOString(),
        };
        const fromSite = scrapedListingsToProperties(
          scrape.listings,
          profile.name,
          profile.areaOfOperations,
        );
        // Replace only previous website-sourced inventory; keep manual/import
        const kept = get().properties.filter(
          (p) => !p.features?.includes("From agent website"),
        );
        set({
          agentProfile: profile,
          properties: [...fromSite, ...kept],
        });
        get().pushActivity({
          type: "valuation",
          title: "Website re-scanned",
          description: `${fromSite.length} listing(s) · ${profile.phone || "phone n/a"} · ${profile.agentMlsId || "MLS ID n/a"}`,
          badge: "Website",
        });
        get().recordSignal({
          kind: "mls_sync",
          text: `website scrape ${fromSite.length} listings`,
        });
        return { listings: fromSite.length, profilePatched: true };
      },

      resyncFromWebsite: async () => {
        const profile = get().agentProfile;
        if (!profile?.website) {
          return { listings: 0, error: "No website on profile" };
        }
        try {
          const { scrapeAgentWebsite } = await import("@/lib/scrape-site");
          const scrape = await scrapeAgentWebsite({
            data: {
              website: profile.website,
              agentNameHint: profile.name,
            },
          });
          if (!scrape.ok && scrape.listings.length === 0) {
            return {
              listings: 0,
              error: scrape.error || scrape.warnings[0] || "Scrape found nothing",
            };
          }
          const r = get().applyWebsiteScrape(scrape);
          return { listings: r.listings };
        } catch (e) {
          return {
            listings: 0,
            error: e instanceof Error ? e.message : "Scrape failed",
          };
        }
      },

      updateAgentProfile: (patch) => {
        const current = get().agentProfile;
        if (!current) return;
        const now = new Date().toISOString();
        const profile: AgentProfile = {
          ...current,
          ...patch,
          lastMlsSyncAt: now,
        };
        set({
          agentProfile: profile,
          onboarded: true,
          ...applyProfileIdentity(profile),
        });
        if (patch.areaOfOperations) {
          get().recordSignal({
            kind: "onboarding",
            text: patch.areaOfOperations,
            meta: {
              neighborhood: patch.areaOfOperations.split(",")[0]?.trim(),
            },
          });
        }
        get().pushActivity({
          type: "valuation",
          title: "Profile updated",
          description: `${profile.areaOfOperations} · ${profile.mls} — your listings unchanged`,
          badge: "Profile",
        });
      },

      upsertMlsConnection: (conn) => {
        set((s) => {
          const exists = s.mlsConnections.some((c) => c.id === conn.id);
          return {
            mlsConnections: exists
              ? s.mlsConnections.map((c) => (c.id === conn.id ? conn : c))
              : [...s.mlsConnections, conn],
          };
        });
      },

      removeMlsConnection: (id) => {
        set((s) => ({
          mlsConnections: s.mlsConnections.filter((c) => c.id !== id),
        }));
      },

      syncMlsConnection: async (id) => {
        const conn = get().mlsConnections.find((c) => c.id === id);
        const profile = get().agentProfile;
        if (!conn) return { listings: 0, error: "Connection not found" };

        set((s) => ({
          mlsConnections: s.mlsConnections.map((c) =>
            c.id === id ? { ...c, status: "syncing" as const, lastError: undefined } : c,
          ),
        }));

        try {
          if (conn.platform === "website") {
            const r = await get().resyncFromWebsite();
            set((s) => ({
              mlsConnections: s.mlsConnections.map((c) =>
                c.id === id
                  ? {
                      ...c,
                      status: r.error ? ("error" as const) : ("connected" as const),
                      lastSyncAt: new Date().toISOString(),
                      lastError: r.error,
                      listingCount: r.listings,
                      hasCredentials: true,
                    }
                  : c,
              ),
            }));
            return r;
          }

          const secrets = getMlsSecret(id) || {};
          const { fetchMlsListings } = await import("@/lib/mls-fetch");
          const result = await fetchMlsListings({
            data: {
              platform: conn.platform,
              baseUrl: conn.baseUrl,
              accessToken: secrets.accessToken,
              clientId: secrets.clientId || conn.clientId,
              clientSecret: secrets.clientSecret,
              dataset: conn.dataset,
              agentMlsId: conn.agentMlsId || profile?.agentMlsId,
              agentName: profile?.name,
              top: 50,
            },
          });

          if (!result.ok) {
            set((s) => ({
              mlsConnections: s.mlsConnections.map((c) =>
                c.id === id
                  ? {
                      ...c,
                      status: "error" as const,
                      lastError: result.error,
                      lastSyncAt: new Date().toISOString(),
                    }
                  : c,
              ),
            }));
            return { listings: 0, error: result.error || "MLS sync failed" };
          }

          const kept = get().properties.filter((p) => !isMlsSourcedProperty(p));
          // Also keep website-sourced
          set({
            properties: [...result.listings, ...kept],
            agentProfile: profile
              ? {
                  ...profile,
                  dataSource: "mls",
                  lastMlsSyncAt: new Date().toISOString(),
                  agentMlsId: conn.agentMlsId || profile.agentMlsId,
                }
              : profile,
            mlsConnections: get().mlsConnections.map((c) =>
              c.id === id
                ? {
                    ...c,
                    status: "connected" as const,
                    lastSyncAt: new Date().toISOString(),
                    lastError: result.warnings[0],
                    listingCount: result.listings.length,
                    hasCredentials: true,
                  }
                : c,
            ),
          });
          get().pushActivity({
            type: "valuation",
            title: `MLS sync · ${conn.label}`,
            description: `${result.listings.length} listing(s) via ${conn.platform}`,
            badge: "MLS",
          });
          get().recordSignal({
            kind: "mls_sync",
            text: `${conn.platform} ${conn.boardId} ${result.listings.length}`,
          });
          return { listings: result.listings.length };
        } catch (e) {
          const msg = e instanceof Error ? e.message : "MLS sync failed";
          set((s) => ({
            mlsConnections: s.mlsConnections.map((c) =>
              c.id === id
                ? { ...c, status: "error" as const, lastError: msg }
                : c,
            ),
          }));
          return { listings: 0, error: msg };
        }
      },

      syncAllMls: async () => {
        const conns = get().mlsConnections.filter(
          (c) => c.hasCredentials || c.platform === "website",
        );
        let total = 0;
        const errors: string[] = [];
        for (const c of conns) {
          const r = await get().syncMlsConnection(c.id);
          total += r.listings;
          if (r.error) errors.push(`${c.label}: ${r.error}`);
        }
        return { listings: total, errors };
      },

      syncMlsListings: () => {
        // Prefer live connections; fall back to website; never invent inventory
        void (async () => {
          const conns = get().mlsConnections.filter(
            (c) => c.status === "connected" || c.hasCredentials,
          );
          if (conns.length) {
            await get().syncAllMls();
            return;
          }
          const profile = get().agentProfile;
          if (profile?.website) {
            await get().resyncFromWebsite();
            return;
          }
          get().pushActivity({
            type: "valuation",
            title: "No MLS connection",
            description:
              "Connect Bridge, Trestle, Spark, MLS Grid, or RESO under MLS Hub — or scan your website",
            badge: "MLS",
          });
        })();
      },

      clearOnboarding: () => {
        set({
          agentProfile: null,
          onboarded: false,
          agentMemory: createEmptyMemory(),
          leads: [],
          properties: [],
          deals: [],
          rentals: [],
          campaigns: [],
          completedPriorities: [],
          chat: welcomeFor(),
          appointments: [],
          calendarConnections: DEFAULT_CONNECTIONS.map((c) => ({ ...c })),
        });
      },

      recordSignal: (signal) => {
        set((s) => ({
          agentMemory: applyMemorySignal(
            s.agentMemory ?? createEmptyMemory(),
            signal,
          ),
        }));
      },

      resetMemory: () => {
        const profile = get().agentProfile;
        set({
          agentMemory: profile ? seedMemory(profile) : createEmptyMemory(),
        });
      },

      connectCalendar: (id, email) => {
        set((s) => ({
          calendarConnections: s.calendarConnections.map((c) =>
            c.id === id
              ? {
                  ...c,
                  connected: true,
                  accountEmail:
                    email?.trim() ||
                    c.accountEmail ||
                    `${id}.agent@workspace.demo`,
                  lastSyncAt: new Date().toISOString(),
                }
              : c,
          ),
        }));
        get().pushActivity({
          type: "chat",
          title: "Calendar connected",
          description: `${id} linked for appointment import`,
          badge: "Calendar",
        });
        get().syncCalendars();
      },

      disconnectCalendar: (id) => {
        set((s) => ({
          calendarConnections: s.calendarConnections.map((c) =>
            c.id === id
              ? { ...c, connected: false, lastSyncAt: undefined }
              : c,
          ),
        }));
      },

      syncCalendars: () => {
        const connected = get().calendarConnections.filter((c) => c.connected);
        if (connected.length === 0) return;
        // Real OAuth import lands here later — never inject sample appointments.
        set((s) => ({
          calendarConnections: s.calendarConnections.map((c) =>
            c.connected ? { ...c, lastSyncAt: new Date().toISOString() } : c,
          ),
        }));
        get().pushActivity({
          type: "chat",
          title: "Calendar ready",
          description:
            "Provider linked. Add appointments manually — no sample events are created.",
          badge: "Calendar",
        });
        get().recordSignal({
          kind: "chat",
          text: "calendar connected awaiting real appointments",
        });
      },

      addAppointment: (apt) => {
        const row: CalendarAppointment = {
          ...apt,
          id: uid("apt"),
          importedAt: new Date().toISOString(),
        };
        set((s) => ({
          appointments: [...s.appointments, row].sort(
            (a, b) =>
              new Date(a.start).getTime() - new Date(b.start).getTime(),
          ),
        }));
      },

      updateAppointment: (id, patch) => {
        set((s) => ({
          appointments: s.appointments.map((a) =>
            a.id === id ? { ...a, ...patch } : a,
          ),
        }));
      },

      setAppointmentStatus: (id, status) => {
        get().updateAppointment(id, { status });
      },

      deleteAppointment: (id) => {
        set((s) => ({
          appointments: s.appointments.filter((a) => a.id !== id),
        }));
      },

      addContractor: (input) => {
        const row: Contractor = {
          ...input,
          id: uid("ctr"),
          useCount: input.common ? 1 : 0,
          active: true,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ contractors: [row, ...s.contractors] }));
        get().pushActivity({
          type: "chat",
          title: "Contractor saved",
          description: `${row.company} · ${row.category}`,
          badge: "Vendors",
        });
      },

      updateContractor: (id, patch) => {
        set((s) => ({
          contractors: s.contractors.map((c) =>
            c.id === id ? { ...c, ...patch } : c,
          ),
        }));
      },

      useContractor: (id) => {
        set((s) => ({
          contractors: s.contractors.map((c) =>
            c.id === id
              ? {
                  ...c,
                  useCount: c.useCount + 1,
                  lastUsedAt: new Date().toISOString(),
                  common: true,
                }
              : c,
          ),
        }));
        get().recordSignal({
          kind: "chat",
          text: `used contractor ${id}`,
        });
      },

      toggleContractorCommon: (id) => {
        set((s) => ({
          contractors: s.contractors.map((c) =>
            c.id === id ? { ...c, common: !c.common } : c,
          ),
        }));
      },

      archiveContractor: (id) => {
        set((s) => ({
          contractors: s.contractors.map((c) =>
            c.id === id ? { ...c, active: false, common: false } : c,
          ),
        }));
      },


      activateBilling: (billing) => set({ billing }),

      redeemAccessCode: (code) => {
        const next = activateFreeCode(code);
        if (!next) {
          return {
            ok: false as const,
            error: "Invalid code. Check spelling and try again.",
          };
        }
        if (get().billing.redeemedCode === next.redeemedCode) {
          return {
            ok: false as const,
            error: "This code is already active on this device.",
          };
        }
        const now = new Date().toISOString();
        set((s) => ({
          billing: next,
          activity: [
            {
              id: uid("act"),
              type: "valuation" as const,
              title: "Beta code unlocked",
              description: `${next.redeemedCode} · full access + feedback board`,
              time: now,
              badge: "BETA",
            },
            ...s.activity,
          ].slice(0, 40),
        }));
        return { ok: true as const, code: next.redeemedCode! };
      },

      clearBilling: () => set({ billing: emptyBilling() }),

      completeDemoCheckout: (sessionId) => {
        const billing = startIntroAccess({
          source: "demo_checkout",
          sessionId: sessionId ?? `cs_demo_${Date.now().toString(36)}`,
          isDemo: true,
        });
        set({ billing });
      },

      // A real payment that the server already verified with Stripe. Kept
      // separate from completeDemoCheckout so a genuine purchase is never
      // stamped isDemo: true (which also showed "demo checkout" on /billing
      // and offered paying customers a "Reset access (demo)" button).
      completePaidCheckout: (sessionId) => {
        const billing = startIntroAccess({
          source: "stripe_intro",
          sessionId,
          isDemo: false,
        });
        set({ billing });
      },

      addFeedback: (input) => {
        const author =
          input.author?.trim() || get().agentProfile?.name || "Agent";
        const item = createFeedbackItem({
          section: input.section,
          title: input.title,
          body: input.body,
          author,
          priority: input.priority,
        });
        set((s) => ({ feedback: [item, ...s.feedback] }));
        return item;
      },

      voteFeedback: (id) => {
        set((s) => ({
          feedback: s.feedback.map((f) =>
            f.id === id ? { ...f, votes: f.votes + 1 } : f,
          ),
        }));
      },

      addFeedbackComment: (id, body, author) => {
        const name = author?.trim() || get().agentProfile?.name || "Agent";
        const comment = createComment({ author: name, body });
        set((s) => ({
          feedback: s.feedback.map((f) =>
            f.id === id
              ? { ...f, comments: [...f.comments, comment] }
              : f,
          ),
        }));
      },

      setFeedbackStatus: (id, status) => {
        set((s) => ({
          feedback: s.feedback.map((f) =>
            f.id === id ? { ...f, status } : f,
          ),
        }));
      },


      importLeadsCsv: (raw) => {
        const { items, skipped, errors } = parseLeadsCsv(raw);
        if (items.length) {
          set((s) => ({ leads: [...items, ...s.leads] }));
          get().pushActivity({
            type: "lead",
            title: "Leads imported",
            description: `${items.length} of your contacts added`,
            badge: "Import",
          });
        }
        return { added: items.length, skipped, errors };
      },

      importListingsCsv: (raw) => {
        const profile = get().agentProfile;
        const { items, skipped, errors } = parseListingsCsv(raw, {
          agentName: profile?.name,
          defaultCity: profile?.areaOfOperations,
        });
        if (items.length) {
          set((s) => ({ properties: [...items, ...s.properties] }));
          get().pushActivity({
            type: "valuation",
            title: "Listings imported",
            description: `${items.length} of your properties on the book`,
            badge: "Import",
          });
          get().recordSignal({
            kind: "mls_sync",
            text: `imported ${items.length} listings`,
          });
        }
        return { added: items.length, skipped, errors };
      },

      addProperty: (input) => {
        const price = input.price;
        const sqft = input.sqft || 1;
        const ppsf = input.pricePerSqft ?? Math.round(price / sqft);
        const prop: Property = {
          ...input,
          id: uid("prop"),
          accent: input.accent ?? "#5b8def",
          pattern: input.pattern ?? 1,
          pricePerSqft: ppsf,
          estimatedValue: input.estimatedValue ?? price,
          listingSide: input.listingSide ?? "mine",
          listAgentName:
            input.listAgentName ?? get().agentProfile?.name ?? undefined,
        };
        set((s) => ({ properties: [prop, ...s.properties] }));
        return prop;
      },

      purgeSeedData: () => {
        const s = get();
        const leads = s.leads.filter((l) => !looksLikeSeedLead(l));
        const properties = s.properties.filter((pr) => !looksLikeSeedProperty(pr));
        const seedPropIds = new Set(
          s.properties.filter(looksLikeSeedProperty).map((pr) => pr.id),
        );
        const fakeClients = new Set([
          "Sarah Johnson",
          "Mike Chen",
          "Emily Rodriguez",
          "David Park",
          "Jessica Williams",
          "Robert Kim",
        ]);
        const deals = s.deals.filter(
          (d) =>
            !seedPropIds.has(d.propertyId) &&
            !/^deal_\d+$/.test(d.id) &&
            !fakeClients.has(d.clientName),
        );
        const rentals = s.rentals.filter(
          (r) => !/^rent_\d+$/.test(r.id),
        );
        const removed = {
          leads: s.leads.length - leads.length,
          properties: s.properties.length - properties.length,
          deals: s.deals.length - deals.length,
          rentals: s.rentals.length - rentals.length,
        };
        set({
          leads,
          properties,
          deals,
          rentals,
          appointments: s.appointments.filter(
            (a) =>
              a.clientName !== "Jordan Lee" &&
              !a.id.startsWith("apt_show") &&
              !a.id.startsWith("apt_insp") &&
              !(a.externalId && a.externalId.startsWith("gcal_evt")),
          ),
        });
        return removed;
      },

      loadPracticeSamples: () => {
        const profile = get().agentProfile;
        if (!profile) return;
        const properties = pullActiveListingsFromMls(profile).map((pr) => ({
          ...pr,
          description: `[PRACTICE SAMPLE] ${pr.description}`,
          features: ["PRACTICE SAMPLE", ...pr.features],
          listAgentName:
            pr.listingSide === "mine"
              ? `${profile.name} (practice)`
              : "Practice Market Agent",
        }));
        set({
          properties,
          leads: [],
          deals: [],
          rentals: [],
        });
        get().pushActivity({
          type: "valuation",
          title: "Practice samples loaded",
          description: "Labeled PRACTICE SAMPLE — not real clients",
          badge: "Sample",
        });
      },

      clearBook: () => {
        set({
          leads: [],
          properties: [],
          deals: [],
          rentals: [],
          appointments: [],
          campaigns: [],
          favorites: [],
          completedPriorities: [],
        });
        get().pushActivity({
          type: "valuation",
          title: "Book cleared",
          description: "All leads, listings, deals, and appointments removed",
          badge: "Reset",
        });
      },

      addLead: (input) => {
        const score = calculateLeadScore(input);
        const lead: Lead = {
          ...input,
          id: uid("lead"),
          score,
          heat: heatFromScore(score),
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ leads: [lead, ...s.leads] }));
        get().recordSignal(learnFromLead(lead));
        get().pushActivity({
          type: "lead",
          title: "New lead added",
          description: `${lead.name} scored ${lead.score} · ${lead.location}`,
          badge: "New Lead",
        });
        return lead;
      },

      updateLead: (id, patch) => {
        set((s) => ({
          leads: s.leads.map((l) => {
            if (l.id !== id) return l;
            const next = { ...l, ...patch };
            next.score = calculateLeadScore(next);
            next.heat = heatFromScore(next.score);
            return next;
          }),
        }));
      },

      deleteLead: (id) => {
        set((s) => ({ leads: s.leads.filter((l) => l.id !== id) }));
      },

      touchLead: (id) => {
        get().updateLead(id, { lastContact: new Date().toISOString() });
        const lead = get().leads.find((l) => l.id === id);
        if (lead) get().recordSignal(learnFromLead(lead));
        get().pushActivity({
          type: "lead",
          title: "Lead contacted",
          description: `Logged outreach for ${lead?.name ?? "lead"}`,
          badge: "Contact",
        });
      },

      toggleFavorite: (propertyId) => {
        set((s) => ({
          favorites: s.favorites.includes(propertyId)
            ? s.favorites.filter((id) => id !== propertyId)
            : [...s.favorites, propertyId],
        }));
      },

      updateDeal: (id, patch) => {
        set((s) => ({
          deals: s.deals.map((d) =>
            d.id === id
              ? { ...d, ...patch, updatedAt: new Date().toISOString() }
              : d,
          ),
        }));
      },

      advanceDeal: (id) => {
        const deal = get().deals.find((d) => d.id === id);
        if (!deal) return;
        const idx = STAGES.indexOf(deal.stage);
        if (idx < 0 || idx >= STAGES.length - 1) return;
        const stage = STAGES[idx + 1];
        get().updateDeal(id, { stage, progress: STAGE_PROGRESS[stage] });
        get().pushActivity({
          type: "deal",
          title: "Deal advanced",
          description: `${deal.propertyTitle} → ${stage.replaceAll("_", " ")}`,
          badge: "Pipeline",
        });
      },

      reviewDocument: (dealId, docId) => {
        set((s) => ({
          deals: s.deals.map((d) => {
            if (d.id !== dealId) return d;
            return {
              ...d,
              updatedAt: new Date().toISOString(),
              documents: d.documents.map((doc) =>
                doc.id === docId
                  ? {
                      ...doc,
                      status: (doc.findings.length ? "issue" : "reviewed") as
                        | "issue"
                        | "reviewed",
                      confidence:
                        doc.confidence || 90 + randomInt(8),
                      findings:
                        doc.findings.length > 0
                          ? doc.findings
                          : [
                              "No material issues detected",
                              "Standard contingency language",
                            ],
                    }
                  : doc,
              ),
            };
          }),
        }));
        get().pushActivity({
          type: "document",
          title: "Document AI review complete",
          description: `Reviewed document on deal ${dealId}`,
          badge: "AI Review",
        });
      },

      updateRental: (id, patch) => {
        set((s) => ({
          rentals: s.rentals.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        }));
      },

      applyMarketRent: (id) => {
        const unit = get().rentals.find((r) => r.id === id);
        if (!unit) return;
        get().updateRental(id, { rent: unit.marketRent });
        get().pushActivity({
          type: "valuation",
          title: "Rent optimized",
          description: `${unit.address} ${unit.unit} marked to market rent`,
          badge: "Pricing",
        });
      },

      saveCampaign: (plan) => {
        set((s) => ({
          campaigns: [plan, ...s.campaigns.filter((c) => c.id !== plan.id)].slice(
            0,
            20,
          ),
        }));
        get().recordSignal({
          kind: "campaign",
          text: `${plan.title} ${plan.objective} ${plan.propertyLabel ?? ""}`,
          meta: {
            goal: plan.goal,
            voice: plan.brandVoice,
            neighborhood: plan.propertyLabel,
          },
        });
        for (const pl of plan.platforms) {
          get().recordSignal({
            kind: "campaign",
            meta: { platform: pl },
          });
        }
        get().pushActivity({
          type: "marketing",
          title: "Social campaign generated",
          description: `${plan.title} · ${plan.posts.length} posts`,
          badge: "Content Agent",
        });
      },

      updateCampaignPost: (campaignId, postId, patch) => {
        set((s) => ({
          campaigns: s.campaigns.map((c) =>
            c.id !== campaignId
              ? c
              : {
                  ...c,
                  posts: c.posts.map((p) =>
                    p.id === postId ? { ...p, ...patch } : p,
                  ),
                },
          ),
        }));
      },

      setCampaignPostStatus: (campaignId, postId, status) => {
        get().updateCampaignPost(campaignId, postId, { status });
        if (status === "published" || status === "queued") {
          get().pushActivity({
            type: "marketing",
            title: "Legacy local campaign state changed",
            description: `Campaign ${campaignId} · ${status} locally · no social-network request was sent`,
            badge: "Planning only",
          });
        }
      },

      deleteCampaign: (id) => {
        set((s) => ({ campaigns: s.campaigns.filter((c) => c.id !== id) }));
      },

      pushActivity: (item) => {
        set((s) => ({
          activity: [
            {
              ...item,
              id: uid("act"),
              time: new Date().toISOString(),
            },
            ...s.activity,
          ].slice(0, 40),
        }));
      },

      pushChat: (msg) => {
        set((s) => ({
          chat: [
            ...s.chat,
            { ...msg, id: uid("msg"), createdAt: new Date().toISOString() },
          ],
        }));
        if (msg.role === "user") {
          const remember = parseRememberCommand(msg.content);
          if (remember) {
            get().recordSignal({ kind: "remember", text: remember });
          } else {
            get().recordSignal({ kind: "chat", text: msg.content });
          }
        }
      },

      clearChat: () => {
        const name = get().agentProfile?.name;
        const area = get().agentProfile?.areaOfOperations;
        set({
          chat: [
            {
              id: "welcome",
              role: "assistant",
              content: `Chat cleared${name ? `, ${name.split(" ")[0]}` : ""}. Ask about calendars, RSF knowledge, or CMAs${area && isRsfCorridor(area) ? " — corridor KB is still online" : ""}.`,
              createdAt: new Date().toISOString(),
            },
          ],
        });
      },

      resetDemo: () => {
        set({
          leads: [],
          properties: [],
          deals: [],
          rentals: [],
          activity: SEED_ACTIVITY,
          favorites: [],
          chat: welcomeFor(
            get().agentProfile?.name,
            get().agentProfile?.areaOfOperations,
          ),
          completedPriorities: [],
          campaigns: [],
        });
      },
    }),
    {
      name: WORKSPACE_STORAGE_BASE_KEY,
      skipHydration: true,
      partialize: (s) => ({
        leads: s.leads,
        properties: s.properties,
        deals: s.deals,
        rentals: s.rentals,
        activity: s.activity,
        favorites: s.favorites,
        chat: s.chat,
        sidebarCollapsed: s.sidebarCollapsed,
        completedPriorities: s.completedPriorities,
        campaigns: s.campaigns,
        agentProfile: s.agentProfile,
        onboarded: s.onboarded,
        agentMemory: s.agentMemory,
        appointments: s.appointments,
        calendarConnections: s.calendarConnections,
        contractors: s.contractors,
        billing: s.billing,
        feedback: s.feedback,
        mlsConnections: s.mlsConnections,
        tourCompleted: s.tourCompleted,
        emailAlerts: s.emailAlerts,
        emailConnection: s.emailConnection,
        socialAccounts: s.socialAccounts,
      }),
    },
  ),
);

let hydrationHooked = false;

/**
 * Register post-hydration normalization without reading any storage key.
 * AppShell uses this before auth resolves; bindWorkspaceToUser performs the
 * actual rehydrate only after selecting the final user-scoped key.
 */
export function ensureHydrationHook() {
  const persistApi = useAppStore.persist;
  if (hydrationHooked || !persistApi) return;
  hydrationHooked = true;
  persistApi.onFinishHydration(() => {
    const st = useAppStore.getState();
    const patch: Partial<AppState> = {};
    patch.agentMemory = ensureAgentMemory(st.agentMemory);
    if (!st.appointments) patch.appointments = [];
    if (!st.calendarConnections)
      patch.calendarConnections = DEFAULT_CONNECTIONS.map((c) => ({ ...c }));
    if (!st.contractors) patch.contractors = [];
    if (!st.mlsConnections) patch.mlsConnections = [];
    if (st.tourCompleted == null) patch.tourCompleted = false;
    if (st.tourActive == null) patch.tourActive = false;
    if (st.tourStepIndex == null) patch.tourStepIndex = 0;
    if (!st.emailAlerts) patch.emailAlerts = [];
    if (st.emailConnection === undefined) patch.emailConnection = null;
    if (!st.socialAccounts) patch.socialAccounts = defaultSocialAccounts();
    if (!st.billing) patch.billing = emptyBilling();
    if (!st.feedback)
      patch.feedback = SEED_FEEDBACK.map((f) => ({
        ...f,
        comments: f.comments.map((c) => ({ ...c })),
      }));
    if (Object.keys(patch).length) useAppStore.setState(patch);
    const after = useAppStore.getState();
    if (
      after.leads.some(looksLikeSeedLead) ||
      after.properties.some(looksLikeSeedProperty)
    ) {
      after.purgeSeedData();
    }
    useAppStore.getState().setHydrated(true);
  });
}

/** Legacy/manual entrypoint retained for tests and non-auth callers. */
export function rehydrateStore() {
  const persistApi = useAppStore.persist;
  if (!persistApi) {
    useAppStore.getState().setHydrated(true);
    return;
  }
  ensureHydrationHook();
  if (persistApi.hasHydrated()) {
    useAppStore.getState().setHydrated(true);
    return;
  }
  void persistApi.rehydrate();
}
