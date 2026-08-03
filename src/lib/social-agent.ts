import type { Lead, Property } from "@/data/seed";
import { formatCurrency, uid } from "@/lib/utils";

export type SocialPlatform =
  | "instagram"
  | "facebook"
  | "linkedin"
  | "tiktok"
  | "x"
  | "stories";

export type CampaignGoal =
  | "just_listed"
  | "open_house"
  | "sold"
  | "market_update"
  | "buyer_tips"
  | "seller_tips"
  | "sphere_nurture"
  | "personal_brand"
  | "lead_magnet"
  | "rental_listing";

export type ContentFormat =
  | "feed_post"
  | "carousel"
  | "reel_script"
  | "story"
  | "thread"
  | "long_form";

export type PostStatus = "draft" | "approved" | "queued" | "published";

export type SocialPost = {
  id: string;
  platform: SocialPlatform;
  format: ContentFormat;
  dayOffset: number;
  timeSlot: string;
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
  altText: string;
  visualBrief: string;
  characterCount: number;
  status: PostStatus;
  imageUrl?: string;
  imaginePrompt?: string;
  mediaSource?: "mls" | "website" | "imagine" | "none";
};

export type CampaignPlan = {
  id: string;
  goal: CampaignGoal;
  title: string;
  objective: string;
  audience: string;
  brandVoice: string;
  propertyId?: string;
  propertyLabel?: string;
  platforms: SocialPlatform[];
  durationDays: number;
  kpis: string[];
  strategy: string[];
  posts: SocialPost[];
  calendarNote: string;
  createdAt: string;
};

export type AgentStep = {
  id: string;
  label: string;
  detail: string;
  status: "pending" | "running" | "done";
};

export const PLATFORM_META: Record<
  SocialPlatform,
  { label: string; maxChars: number; bestFor: string }
> = {
  instagram: {
    label: "Instagram",
    maxChars: 2200,
    bestFor: "Visual listings, reels, lifestyle",
  },
  facebook: {
    label: "Facebook",
    maxChars: 5000,
    bestFor: "Open houses, community, ads",
  },
  linkedin: {
    label: "LinkedIn",
    maxChars: 3000,
    bestFor: "Investors, authority, market intel",
  },
  tiktok: {
    label: "TikTok",
    maxChars: 2200,
    bestFor: "Short video, first-time buyers",
  },
  x: {
    label: "X",
    maxChars: 280,
    bestFor: "Hot takes, market pulse, threads",
  },
  stories: {
    label: "Stories",
    maxChars: 400,
    bestFor: "Same-day FOMO, polls, links",
  },
};

export const GOAL_OPTIONS: {
  value: CampaignGoal;
  label: string;
  blurb: string;
}[] = [
  {
    value: "just_listed",
    label: "Just listed",
    blurb: "Launch pack: feed + reels + stories in 72h",
  },
  {
    value: "open_house",
    label: "Open house",
    blurb: "Countdown, day-of, and follow-up posts",
  },
  {
    value: "sold",
    label: "Just sold",
    blurb: "Social proof + soft sphere CTA",
  },
  {
    value: "market_update",
    label: "Market update",
    blurb: "Authority content with data hooks",
  },
  {
    value: "buyer_tips",
    label: "Buyer education",
    blurb: "Post-NAR tips that build trust",
  },
  {
    value: "seller_tips",
    label: "Seller education",
    blurb: "Pricing, staging, timing narratives",
  },
  {
    value: "sphere_nurture",
    label: "Sphere nurture",
    blurb: "Stay top-of-mind without hard sell",
  },
  {
    value: "personal_brand",
    label: "Personal brand",
    blurb: "Agent story, process, differentiators",
  },
  {
    value: "lead_magnet",
    label: "Lead magnet",
    blurb: "DM-for-guide / neighborhood report",
  },
  {
    value: "rental_listing",
    label: "Rental listing",
    blurb: "Fill vacancy with multi-platform push",
  },
];

const VOICE_PRESETS = [
  "Professional & warm",
  "Luxury editorial",
  "Neighborly local expert",
  "Data-driven analyst",
  "High-energy closer",
] as const;

export type BrandVoice = (typeof VOICE_PRESETS)[number] | string;

export { VOICE_PRESETS };

function platformHashtags(
  platform: SocialPlatform,
  goal: CampaignGoal,
  neighborhood?: string,
): string[] {
  const base = ["#RealEstate", "#HomeBuying", "#AgentLife"];
  const local = neighborhood
    ? [`#${neighborhood.replace(/\s+/g, "")}`, "#LocalMarket"]
    : ["#LocalMarket"];
  const byGoal: Record<CampaignGoal, string[]> = {
    just_listed: ["#JustListed", "#NewListing", "#HouseHunting"],
    open_house: ["#OpenHouse", "#ComeSee", "#WeekendPlans"],
    sold: ["#JustSold", "#Closed", "#HappyClients"],
    market_update: ["#MarketUpdate", "#HousingMarket", "#DataDriven"],
    buyer_tips: ["#BuyerTips", "#FirstTimeBuyer", "#HomeGoals"],
    seller_tips: ["#SellingTips", "#HomeSeller", "#ListSmart"],
    sphere_nurture: ["#Community", "#YourNeighborhood", "#StayConnected"],
    personal_brand: ["#RealEstateAgent", "#BehindTheScenes", "#ClientFirst"],
    lead_magnet: ["#FreeGuide", "#NeighborhoodGuide", "#DMMe"],
    rental_listing: ["#ForRent", "#ApartmentLiving", "#MoveInReady"],
  };
  const platformExtra: Partial<Record<SocialPlatform, string[]>> = {
    linkedin: ["#CommercialRealEstate", "#Investing", "#Leadership"],
    tiktok: ["#HouseTok", "#RealEstateTok", "#FYP"],
    x: ["#RETwitter", "#Housing"],
    instagram: ["#IGRealEstate", "#HomesOfInstagram"],
    stories: ["#StoryTime"],
    facebook: ["#CommunityMarketplace"],
  };
  const tags = [
    ...byGoal[goal],
    ...local,
    ...base,
    ...(platformExtra[platform] ?? []),
  ];
  return [...new Set(tags)].slice(0, platform === "x" ? 3 : 8);
}

function voiceLead(voice: string, subject: string): string {
  if (/luxury/i.test(voice))
    return `An address that earns a second look — ${subject}.`;
  if (/data/i.test(voice))
    return `Numbers first: ${subject} is worth a closer read.`;
  if (/energy|closer/i.test(voice))
    return `This one won't wait — ${subject}.`;
  if (/neighbor/i.test(voice))
    return `Hey neighbors — quick update on ${subject}.`;
  return `Sharing something useful on ${subject}.`;
}

function propLine(p?: Property): string {
  if (!p) return "your market";
  return `${p.address} · ${p.beds}bd/${p.baths}ba · ${formatCurrency(p.price)}`;
}

function buildPost(opts: {
  platform: SocialPlatform;
  format: ContentFormat;
  dayOffset: number;
  timeSlot: string;
  hook: string;
  body: string;
  cta: string;
  goal: CampaignGoal;
  neighborhood?: string;
  visualBrief: string;
  altText: string;
}): SocialPost {
  const hashtags = platformHashtags(
    opts.platform,
    opts.goal,
    opts.neighborhood,
  );
  let body = opts.body;
  const max = PLATFORM_META[opts.platform].maxChars;
  let full: string;
  if (opts.platform === "x") {
    full = `${opts.hook} ${body} ${opts.cta} ${hashtags.join(" ")}`;
    if (full.length > max) {
      body = body.slice(
        0,
        Math.max(40, max - opts.hook.length - opts.cta.length - 40),
      );
      full = `${opts.hook} ${body} ${opts.cta} ${hashtags.slice(0, 2).join(" ")}`.slice(
        0,
        max,
      );
    }
  } else {
    const tagBlock = "\n\n" + hashtags.join(" ");
    full = `${opts.hook}\n\n${body}\n\n${opts.cta}${tagBlock}`;
  }
  return {
    id: uid("post"),
    platform: opts.platform,
    format: opts.format,
    dayOffset: opts.dayOffset,
    timeSlot: opts.timeSlot,
    hook: opts.hook,
    body,
    cta: opts.cta,
    hashtags,
    altText: opts.altText,
    visualBrief: opts.visualBrief,
    characterCount: full.length,
    status: "draft",
  };
}

export function composeFullCaption(post: SocialPost): string {
  const tags =
    post.platform === "x"
      ? post.hashtags.join(" ")
      : "\n\n" + post.hashtags.join(" ");
  if (post.platform === "x") {
    return `${post.hook} ${post.body} ${post.cta} ${tags}`.trim();
  }
  return `${post.hook}\n\n${post.body}\n\n${post.cta}${tags}`.trim();
}

function platformEnabled(
  platform: SocialPlatform,
  selected: SocialPlatform[],
): boolean {
  if (platform === "stories") {
    return selected.includes("stories") || selected.includes("instagram");
  }
  return selected.includes(platform);
}

/** Agentic planner: goal + inventory → multi-platform campaign */
export function runSocialContentAgent(input: {
  goal: CampaignGoal;
  platforms: SocialPlatform[];
  voice: string;
  property?: Property;
  lead?: Lead;
  agentName?: string;
  marketNote?: string;
  openHouseWhen?: string;
}): CampaignPlan {
  const agent = input.agentName || "your local agent";
  const p = input.property;
  const neighborhood = p?.neighborhood ?? input.lead?.location ?? "San Diego";
  const voice = input.voice || "Professional & warm";
  const platforms =
    input.platforms.length > 0
      ? input.platforms
      : (["instagram", "facebook", "linkedin"] as SocialPlatform[]);

  const goalMeta = GOAL_OPTIONS.find((g) => g.value === input.goal)!;
  const subject = p
    ? `${p.title} in ${p.neighborhood}`
    : input.goal === "market_update"
      ? `${neighborhood} market`
      : neighborhood;

  const posts: SocialPost[] = [];
  const add = (
    platform: SocialPlatform,
    format: ContentFormat,
    day: number,
    slot: string,
    hook: string,
    body: string,
    cta: string,
    visual: string,
    alt: string,
  ) => {
    if (!platformEnabled(platform, platforms)) return;
    posts.push(
      buildPost({
        platform,
        format,
        dayOffset: day,
        timeSlot: slot,
        hook,
        body,
        cta,
        goal: input.goal,
        neighborhood,
        visualBrief: visual,
        altText: alt,
      }),
    );
  };

  const price = p ? formatCurrency(p.price) : "";
  const feats = p?.features.slice(0, 3).join(", ") ?? "thoughtful finishes";
  const market =
    input.marketNote ||
    `${neighborhood} mid-band inventory is competitive — well-presented homes still move when priced to comps.`;

  switch (input.goal) {
    case "just_listed": {
      add(
        "instagram",
        "feed_post",
        0,
        "9:00 AM",
        voiceLead(voice, "just listed"),
        `${propLine(p)}. Standouts: ${feats}. ${p?.description.slice(0, 160) ?? "Fresh to market with strong curb appeal."}`,
        `${agent} · Message TOUR for a private showing`,
        "Hero exterior + interior collage — no view-count or fake engagement overlays",
        `Exterior of ${p?.address ?? "new listing"}`,
      );
      add(
        "instagram",
        "carousel",
        0,
        "12:00 PM",
        `Swipe the full story — ${p?.beds ?? 3} bed in ${neighborhood}`,
        `Slide 1: exterior\nSlide 2: kitchen/living\nSlide 3: primary suite\nSlide 4: outdoor\nSlide 5: floor-plan callout + price ${price}\n\nWhy it wins: ${feats}.`,
        "Book a private showing this week",
        "5-card carousel: exterior → kitchen → suite → yard → floor plan",
        `Photo tour of ${p?.title ?? "listing"}`,
      );
      add(
        "instagram",
        "reel_script",
        1,
        "6:30 PM",
        "Hook (0–2s): “Stop scrolling if you want [neighborhood]…”",
        `VO script:\n0–2s: Pattern interrupt on exterior\n2–8s: Walk kitchen/living — call out ${feats.split(",")[0] ?? "updates"}\n8–14s: Outdoor living\n14–20s: Price ${price} + beds/baths on screen\n20–25s: On-camera: “Comment TOUR for details.”`,
        "Caption: Comment TOUR for details",
        "Vertical 9:16 walkthrough, trending audio soft luxury",
        "Video walkthrough of listing",
      );
      add(
        "facebook",
        "feed_post",
        0,
        "10:00 AM",
        `NEW LISTING · ${p?.address ?? neighborhood}`,
        `${p?.beds ?? "—"} bed / ${p?.baths ?? "—"} bath · ${p?.sqft?.toLocaleString() ?? "—"} sqft · ${price}\n\n${p?.description.slice(0, 220) ?? "Reach out for the full feature sheet."}\n\nHighlights: ${feats}.`,
        "Message for a private tour this week.",
        "Wide listing graphic with map pin + price",
        `Facebook listing card for ${p?.address ?? "property"}`,
      );
      add(
        "linkedin",
        "long_form",
        1,
        "8:00 AM",
        `Listing insight: ${neighborhood} inventory worth a look`,
        `I just brought ${p?.title ?? "a property"} live at ${price}.\n\nFor buyer-clients: ${feats} matter for both livability and resale.\n\nFor my network: if you know a relocating household targeting ${neighborhood}, happy to share the CMA context behind the list price — not just portal photos.`,
        "DM for the one-pager.",
        "Professional listing photo + subtle market chart inset",
        "LinkedIn market listing post",
      );
      add(
        "tiktok",
        "reel_script",
        1,
        "7:00 PM",
        "POV: you finally found the one in " + neighborhood,
        `Beat sheet:\n• Cold open: door open reveal\n• Text overlay: ${p?.beds}BD · ${price}\n• 3 quick cuts: kitchen, light, outdoor\n• End card: “DM TOUR for details”`,
        "Follow for more " + neighborhood + " homes",
        "Fast cuts, natural light, on-screen captions",
        "TikTok listing teaser",
      );
      add(
        "x",
        "feed_post",
        0,
        "11:00 AM",
        `Just listed · ${neighborhood}`,
        `${p?.beds ?? "—"}bd ${price}. ${feats.split(",")[0] ?? "Updated"}.`,
        "Message for details.",
        "Single hero still",
        "Tweet listing announce",
      );
      add(
        "stories",
        "story",
        0,
        "8:00 AM",
        "JUST LISTED",
        `${p?.address ?? neighborhood} · ${price}\nPoll: Tour this week? Yes / Send info`,
        "Swipe-up / link sticker → calendar",
        "Full-bleed exterior + sticker poll",
        "Story frame just listed",
      );
      break;
    }
    case "open_house": {
      const when = input.openHouseWhen || "Sat 1–4 PM";
      add(
        "instagram",
        "feed_post",
        0,
        "9:00 AM",
        `Open house ${when} — ${neighborhood}`,
        `Walk ${propLine(p)} in person. Expect: ${feats}. Street parking tips + what to notice on tour included when you RSVP.`,
        `RSVP “OPEN” in DMs · ${when}`,
        "Invite graphic with date/time badge",
        "Open house invitation",
      );
      add(
        "facebook",
        "feed_post",
        0,
        "10:30 AM",
        `You're invited · Open House ${when}`,
        `${p?.address ?? neighborhood}\n\nCome meet the home (and me). First-time buyers welcome — I'll walk process + financing FAQs on site.`,
        "RSVP in comments for a prep checklist PDF.",
        "Event-style cover image",
        "Facebook open house event",
      );
      add(
        "stories",
        "story",
        1,
        "12:00 PM",
        "Tomorrow / today countdown",
        `Open house ${when}\nLocation sticker + countdown\nFAQ sticker: “What should I bring?” → pre-approval letter if possible`,
        "Link to map",
        "Countdown sticker on kitchen still",
        "OH countdown story",
      );
      add(
        "instagram",
        "reel_script",
        1,
        "5:00 PM",
        "Day-before teaser reel",
        `15s: exterior dusk + text “See you ${when}” + three interior flashes + map pin end card.`,
        "Save the date · share with a friend",
        "Dusk exterior + upbeat local audio",
        "Open house teaser reel",
      );
      add(
        "x",
        "feed_post",
        1,
        "9:00 AM",
        `Open house ${when}`,
        `${neighborhood} · ${p?.beds ?? "—"}bd${price ? ` · ${price}` : ""}`,
        "Reply OPEN for address pin.",
        "Map thumbnail",
        "OH tweet",
      );
      break;
    }
    case "sold": {
      add(
        "instagram",
        "feed_post",
        0,
        "10:00 AM",
        `JUST SOLD · ${neighborhood}`,
        `Grateful to help my clients close on ${p?.title ?? "their home"}. Strategy: right price band, tight feedback loop, clean disclosures.\n\nThinking of selling or buying next? Let's talk timing — not pressure.`,
        "DM “PLAN” for a 15-min strategy call",
        "Sold banner over hero photo (tasteful)",
        "Just sold celebration post",
      );
      add(
        "linkedin",
        "long_form",
        0,
        "8:30 AM",
        "Closing note from the field",
        `Another ${neighborhood} close in the books.\n\nWhat worked: data-backed pricing (CMA, not vibes), rapid first-touch on inbound, and written expectations on both sides.\n\nIf your network is relocating to the area, I’m happy to be a resource.`,
        "Connect or message for market one-pager.",
        "Understated sold graphic + skyline",
        "LinkedIn sold post",
      );
      add(
        "facebook",
        "feed_post",
        1,
        "11:00 AM",
        "Another happy closing",
        `Celebrating with clients who just closed in ${neighborhood}. Referrals keep this business personal — thank you for the trust.`,
        "Know someone moving? Happy to help.",
        "Warm lifestyle image",
        "Facebook sold",
      );
      break;
    }
    case "market_update": {
      add(
        "instagram",
        "carousel",
        0,
        "8:00 AM",
        `${neighborhood} market snapshot`,
        `Slide 1: Title + month\nSlide 2: Median-feel takeaway (inventory / DOM narrative)\nSlide 3: What it means for buyers\nSlide 4: What it means for sellers\nSlide 5: CTA\n\n${market}`,
        "Save · share with a neighbor · DM “NUMBERS”",
        "Clean 5-slide data carousel, chart style",
        "Market update carousel",
      );
      add(
        "linkedin",
        "long_form",
        0,
        "7:45 AM",
        `${neighborhood}: what buyers & sellers should watch this month`,
        `${market}\n\nPractical takeaways:\n1. Buyers — pre-approval + speed still beat “perfect”\n2. Sellers — presentation + pricing to live comps > wishful list price\n3. Both — written representation agreements keep expectations clean (post-NAR reality)\n\nI publish these so my clients decide with context, not headlines.`,
        "Comment with your zip for a tighter read.",
        "Minimal chart graphic",
        "LinkedIn market essay",
      );
      add(
        "x",
        "thread",
        0,
        "9:15 AM",
        `Thread: ${neighborhood} housing pulse`,
        `1/ ${market.slice(0, 120)}\n2/ Buyers: focus on payment comfort + inspection risk\n3/ Sellers: DOM discipline beats chasing the high print\n4/ DM if you want the full one-pager`,
        "RT if useful",
        "Simple text cards",
        "Market thread",
      );
      add(
        "facebook",
        "feed_post",
        1,
        "12:00 PM",
        `Community market note — ${neighborhood}`,
        `${market}\n\nQuestions welcome in the comments — no sales pitch required.`,
        "Message me for a free neighborhood brief.",
        "Friendly neighborhood photo",
        "FB market update",
      );
      break;
    }
    case "buyer_tips": {
      add(
        "instagram",
        "carousel",
        0,
        "11:00 AM",
        "5 buyer moves that still win in 2026",
        `1. Written buyer agreement before touring (clarity > surprises)\n2. Pre-approval letter that matches your real payment comfort\n3. Tour with a shortlist of 3 — not 30 tabs\n4. Ask for a CMA-backed offer strategy, not portal guesses\n5. Plan inspection priorities before you fall in love`,
        "Save this · DM “BUYER” for a checklist PDF",
        "Numbered tip cards, high contrast",
        "Buyer tips carousel",
      );
      add(
        "tiktok",
        "reel_script",
        1,
        "6:00 PM",
        "Nobody tells first-time buyers this…",
        "Hook → 3 myths (Zestimate = offer, waiting always saves money, you don’t need an agreement) → CTA follow for part 2.",
        "Follow for weekly buyer clinics",
        "Talking-head + B-roll keys/door",
        "Buyer tips reel",
      );
      add(
        "linkedin",
        "long_form",
        2,
        "8:00 AM",
        "How I prep buyer clients post-NAR",
        "Compensation conversations work when value is concrete: search strategy, risk control, negotiation with comps, and transaction management.\n\nI walk every client through a simple agreement outline and a sample CMA so the fee discussion is about outcomes — not awkwardness.",
        "Happy to share the outline structure I use.",
        "Desk / laptop professional still",
        "Buyer process LinkedIn",
      );
      break;
    }
    case "seller_tips": {
      add(
        "instagram",
        "carousel",
        0,
        "10:00 AM",
        "Before you list: the 4 decisions that set your net",
        `1. Price to live comps (CMA), not hope\n2. Photo + declutter week (AI staging only after basics)\n3. Repair vs credit strategy for inspections\n4. Launch week calendar (broker tour, open house, feedback loop)`,
        "DM “SELL” for a pre-list scorecard",
        "Seller checklist carousel",
        "Seller tips",
      );
      add(
        "facebook",
        "feed_post",
        1,
        "1:00 PM",
        "Thinking of selling in the next 6–12 months?",
        "The highest-ROI prep is rarely a full renovation — it’s pricing honesty, presentation, and a launch plan. I run free pre-list consults with a mini-CMA.",
        "Comment SELL and I’ll send times.",
        "Before/after declutter concept",
        "Seller FB post",
      );
      add(
        "linkedin",
        "long_form",
        2,
        "8:15 AM",
        "Listing strategy > listing volume",
        "Sellers still over-index on portal traffic and under-index on offer quality. My process: CMA package, go-to-market plan, and weekly feedback metrics until under contract.",
        "Message for a sample CMA outline.",
        "Clean analytical graphic",
        "Seller LinkedIn",
      );
      break;
    }
    case "sphere_nurture": {
      add(
        "instagram",
        "feed_post",
        0,
        "5:30 PM",
        "Grateful for this community",
        `Whether you bought with me, referred a friend, or just follow along — thank you. I’m here for honest market reads on ${neighborhood}, not daily spam.`,
        "Know someone relocating? I’m a safe intro.",
        "Warm community / local landmark photo",
        "Sphere thank you",
      );
      add(
        "facebook",
        "feed_post",
        3,
        "12:00 PM",
        "Resource for friends & past clients",
        "I put together a simple quarterly homeowner checklist (insurance, maintenance, equity snapshot). Happy to email it — no strings.",
        "Comment GUIDE or message me.",
        "Checklist mockup",
        "Sphere resource",
      );
      add(
        "stories",
        "story",
        1,
        "9:00 AM",
        "Quick hello",
        "Poll: What do you want more of? Market numbers / Home tips / Listing tours",
        "DM anytime",
        "Casual selfie or office still + poll",
        "Sphere poll story",
      );
      break;
    }
    case "personal_brand": {
      add(
        "instagram",
        "reel_script",
        0,
        "6:00 PM",
        "Day in the life — what an agent actually does",
        "Beats: morning lead triage → CMA build → showing → contract review → evening follow-ups. Text overlays for each. End: “I sell process, not hype.”",
        "Follow for unfiltered agent OS",
        "B-roll phone, laptop, keys, neighborhood",
        "Personal brand reel",
      );
      add(
        "linkedin",
        "long_form",
        1,
        "7:30 AM",
        "How I run an agent OS in 2026",
        "My stack is simple: ranked daily queue (speed-to-lead first), instant response scripts, CMA + buyer agreement clarity, and content that teaches.\n\nAI drafts. I decide. Clients feel the speed and the judgment.",
        "What’s one workflow you’d automate first?",
        "Clean workspace photo",
        "Personal brand LinkedIn",
      );
      add(
        "x",
        "thread",
        2,
        "9:00 AM",
        "Agent OS notes",
        "1/ Speed-to-lead is still the game\n2/ CMAs beat Zestimates in listing wins\n3/ Content works when it’s useful, not loud\n4/ Write the agreement before the tour",
        "Follow for more field notes",
        "Text-first",
        "Brand thread",
      );
      break;
    }
    case "lead_magnet": {
      add(
        "instagram",
        "feed_post",
        0,
        "11:30 AM",
        `Free ${neighborhood} buyer / seller guide`,
        "What’s inside: pricing bands, school/commute notes, sample offer timeline, and questions to ask any agent (including me).",
        "DM “GUIDE” — I’ll send the PDF today",
        "Lead magnet mockup cover",
        "Lead magnet post",
      );
      add(
        "facebook",
        "feed_post",
        0,
        "1:00 PM",
        `${neighborhood} neighborhood report (free)`,
        "Built for people quietly planning a 2026–27 move. No spam sequence — one useful PDF.",
        "Message GUIDE to receive it.",
        "Map + report cover",
        "FB lead magnet",
      );
      add(
        "linkedin",
        "long_form",
        1,
        "8:00 AM",
        "I open-sourced my neighborhood brief structure",
        "If you lead a team, teach agents to publish a monthly brief: inventory narrative, rate context, and 3 action tips. It’s content and lead gen in one.",
        "Comment BRIEF for the template outline.",
        "Document aesthetic",
        "LinkedIn magnet",
      );
      add(
        "stories",
        "story",
        0,
        "8:00 AM",
        "GUIDE drop",
        "Tap sticker → DM keyword GUIDE\nWho it’s for: first-time + relocators",
        "Link / DM",
        "Bold type story",
        "Magnet story",
      );
      break;
    }
    case "rental_listing": {
      add(
        "instagram",
        "feed_post",
        0,
        "10:00 AM",
        `For rent · ${p?.address ?? neighborhood}`,
        `${p?.beds ?? "—"} bed · ${p?.baths ?? "—"} bath · ${p ? formatCurrency(p.price) + "/mo feel" : "competitive rent"} · ${feats}`,
        "DM “RENT” for application next steps",
        "Bright unit photos, rent badge",
        "Rental listing",
      );
      add(
        "facebook",
        "feed_post",
        0,
        "12:00 PM",
        "Available now — quality rental",
        `${propLine(p)}\n\nIdeal for: professionals who want low-friction living. Tours this week.`,
        "Message to schedule a walkthrough.",
        "Multi-photo album",
        "FB rental",
      );
      add(
        "x",
        "feed_post",
        1,
        "9:00 AM",
        `Rental open · ${neighborhood}`,
        `${p?.beds ?? "—"}bd · message for details`,
        "DM RENT",
        "Single photo",
        "Rental tweet",
      );
      break;
    }
  }

  for (const pl of platforms) {
    if (pl === "stories") continue;
    if (posts.some((x) => x.platform === pl)) continue;
    add(
      pl,
      pl === "tiktok" ? "reel_script" : "feed_post",
      0,
      "10:00 AM",
      voiceLead(voice, goalMeta.label.toLowerCase()),
      `${subject}. ${market.slice(0, 140)}`,
      `Connect with ${agent} for next steps.`,
      "Brand-consistent graphic",
      `${goalMeta.label} post`,
    );
  }

  const durationDays = Math.max(1, ...posts.map((x) => x.dayOffset), 0) + 1;

  return {
    id: uid("camp"),
    goal: input.goal,
    title: `${goalMeta.label} · ${subject}`,
    objective: goalMeta.blurb,
    audience: p
      ? `Buyers/sellers watching ${p.neighborhood} · ${p.type} segment`
      : input.lead
        ? `${input.lead.name}'s segment · ${input.lead.location}`
        : `Sphere + local ${neighborhood} audience`,
    brandVoice: voice,
    propertyId: p?.id,
    propertyLabel: p ? `${p.title} · ${p.address}` : undefined,
    platforms,
    durationDays,
    kpis: [
      "Saves / shares (top of funnel)",
      "DM keywords (TOUR, GUIDE, SELL)",
      "Profile visits → site / CRM leads",
      "Qualified conversations within 7 days",
    ],
    strategy: [
      "Hook in first line — portal scrollers decide in <2s",
      "One clear CTA per post — no fake view counts or “000 views” overlays",
      "Alternate education vs inventory so feed isn’t all listing spam",
      "Repurpose: carousel → stories → short reel script from same asset pack",
      "Log every DM keyword into Lead Intelligence same day",
    ],
    posts: posts.sort(
      (a, b) =>
        a.dayOffset - b.dayOffset || a.timeSlot.localeCompare(b.timeSlot),
    ),
    calendarNote: `${durationDays}-day roll-out. Best windows: weekdays 8–11am & 5–7pm local; open-house pushes 24h + 2h before.`,
    createdAt: new Date().toISOString(),
  };
}

export function getAgentPipeline(goal: CampaignGoal): AgentStep[] {
  const label = GOAL_OPTIONS.find((g) => g.value === goal)?.label ?? "Campaign";
  return [
    {
      id: "brief",
      label: "Ingest brief",
      detail: `Goal: ${label}. Pull inventory, audience, brand voice.`,
      status: "pending",
    },
    {
      id: "strategy",
      label: "Plan strategy",
      detail: "Pick platforms, cadence, KPIs, and content mix.",
      status: "pending",
    },
    {
      id: "generate",
      label: "Generate pack",
      detail: "Draft hooks, bodies, CTAs, hashtags, visual briefs.",
      status: "pending",
    },
    {
      id: "calendar",
      label: "Build calendar",
      detail: "Schedule day/time slots and cross-post variants.",
      status: "pending",
    },
    {
      id: "qa",
      label: "QA & compliance",
      detail: "Length limits, fair housing tone, one-CTA rule.",
      status: "pending",
    },
  ];
}

export function exportCampaignMarkdown(plan: CampaignPlan): string {
  const lines: string[] = [
    `# ${plan.title}`,
    "",
    `**Objective:** ${plan.objective}`,
    `**Audience:** ${plan.audience}`,
    `**Voice:** ${plan.brandVoice}`,
    `**Duration:** ${plan.durationDays} day(s)`,
    `**Platforms:** ${plan.platforms.map((p) => PLATFORM_META[p].label).join(", ")}`,
    "",
    "## Strategy",
    ...plan.strategy.map((s) => `- ${s}`),
    "",
    "## KPIs",
    ...plan.kpis.map((k) => `- ${k}`),
    "",
    `## Calendar note`,
    plan.calendarNote,
    "",
    "## Posts",
  ];
  for (const post of plan.posts) {
    lines.push(
      "",
      `### Day ${post.dayOffset} · ${post.timeSlot} · ${PLATFORM_META[post.platform].label} · ${post.format}`,
      "",
      composeFullCaption(post),
      "",
      `*Visual:* ${post.visualBrief}`,
      `*Alt:* ${post.altText}`,
      `*Status:* ${post.status}`,
    );
  }
  return lines.join("\n");
}

export function suggestContentGap(properties: Property[]): {
  goal: CampaignGoal;
  reason: string;
  property?: Property;
} {
  const active = properties.filter((p) => p.status === "active");
  const coming = properties.find((p) => p.status === "coming_soon");
  const sold = properties.find((p) => p.status === "sold");
  if (active[0]) {
    return {
      goal: "just_listed",
      reason: `${active[0].title} is live without a fresh multi-platform pack — NAR: writing/social is ~78% of agent AI use.`,
      property: active[0],
    };
  }
  if (coming) {
    return {
      goal: "just_listed",
      reason: "Coming-soon inventory should seed teaser content before MLS day.",
      property: coming,
    };
  }
  if (sold) {
    return {
      goal: "sold",
      reason: "Harvest social proof from recent close while the story is warm.",
      property: sold,
    };
  }
  return {
    goal: "market_update",
    reason: "No hot listing — ship authority market content to stay visible.",
  };
}
