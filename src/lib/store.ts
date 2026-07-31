import { create } from "zustand";
import { persist } from "zustand/middleware";
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
import {
  localizeLeads,
  pullActiveListingsFromMls,
} from "@/lib/mls";
import type { CampaignPlan, PostStatus, SocialPost } from "@/lib/social-agent";
import {
  applyMemorySignal,
  createEmptyMemory,
  learnFromLead,
  parseRememberCommand,
  type AgentMemory,
  type MemorySignal,
} from "@/lib/agent-memory";
import { isRsfCorridor } from "@/data/rsf-knowledge";
import { uid } from "@/lib/utils";
import {
  DEFAULT_CONNECTIONS,
  buildImportedAppointments,
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

  setSidebarCollapsed: (v: boolean) => void;
  setHydrated: (v: boolean) => void;
  completePriority: (id: string) => void;
  clearCompletedPriorities: () => void;

  completeOnboarding: (
    profile: Omit<AgentProfile, "onboardedAt" | "lastMlsSyncAt">,
  ) => void;
  updateAgentProfile: (
    patch: Partial<Omit<AgentProfile, "onboardedAt">>,
  ) => void;
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

function welcomeFor(name?: string, area?: string): ChatMessage[] {
  const greet = name ? `Hi ${name.split(" ")[0]}` : "Hello";
  const local = isRsfCorridor(area)
    ? " RSF corridor knowledge is loaded — ask about Covenant, comps, or schools."
    : " Your MLS inventory is ready for CMAs and Content Agent packs.";
  return [
    {
      id: "welcome",
      role: "assistant",
      content: `${greet} — I'm your AI real estate copilot.${local} Connect calendars for appointment reminders, and I learn your practice over time.`,
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

function applyProfileToWorkspace(
  profile: AgentProfile,
  existingDeals: Deal[],
): Pick<AppState, "properties" | "leads" | "deals" | "chat"> {
  const properties = pullActiveListingsFromMls(profile);
  const leads = localizeLeads(SEED_LEADS, profile);
  const bySide = properties.filter((p) => p.listingSide === "mine");
  const deals = existingDeals.map((d, i) => {
    const p =
      bySide[i % Math.max(1, bySide.length)] ??
      properties[i % properties.length];
    if (!p) return d;
    return {
      ...d,
      propertyId: p.id,
      propertyTitle: p.title,
      value: p.status === "pending" ? p.price : d.value,
    };
  });
  return {
    properties,
    leads,
    deals,
    chat: welcomeFor(profile.name, profile.areaOfOperations),
  };
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      leads: SEED_LEADS,
      properties: SEED_PROPERTIES,
      deals: SEED_DEALS,
      rentals: SEED_RENTALS,
      activity: SEED_ACTIVITY,
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
      contractors: SEED_CONTRACTORS.map((c) => ({ ...c })),
      billing: emptyBilling(),
      feedback: SEED_FEEDBACK.map((f) => ({
        ...f,
        comments: f.comments.map((c) => ({ ...c })),
      })),

      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setHydrated: (v) => set({ hydrated: v }),

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

      completeOnboarding: (input) => {
        const now = new Date().toISOString();
        const profile: AgentProfile = {
          ...input,
          onboardedAt: now,
          lastMlsSyncAt: now,
        };
        const workspace = applyProfileToWorkspace(profile, SEED_DEALS);
        const active = workspace.properties.filter((p) => p.status === "active");
        const mine = workspace.properties.filter((p) => p.listingSide === "mine");
        const syncActivity: ActivityItem = {
          id: uid("act"),
          type: "valuation",
          title: "MLS sync complete",
          description: `${active.length} active · ${mine.length} on your book · ${input.areaOfOperations}`,
          time: now,
          badge: "MLS",
        };
        set({
          agentProfile: profile,
          onboarded: true,
          hydrated: true,
          agentMemory: seedMemory(profile),
          ...workspace,
          completedPriorities: [],
          campaigns: [],
          activity: [syncActivity, ...SEED_ACTIVITY].slice(0, 40),
          contractors: SEED_CONTRACTORS.map((c) => ({ ...c })),
        });
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
        const workspace = applyProfileToWorkspace(profile, get().deals);
        set({
          agentProfile: profile,
          onboarded: true,
          ...workspace,
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
          title: "Profile & MLS updated",
          description: `${profile.areaOfOperations} · ${profile.mls}`,
          badge: "MLS",
        });
      },

      syncMlsListings: () => {
        const profile = get().agentProfile;
        if (!profile) return;
        const now = new Date().toISOString();
        const next = { ...profile, lastMlsSyncAt: now };
        const workspace = applyProfileToWorkspace(next, get().deals);
        set({
          agentProfile: next,
          ...workspace,
        });
        get().recordSignal({
          kind: "mls_sync",
          text: profile.areaOfOperations,
        });
        get().pushActivity({
          type: "valuation",
          title: "MLS listings refreshed",
          description: `${workspace.properties.filter((p) => p.status === "active").length} active in ${profile.areaOfOperations}`,
          badge: "MLS",
        });
      },

      clearOnboarding: () => {
        set({
          agentProfile: null,
          onboarded: false,
          agentMemory: createEmptyMemory(),
          leads: SEED_LEADS,
          properties: SEED_PROPERTIES,
          deals: SEED_DEALS,
          rentals: SEED_RENTALS,
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
        const profile = get().agentProfile;
        const connectedIds = new Set(
          get()
            .calendarConnections.filter((c) => c.connected)
            .map((c) => c.id),
        );
        if (connectedIds.size === 0) return;

        const pack = buildImportedAppointments(
          profile?.areaOfOperations ?? "Rancho Santa Fe",
          profile?.name ?? "Agent",
        ).filter(
          (a) =>
            a.source === "manual" ||
            connectedIds.has(a.source as CalendarProviderId),
        );

        set((s) => ({
          appointments: mergeImported(s.appointments, pack),
          calendarConnections: s.calendarConnections.map((c) =>
            c.connected ? { ...c, lastSyncAt: new Date().toISOString() } : c,
          ),
        }));

        get().pushActivity({
          type: "chat",
          title: "Calendars synced",
          description: `${pack.length} real estate appointments imported · AI reminders ready`,
          badge: "Calendar",
        });
        get().recordSignal({
          kind: "chat",
          text: "calendar sync appointments reminders inspections showings",
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
                        doc.confidence || 90 + Math.floor(Math.random() * 8),
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
            title: status === "published" ? "Post published" : "Post queued",
            description: `Campaign ${campaignId} · ${status}`,
            badge: "Social",
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
          leads: SEED_LEADS,
          properties: SEED_PROPERTIES,
          deals: SEED_DEALS,
          rentals: SEED_RENTALS,
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
      name: "realestate-ai-workspace-v7",
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
      }),
    },
  ),
);

let hydrationHooked = false;

export function rehydrateStore() {
  if (!hydrationHooked) {
    hydrationHooked = true;
    useAppStore.persist.onFinishHydration(() => {
      const st = useAppStore.getState();
      const patch: Partial<AppState> = {};
      if (!st.agentMemory) patch.agentMemory = createEmptyMemory();
      if (!st.appointments) patch.appointments = [];
      if (!st.calendarConnections)
        patch.calendarConnections = DEFAULT_CONNECTIONS.map((c) => ({ ...c }));
      if (!st.contractors)
        patch.contractors = SEED_CONTRACTORS.map((c) => ({ ...c }));
      if (!st.billing) patch.billing = emptyBilling();
      if (!st.feedback)
        patch.feedback = SEED_FEEDBACK.map((f) => ({
          ...f,
          comments: f.comments.map((c) => ({ ...c })),
        }));
      if (Object.keys(patch).length) useAppStore.setState(patch);
      st.setHydrated(true);
    });
  }
  if (useAppStore.persist.hasHydrated()) {
    useAppStore.getState().setHydrated(true);
    return;
  }
  void useAppStore.persist.rehydrate();
}
