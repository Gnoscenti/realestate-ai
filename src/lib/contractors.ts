/** Vendor / contractor directory for real estate transactions */

export type ContractorCategory =
  | "termite"
  | "home_inspection"
  | "electrician"
  | "plumber"
  | "hvac"
  | "roofer"
  | "pest_control"
  | "appraiser"
  | "title_escrow"
  | "photographer"
  | "stager"
  | "landscaper"
  | "general_contractor"
  | "pool"
  | "septic"
  | "chimney"
  | "mold"
  | "foundation"
  | "handyman"
  | "cleaner";

export interface Contractor {
  id: string;
  name: string;
  company: string;
  category: ContractorCategory;
  phone: string;
  email: string;
  website?: string;
  serviceArea: string;
  notes: string;
  rating: number; // 1–5 agent rating
  /** Times used / referred from this app */
  useCount: number;
  /** Pin to Commonly Used list */
  common: boolean;
  /** Soft-deleted retain history? we keep and flag inactive */
  active: boolean;
  lastUsedAt?: string;
  createdAt: string;
}

export const CONTRACTOR_CATEGORIES: {
  id: ContractorCategory;
  label: string;
  short: string;
}[] = [
  { id: "termite", label: "Termite / WDO", short: "Termite" },
  { id: "home_inspection", label: "Home inspection", short: "Inspection" },
  { id: "electrician", label: "Electrician", short: "Electrical" },
  { id: "plumber", label: "Plumber", short: "Plumbing" },
  { id: "hvac", label: "HVAC", short: "HVAC" },
  { id: "roofer", label: "Roofer", short: "Roofing" },
  { id: "pest_control", label: "Pest control", short: "Pest" },
  { id: "appraiser", label: "Appraiser", short: "Appraisal" },
  { id: "title_escrow", label: "Title / Escrow", short: "Title" },
  { id: "photographer", label: "Photographer", short: "Photo" },
  { id: "stager", label: "Stager", short: "Staging" },
  { id: "landscaper", label: "Landscaper", short: "Landscape" },
  { id: "general_contractor", label: "General contractor", short: "GC" },
  { id: "pool", label: "Pool service", short: "Pool" },
  { id: "septic", label: "Septic", short: "Septic" },
  { id: "chimney", label: "Chimney", short: "Chimney" },
  { id: "mold", label: "Mold remediation", short: "Mold" },
  { id: "foundation", label: "Foundation", short: "Foundation" },
  { id: "handyman", label: "Handyman", short: "Handyman" },
  { id: "cleaner", label: "Cleaner / turn-key", short: "Cleaning" },
];

export function contractorCategoryLabel(c: ContractorCategory): string {
  return CONTRACTOR_CATEGORIES.find((x) => x.id === c)?.label ?? c;
}

const T0 = "2026-01-15T12:00:00.000Z";

export const SEED_CONTRACTORS: Contractor[] = [
  {
    id: "ctr_term_01",
    name: "Diego Morales",
    company: "Covenant Termite Pros",
    category: "termite",
    phone: "(858) 555-0142",
    email: "diego@covenanttermite.example",
    serviceArea: "Rancho Santa Fe, Fairbanks, Encinitas",
    notes: "Fast Section 1 reports. Familiar with estate crawlspaces.",
    rating: 5,
    useCount: 14,
    common: true,
    active: true,
    lastUsedAt: "2026-07-20T15:00:00.000Z",
    createdAt: T0,
  },
  {
    id: "ctr_term_02",
    name: "Lisa Park",
    company: "North County WDO",
    category: "termite",
    phone: "(760) 555-0198",
    email: "lisa@ncwdo.example",
    serviceArea: "Del Mar, Solana Beach, Carmel Valley",
    notes: "Backup when Covenant Pros is booked.",
    rating: 4,
    useCount: 6,
    common: true,
    active: true,
    lastUsedAt: "2026-06-02T10:00:00.000Z",
    createdAt: T0,
  },
  {
    id: "ctr_insp_01",
    name: "Ryan Holtz",
    company: "Holtz Home Inspections",
    category: "home_inspection",
    phone: "(858) 555-0110",
    email: "ryan@holtzinspect.example",
    website: "https://holtzinspect.example",
    serviceArea: "RSF corridor + coastal",
    notes: "Same-day summary call. Great with luxury buyers.",
    rating: 5,
    useCount: 22,
    common: true,
    active: true,
    lastUsedAt: "2026-07-28T18:00:00.000Z",
    createdAt: T0,
  },
  {
    id: "ctr_insp_02",
    name: "Amina Shah",
    company: "Precision Property Inspect",
    category: "home_inspection",
    phone: "(619) 555-0177",
    email: "amina@precisionpi.example",
    serviceArea: "San Diego County",
    notes: "Detailed thermal imaging available.",
    rating: 5,
    useCount: 9,
    common: true,
    active: true,
    lastUsedAt: "2026-05-14T14:00:00.000Z",
    createdAt: T0,
  },
  {
    id: "ctr_elec_01",
    name: "Marco Villanueva",
    company: "Village Electric Co.",
    category: "electrician",
    phone: "(858) 555-0166",
    email: "marco@villageelectric.example",
    serviceArea: "Rancho Santa Fe, Del Mar",
    notes: "Panel upgrades, EV chargers, pre-list electrical.",
    rating: 5,
    useCount: 11,
    common: true,
    active: true,
    lastUsedAt: "2026-07-10T11:00:00.000Z",
    createdAt: T0,
  },
  {
    id: "ctr_elec_02",
    name: "Chris Nguyen",
    company: "Coastline Electric",
    category: "electrician",
    phone: "(760) 555-0133",
    email: "chris@coastlineelec.example",
    serviceArea: "Encinitas, Solana Beach, Cardiff",
    notes: "Emergency calls for escrow contingencies.",
    rating: 4,
    useCount: 5,
    common: false,
    active: true,
    createdAt: T0,
  },
  {
    id: "ctr_plumb_01",
    name: "Hector Ruiz",
    company: "Fairbanks Plumbing",
    category: "plumber",
    phone: "(858) 555-0121",
    email: "hector@fairbanksplumb.example",
    serviceArea: "Fairbanks Ranch, RSF, 4S",
    notes: "Repipe + fixture upgrades for listing prep.",
    rating: 5,
    useCount: 8,
    common: true,
    active: true,
    lastUsedAt: "2026-07-01T09:00:00.000Z",
    createdAt: T0,
  },
  {
    id: "ctr_hvac_01",
    name: "Sam Okonkwo",
    company: "Coastal Climate Systems",
    category: "hvac",
    phone: "(858) 555-0188",
    email: "sam@coastalclimate.example",
    serviceArea: "North County coastal + inland",
    notes: "HVAC service reports for buyer inspections.",
    rating: 4,
    useCount: 7,
    common: true,
    active: true,
    createdAt: T0,
  },
  {
    id: "ctr_roof_01",
    name: "Brandon Lee",
    company: "Pacific Crest Roofing",
    category: "roofer",
    phone: "(760) 555-0144",
    email: "brandon@pacroof.example",
    serviceArea: "San Diego County",
    notes: "Tile & flat roof specialists for estates.",
    rating: 5,
    useCount: 4,
    common: false,
    active: true,
    createdAt: T0,
  },
  {
    id: "ctr_pest_01",
    name: "Nina Alvarez",
    company: "Trailside Pest Control",
    category: "pest_control",
    phone: "(858) 555-0190",
    email: "nina@trailsidepest.example",
    serviceArea: "RSF, Olivenhain, Encinitas",
    notes: "Eco options for equestrian properties.",
    rating: 4,
    useCount: 3,
    common: false,
    active: true,
    createdAt: T0,
  },
  {
    id: "ctr_appr_01",
    name: "Patricia Cho",
    company: "Cho Valuation Group",
    category: "appraiser",
    phone: "(858) 555-0155",
    email: "patricia@choval.example",
    serviceArea: "Luxury North County",
    notes: "Strong on Covenant / Bridges comps.",
    rating: 5,
    useCount: 10,
    common: true,
    active: true,
    lastUsedAt: "2026-07-22T16:00:00.000Z",
    createdAt: T0,
  },
  {
    id: "ctr_title_01",
    name: "Elena Brooks",
    company: "Pacific Horizon Title",
    category: "title_escrow",
    phone: "(858) 555-0101",
    email: "elena@phtitle.example",
    serviceArea: "San Diego County",
    notes: "Preferred escrow officer for RSF deals.",
    rating: 5,
    useCount: 18,
    common: true,
    active: true,
    lastUsedAt: "2026-07-29T12:00:00.000Z",
    createdAt: T0,
  },
  {
    id: "ctr_photo_01",
    name: "Jules Remy",
    company: "Remy Media Studio",
    category: "photographer",
    phone: "(619) 555-0128",
    email: "jules@remymedia.example",
    serviceArea: "RSF + coastal luxury",
    notes: "Twilight + drone. 24h delivery for just-listed.",
    rating: 5,
    useCount: 16,
    common: true,
    active: true,
    lastUsedAt: "2026-07-25T19:00:00.000Z",
    createdAt: T0,
  },
  {
    id: "ctr_stage_01",
    name: "Claire Fontaine",
    company: "Atelier Stage Co.",
    category: "stager",
    phone: "(858) 555-0171",
    email: "claire@atelierstage.example",
    serviceArea: "Del Mar, RSF, La Jolla",
    notes: "Estate-scale staging inventory.",
    rating: 5,
    useCount: 7,
    common: true,
    active: true,
    createdAt: T0,
  },
  {
    id: "ctr_land_01",
    name: "Owen Briggs",
    company: "Covenant Landscapes",
    category: "landscaper",
    phone: "(858) 555-0139",
    email: "owen@covenantland.example",
    serviceArea: "Rancho Santa Fe Covenant",
    notes: "Pre-list curb appeal + drought-smart.",
    rating: 4,
    useCount: 5,
    common: false,
    active: true,
    createdAt: T0,
  },
  {
    id: "ctr_gc_01",
    name: "Tony Esposito",
    company: "Esposito Build Group",
    category: "general_contractor",
    phone: "(760) 555-0162",
    email: "tony@espositobuild.example",
    serviceArea: "North County",
    notes: "Repair bids after inspection — escrow friendly.",
    rating: 5,
    useCount: 9,
    common: true,
    active: true,
    createdAt: T0,
  },
  {
    id: "ctr_pool_01",
    name: "Mike Sandoval",
    company: "Azure Pool Care",
    category: "pool",
    phone: "(858) 555-0148",
    email: "mike@azurepool.example",
    serviceArea: "RSF, Fairbanks, Carmel Valley",
    notes: "Equipment certs for buyer inspections.",
    rating: 4,
    useCount: 4,
    common: false,
    active: true,
    createdAt: T0,
  },
  {
    id: "ctr_septic_01",
    name: "Greg Halloway",
    company: "Halloway Septic Services",
    category: "septic",
    phone: "(760) 555-0115",
    email: "greg@hallowayseptic.example",
    serviceArea: "Olivenhain, RSF acreage, Elfin Forest",
    notes: "Critical for rural / equestrian parcels.",
    rating: 5,
    useCount: 3,
    common: true,
    active: true,
    createdAt: T0,
  },
  {
    id: "ctr_chim_01",
    name: "Ray Foster",
    company: "Foster Chimney Sweep",
    category: "chimney",
    phone: "(858) 555-0193",
    email: "ray@fosterchimney.example",
    serviceArea: "San Diego County",
    notes: "Level 2 inspections for escrow.",
    rating: 4,
    useCount: 2,
    common: false,
    active: true,
    createdAt: T0,
  },
  {
    id: "ctr_mold_01",
    name: "Dr. Leah Kim",
    company: "ClearAir Mold Lab",
    category: "mold",
    phone: "(619) 555-0184",
    email: "leah@clearairmold.example",
    serviceArea: "San Diego County",
    notes: "Testing + remediation coordination.",
    rating: 5,
    useCount: 2,
    common: false,
    active: true,
    createdAt: T0,
  },
  {
    id: "ctr_found_01",
    name: "Walter Singh",
    company: "Singh Structural Engineers",
    category: "foundation",
    phone: "(858) 555-0107",
    email: "walter@singhstruct.example",
    serviceArea: "North County",
    notes: "Hillside / slab consults for estates.",
    rating: 5,
    useCount: 3,
    common: false,
    active: true,
    createdAt: T0,
  },
  {
    id: "ctr_handy_01",
    name: "Jose Mendez",
    company: "Punchlist Pros",
    category: "handyman",
    phone: "(858) 555-0124",
    email: "jose@punchlistpros.example",
    serviceArea: "RSF corridor",
    notes: "Pre-list punch list under 48h turnaround.",
    rating: 5,
    useCount: 12,
    common: true,
    active: true,
    lastUsedAt: "2026-07-18T13:00:00.000Z",
    createdAt: T0,
  },
  {
    id: "ctr_clean_01",
    name: "Sofia Ramirez",
    company: "White Glove Listing Clean",
    category: "cleaner",
    phone: "(760) 555-0159",
    email: "sofia@whitegloveclean.example",
    serviceArea: "Coastal + RSF",
    notes: "Photo-day cleans and open-house reset.",
    rating: 5,
    useCount: 13,
    common: true,
    active: true,
    lastUsedAt: "2026-07-27T08:00:00.000Z",
    createdAt: T0,
  },
];

/** Commonly used: pinned common flag OR high useCount, grouped by category */
export function commonlyUsedContractors(
  list: Contractor[],
  limit = 24,
): Contractor[] {
  return [...list]
    .filter((c) => c.active && (c.common || c.useCount >= 5))
    .sort((a, b) => {
      if (a.common !== b.common) return a.common ? -1 : 1;
      return b.useCount - a.useCount;
    })
    .slice(0, limit);
}

export function groupContractorsByCategory(
  list: Contractor[],
): { category: ContractorCategory; label: string; items: Contractor[] }[] {
  const active = list.filter((c) => c.active);
  return CONTRACTOR_CATEGORIES.map((cat) => ({
    category: cat.id,
    label: cat.label,
    items: active
      .filter((c) => c.category === cat.id)
      .sort((a, b) => b.useCount - a.useCount || b.rating - a.rating),
  })).filter((g) => g.items.length > 0);
}

export function contractorsForCategory(
  list: Contractor[],
  category: ContractorCategory,
): Contractor[] {
  return list
    .filter((c) => c.active && c.category === category)
    .sort((a, b) => b.useCount - a.useCount);
}
