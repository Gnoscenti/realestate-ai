/**
 * First-run product tour — coach marks with targets and plain-language tips.
 */

export type TourPlacement = "top" | "bottom" | "left" | "right" | "center";

export type TourStep = {
  id: string;
  /** CSS selector — usually [data-tour="…"] */
  target?: string;
  title: string;
  body: string;
  placement?: TourPlacement;
  /** Navigate before highlighting */
  route?: string;
  /** Optional tip callout */
  tip?: string;
};

export const PRODUCT_TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to your Agent OS",
    body: "This short tour points out the buttons that matter. Skip anytime — you can replay it from Help.",
    placement: "center",
    tip: "Nothing here is fake demo data. Your book is yours.",
  },
  {
    id: "nav",
    target: '[data-tour="nav-sidebar"]',
    title: "Your menu",
    body: "Every tool lives here. On a phone, open the menu button or use the tabs at the bottom.",
    placement: "right",
    route: "/",
    tip: "Start each day on Command Center — then branch out.",
  },
  {
    id: "command",
    target: '[data-tour="nav-command"]',
    title: "Command Center",
    body: "Your home base. It ranks what to do today so you don’t dig through menus first.",
    placement: "right",
    route: "/",
  },
  {
    id: "action-desk",
    target: '[data-tour="action-desk"]',
    title: "Action Desk",
    body: "Tap a ranked item to open the pack — often with the words ready for a call, text, or email.",
    placement: "left",
    route: "/",
    tip: "Clear the top 3 each morning. That’s the whole system.",
  },
  {
    id: "sync",
    target: '[data-tour="sync-btn"]',
    title: "Sync button",
    body: "Refreshes listings from your MLS connection or website. Use this when inventory looks stale.",
    placement: "bottom",
    route: "/",
    tip: "No connection yet? It’ll nudge you to MLS Hub.",
  },
  {
    id: "instant",
    target: '[data-tour="nav-outreach"]',
    title: "Instant Response",
    body: "When a new lead hits, come here first. Speed-to-lead is the #1 win.",
    placement: "right",
    route: "/outreach",
  },
  {
    id: "leads",
    target: '[data-tour="nav-leads"]',
    title: "Lead Intelligence",
    body: "Your real people list. Import clients or add them by hand — heat scores help you prioritize.",
    placement: "right",
    route: "/leads",
    tip: "Empty is fine. Fake sample clients are not used.",
  },
  {
    id: "mls",
    target: '[data-tour="nav-mls"]',
    title: "MLS Hub",
    body: "Connect Bridge, Trestle, Spark, or your website so listings are real. Ask your office for API access if needed.",
    placement: "right",
    route: "/mls",
  },
  {
    id: "content",
    target: '[data-tour="nav-marketing"]',
    title: "Content Agent",
    body: "Pick a listing and generate social posts you can copy. Best when a real property is on your book.",
    placement: "right",
    route: "/marketing",
  },
  {
    id: "calendar",
    target: '[data-tour="nav-calendar"]',
    title: "Calendar & Vendors",
    body: "Showings, inspections, and your contractor list (termite, electrician…). Mark favorites as common use.",
    placement: "right",
    route: "/calendar",
  },
  {
    id: "done",
    title: "You’re ready",
    body: "Daily loop: Command Center → top actions → Instant Response for new leads → Content Agent for listings.",
    placement: "center",
    route: "/",
    tip: "Replay this tour anytime from the ? Help button.",
  },
];

export const TOUR_STORAGE_HINT = "product-tour-v1";
