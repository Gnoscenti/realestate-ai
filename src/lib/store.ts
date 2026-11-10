import { create } from "zustand";
import { persist } from "zustand/middleware";
import { WORKSPACE_STORAGE_BASE_KEY } from "@/lib/auth/workspace-storage-keys";
import type { CiteAgentProfile } from "@/lib/aieo/provenance";
import {
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
import type { EmailAlert, EmailConnection } from "@/lib/email-alerts";
import {
  isLegacyGeneratedAlert,
  messagesToAlerts,
  unreadCount as emailUnreadCount,
} from "@/lib/email-alerts";
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
  DEAL_STAGES,
  DEAL_STAGE_PROGRESS,
  dealFields,
  rentalFields,
  rentalLabel,
  type NewDealInput,
  type NewRentalInput,
} from "@/lib/book-entry";
import { leadLocation } from "@/lib/lead-facts";
import {
  DEFAULT_CONNECTIONS,
  type CalendarAppointment,
  type CalendarConnection,
  type AppointmentStatus,
} from "@/lib/calendar";
import type { Contractor } from "@/lib/contractors";
import {
  emptyBilling,
  activateFreeCode,
  startIntroAccess,
  startLifetimeAccess,
  type BillingState,
} from "@/lib/billing";
import {
  createFeedbackItem,
  createComment,
  type FeedbackItem,
  type FeedbackSectionId,
  type FeedbackPriority,
  type FeedbackStatus,
} from "@/lib/feedback";

import type { CampaignPlan, PostStatus, SocialPost } from "@/lib/social-agent";

interface AppState {
  campaigns: CampaignPlan[];
  leads: Lead[];
  properties: Property[];
  deals: Deal[];
  rentals: RentalUnit[];
  activity: ActivityItem[];
  favorites: string[];
  chat: ChatMessage[];
  sidebarCollapsed: boolean;
  completedPriorities: string[];
  agentProfile: AgentProfile | null;
  onboarded: boolean;
  hydrated: boolean;
  agentMemory: AgentMemory;
  appointments: CalendarAppointment[];
  calendarConnections: CalendarConnection[];
  contractors: Contractor[];
  billing: BillingState;
  feedback: FeedbackItem[];
  emailAlerts: EmailAlert[];
  emailConnection: EmailConnection | null;

  setSidebarCollapsed: (v: boolean) => void;
  setHydrated: (v: boolean) => void;
  scanEmailInbox: (opts?: { accessToken?: string }) => Promise<{
    added: number;
    total: number;
    error?: string;
    mode: string;
  }>;
  markAlertRead: (id: string) => void;
  markAllAlertsRead: () => void;
  dismissAlert: (id: string) => void;
  completePriority: (id: string) => void;
  clearCompletedPriorities: () => void;

  completeOnboarding: (
    profile: Omit<AgentProfile, "onboardedAt" | "lastMlsSyncAt">,
    opts?: { websiteScrape?: WebsiteScrapeResult | null },
  ) => void;
  updateAgentProfile: (
    patch: Partial<Omit<AgentProfile, "onboardedAt">>,
  ) => void;
  /** Hydrate confirmed identity without resetting existing leads or appointments. */
  hydrateConfirmedProfile: (profile: AgentProfile) => void;
  applyWebsiteScrape: (scrape: WebsiteScrapeResult) => {
    listings: number;
    profilePatched: boolean;
  };
  resyncFromWebsite: () => Promise<{ listings: number; error?: string }>;
  clearOnboarding: () => void;
  recordSignal: (signal: MemorySignal) => void;
  resetMemory: () => void;

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
  completePaidCheckout: (sessionId: string, lifetime?: boolean) => void;
  importLeadsCsv: (raw: string) => { added: number; skipped: number; errors: string[] };
  importListingsCsv: (raw: string) => { added: number; skipped: number; errors: string[] };
  addProperty: (
    input: Omit<Property, "id" | "pricePerSqft" | "estimatedValue" | "accent" | "pattern"> &
      Partial<Pick<Property, "pricePerSqft" | "estimatedValue" | "accent" | "pattern" | "mlsNumber" | "listingSide" | "listAgentName">>,
  ) => Property;
  purgeSeedData: () => { leads: number; properties: number; deals: number; rentals: number };
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

  addDeal: (input: NewDealInput) => Deal;
  updateDeal: (id: string, patch: Partial<Deal>) => void;
  advanceDeal: (id: string) => void;
  deleteDeal: (id: string) => void;

  addRental: (input: NewRentalInput) => RentalUnit;
  updateRental: (id: string, patch: Partial<RentalUnit>) => void;
  applyMarketRent: (id: string) => void;
  deleteRental: (id: string) => void;

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


function welcomeFor(name?: string, area?: string): ChatMessage[] {
  const greet = name ? `Hi ${name.split(" ")[0]}` : "Hello";
  // The assistant reads server-side records only. Local market notes are a page
  // to browse, not something it can answer from, so they are offered as a link.
  const local = isRsfCorridor(area)
    ? " Local notes for Rancho Santa Fe are on the Market Knowledge page."
    : "";
  return [
    {
      id: "welcome",
      role: "assistant",
      content: `${greet}. I'm your AI assistant. I answer from your saved profile, the listings you add in Social Desk and your verified sold records. I can't read your leads or imported listings yet, I don't search the web or an MLS, and I never invent data.${local}`,
      createdAt: new Date(0).toISOString(),
    },
  ];
}

const RSF_PROFILE_SEED_FACT = "Primary market is Rancho Santa Fe & surrounding North County luxury corridor — use Covenant/Bridges/Fairbanks distinctions in every pricing and content conversation.";

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
      text: RSF_PROFILE_SEED_FACT,
    });
    memory = applyMemorySignal(memory, {
      kind: "onboarding",
      text: "Rancho Santa Fe Covenant Fairbanks Del Mar Solana Beach Encinitas",
    });
  }
  return memory;
}

/** Refresh profile-derived facts without rewriting learned activity/preferences.
 * Historical market counts remain history; the confirmed profile is current. */
function refreshProfileMemory(memory: AgentMemory, profile: AgentProfile): AgentMemory {
  const existing = ensureAgentMemory(memory);
  return {
    ...existing,
    learnedFacts: [{
      id: "confirmed_profile_identity",
      text: `Confirmed agent: ${profile.name}. ${profile.areaOfOperations ? `Current market: ${profile.areaOfOperations}.` : "Current market is unspecified."} The confirmed profile takes precedence over historical market activity.`,
      source: "onboarding",
      confidence: 1,
      createdAt: new Date().toISOString(),
    }, ...existing.learnedFacts.filter((fact) =>
      fact.source !== "onboarding" && fact.text !== RSF_PROFILE_SEED_FACT,
    )],
  };
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
      feedback: [],
      emailAlerts: [],
      emailConnection: null,

      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setHydrated: (v) => set({ hydrated: v }),

      scanEmailInbox: async (opts) => {
        const leads = get().leads;
        const conn = get().emailConnection;
        // Gmail is the only provider with a scan. An older build let the agent
        // pick another label, which never changed what was scanned.
        const provider = "gmail" as const;
        let messages: import("@/lib/email-alerts").RawEmailMessage[] = [];
        let mode = "live";
        let error: string | undefined;

        // No token, no scan. A missing or failed scan never produces invented
        // messages (ledger A-021).
        if (!opts?.accessToken) {
          return {
            added: 0,
            total: emailUnreadCount(get().emailAlerts),
            error: "No Gmail access token was provided, so nothing was scanned.",
            mode: "none",
          };
        }
        try {
          const { scanConnectedEmail } = await import("@/lib/email-scan");
          const res = await scanConnectedEmail({
            data: { accessToken: opts.accessToken, maxResults: 15 },
          });
          if (res.ok) {
            messages = res.messages;
            mode = res.mode;
          } else if (res.error) {
            error = res.error;
          }
        } catch {
          // The request to our own server failed (signed out, offline, server
          // error). The raw exception text is not fit to show.
          error =
            "The Gmail scan could not start. Check that you are signed in and online, then try again.";
        }
        if (error) {
          set({ emailConnection: conn ? { ...conn, status: "error", lastError: error } : conn });
          return { added: 0, total: emailUnreadCount(get().emailAlerts), error, mode: "error" };
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

        // Not a live connection: a record of the last scan that finished.
        // Every scan needs a freshly pasted token.
        const scannedAt = new Date().toISOString();
        set({
          emailAlerts: merged,
          emailConnection: {
            provider: "gmail",
            email: conn?.email ?? "",
            connectedAt: conn?.connectedAt ?? scannedAt,
            lastScanAt: scannedAt,
            status: "connected",
            lastError: undefined,
          },
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

      hydrateConfirmedProfile: (profile) => {
        const current = get().agentProfile;
        const identityChanged = current && (
          current.name !== profile.name || current.areaOfOperations !== profile.areaOfOperations
        );
        set({
          agentProfile: profile,
          onboarded: true,
          agentMemory: !current
            ? seedMemory(profile)
            : identityChanged
              ? refreshProfileMemory(get().agentMemory, profile)
              : get().agentMemory,
          ...(current ? {} : applyProfileIdentity(profile)),
        });
      },

      completeOnboarding: (input, opts) => {
        const now = new Date().toISOString();
        const scrape = opts?.websiteScrape;
        const sp = scrape?.profile;
        const inputCite = input as CiteAgentProfile;
        const profile: CiteAgentProfile = {
          ...input,
          phone: sp?.phone || input.phone,
          email: sp?.email || input.email,
          photoUrl: sp?.photoUrl || input.photoUrl,
          agentMlsId: sp?.mlsNumber || input.agentMlsId,
          license: sp?.license || input.license,
          licenseJurisdiction:
            sp?.licenseJurisdiction || inputCite.licenseJurisdiction,
          responsibleBrokerName:
            sp?.responsibleBrokerName || inputCite.responsibleBrokerName,
          responsibleBrokerLicense:
            sp?.responsibleBrokerLicense || inputCite.responsibleBrokerLicense,
          brokerageBrand: sp?.brokerageBrand || inputCite.brokerageBrand,
          officeAddress: sp?.address || inputCite.officeAddress,
          sameAs: sp?.sameAs || inputCite.sameAs,
          canonicalProfileUrl:
            scrape?.finalUrl || inputCite.canonicalProfileUrl || input.website,
          siteAudit: scrape?.siteAudit || inputCite.siteAudit,
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
        };
        const fromSite = scrape?.ok
          ? scrapedListingsToProperties(
              scrape.listings,
              profile.name,
              profile.areaOfOperations,
              scrape.scrapedAt,
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
          appointments: [],
          activity: [welcomeActivity],
          contractors: [],
          favorites: [],
        });
      },

      applyWebsiteScrape: (scrape) => {
        const current = get().agentProfile;
        if (!current) return { listings: 0, profilePatched: false };
        const currentCite = current as CiteAgentProfile;
        const sp = scrape.profile;
        // Confirmed identity changes through profile review. Inventory rescans
        // must neither replace nor add identity fields or scrape metadata.
        const profile: CiteAgentProfile = current.onboardingRevision ? current : {
          ...current,
          phone: sp.phone || current.phone,
          email: sp.email || current.email,
          photoUrl: sp.photoUrl || current.photoUrl,
          agentMlsId: sp.mlsNumber || current.agentMlsId,
          license: sp.license || current.license,
          licenseJurisdiction:
            sp.licenseJurisdiction || currentCite.licenseJurisdiction,
          responsibleBrokerName:
            sp.responsibleBrokerName || currentCite.responsibleBrokerName,
          responsibleBrokerLicense:
            sp.responsibleBrokerLicense || currentCite.responsibleBrokerLicense,
          brokerageBrand: sp.brokerageBrand || currentCite.brokerageBrand,
          officeAddress: sp.address || currentCite.officeAddress,
          sameAs: sp.sameAs?.length ? sp.sameAs : currentCite.sameAs,
          canonicalProfileUrl:
            scrape.finalUrl || currentCite.canonicalProfileUrl || current.website,
          siteAudit: scrape.siteAudit || currentCite.siteAudit,
          bio: sp.bio || current.bio,
          title: sp.title || current.title,
          brokerage: sp.brokerage || current.brokerage,
          dataSource: scrape.ok ? "website" : current.dataSource,
          lastWebsiteScrapeAt: scrape.scrapedAt,
          websiteScrapeSummary: `${scrape.listings.length} listings · ${scrape.pagesFetched.length} pages`,
        };
        const fromSite = scrapedListingsToProperties(
          scrape.listings,
          profile.name,
          profile.areaOfOperations,
          scrape.scrapedAt,
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
        return { listings: fromSite.length, profilePatched: profile !== current };
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
        const profile: AgentProfile = {
          ...current,
          ...patch,
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

      clearOnboarding: () => {
        set({
          agentProfile: null,
          onboarded: false,
          agentMemory: createEmptyMemory(),
          leads: [],
          properties: [],
          deals: [],
          rentals: [],
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
      completePaidCheckout: (sessionId, lifetime) => {
        // A beta-round purchase is for life; a later one buys the 30-day window.
        const billing = lifetime
          ? startLifetimeAccess({ sessionId })
          : startIntroAccess({
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
        // By id only. A real deal can be for a client who shares a name with
        // a sample client, and every sample deal already has a deal_<n> id.
        const deals = s.deals.filter(
          (d) => !seedPropIds.has(d.propertyId) && !/^deal_\d+$/.test(d.id),
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

      clearBook: () => {
        set({
          leads: [],
          properties: [],
          deals: [],
          rentals: [],
          appointments: [],
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
          description: [`${lead.name} scored ${lead.score}`, leadLocation(lead)]
            .filter(Boolean)
            .join(" · "),
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

      addDeal: (input) => {
        const deal: Deal = {
          id: uid("deal"),
          // Not linked to a saved listing: the form does not ask for one.
          propertyId: "",
          ...dealFields(input),
          // Nothing in the product can record an issue or a document yet.
          issues: [],
          documents: [],
          updatedAt: new Date().toISOString(),
        };
        set((s) => ({ deals: [deal, ...s.deals] }));
        get().pushActivity({
          type: "deal",
          title: "Deal added",
          description: `${deal.propertyTitle} · ${deal.clientName}`,
          badge: "Pipeline",
        });
        return deal;
      },

      updateDeal: (id, patch) => {
        set((s) => ({
          deals: s.deals.map((d) => {
            if (d.id !== id) return d;
            const next = { ...d, ...patch, updatedAt: new Date().toISOString() };
            // The progress bar follows the stage unless the caller sets both.
            if (patch.stage && patch.progress === undefined) {
              next.progress = DEAL_STAGE_PROGRESS[patch.stage];
            }
            return next;
          }),
        }));
      },

      advanceDeal: (id) => {
        const deal = get().deals.find((d) => d.id === id);
        if (!deal) return;
        const idx = DEAL_STAGES.indexOf(deal.stage);
        if (idx < 0 || idx >= DEAL_STAGES.length - 1) return;
        const stage = DEAL_STAGES[idx + 1];
        get().updateDeal(id, { stage, progress: DEAL_STAGE_PROGRESS[stage] });
        get().pushActivity({
          type: "deal",
          title: "Deal advanced",
          description: `${deal.propertyTitle} → ${stage.replaceAll("_", " ")}`,
          badge: "Pipeline",
        });
      },

      deleteDeal: (id) => {
        set((s) => ({
          deals: s.deals.filter((d) => d.id !== id),
          // Drop its "done" marks too, so the list does not keep ids for nothing.
          completedPriorities: s.completedPriorities.filter(
            (done) => done !== `risk_${id}` && done !== `ms_${id}`,
          ),
        }));
      },

      updateRental: (id, patch) => {
        set((s) => ({
          rentals: s.rentals.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        }));
      },

      applyMarketRent: (id) => {
        const unit = get().rentals.find((r) => r.id === id);
        // Without a market rent on record there is nothing to apply.
        if (!unit || !(unit.marketRent > 0)) return;
        get().updateRental(id, { rent: unit.marketRent });
        get().pushActivity({
          type: "valuation",
          title: "Rent updated",
          description: `${rentalLabel(unit)} set to the market rent on record`,
          badge: "Rentals",
        });
      },

      addRental: (input) => {
        const unit: RentalUnit = {
          id: uid("rent"),
          ...rentalFields(input),
          // No maintenance score: nothing measures one and the form does not ask.
          issues: [],
        };
        set((s) => ({ rentals: [unit, ...s.rentals] }));
        get().pushActivity({
          type: "valuation",
          title: "Rental unit added",
          description: rentalLabel(unit),
          badge: "Rentals",
        });
        return unit;
      },

      deleteRental: (id) => {
        set((s) => ({
          rentals: s.rentals.filter((r) => r.id !== id),
          completedPriorities: s.completedPriorities.filter(
            (done) => done !== `vac_${id}` && done !== `rent_${id}`,
          ),
        }));
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
        set({
          chat: [
            {
              id: "welcome",
              role: "assistant",
              content: `Chat cleared${name ? `, ${name.split(" ")[0]}` : ""}. Ask about your profile, sold records or strategy.`,
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
          activity: [],
          favorites: [],
          chat: welcomeFor(
            get().agentProfile?.name,
            get().agentProfile?.areaOfOperations,
          ),
          completedPriorities: [],
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
        emailAlerts: s.emailAlerts,
        emailConnection: s.emailConnection,
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
    if (!st.emailAlerts) {
      patch.emailAlerts = [];
    } else if (st.emailAlerts.some(isLegacyGeneratedAlert)) {
      // Builds before the demo inbox was removed (ledger A-021) saved made-up
      // emails. They are matched by their synthetic id only, never by content.
      patch.emailAlerts = st.emailAlerts.filter((a) => !isLegacyGeneratedAlert(a));
    }
    if (st.emailConnection === undefined) patch.emailConnection = null;
    if (!st.billing) patch.billing = emptyBilling();
    if (!st.feedback) patch.feedback = [];
    if (!st.campaigns) patch.campaigns = [];
    if (Object.keys(patch).length) useAppStore.setState(patch);
    // Hydration must preserve saved records. Sample cleanup is an explicit user action.
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
