/**
 * Rules for the deals and rental units an agent enters by hand.
 *
 * Pure functions only (no React, no store), so the same rules run in the forms,
 * in the store and in unit tests. Nothing here invents a value: a field the
 * agent leaves blank is stored as "not entered", never as a guess.
 */
import type { Deal, RentalUnit } from "@/data/seed";
import { parseLocalCalendarDate } from "@/lib/calendar-date";

export const DEAL_STAGES = [
  "offer",
  "under_contract",
  "inspection",
  "appraisal",
  "clear_to_close",
  "closed",
] as const satisfies readonly Deal["stage"][];

export const DEAL_STAGE_LABEL: Record<Deal["stage"], string> = {
  offer: "Offer",
  under_contract: "Under contract",
  inspection: "Inspection",
  appraisal: "Appraisal",
  clear_to_close: "Clear to close",
  closed: "Closed",
};

/**
 * How far along each stage is, as a share of the six stages. It is a fixed
 * figure per stage, shown as a progress bar; it measures nothing about a
 * particular deal.
 */
export const DEAL_STAGE_PROGRESS: Record<Deal["stage"], number> = {
  offer: 15,
  under_contract: 40,
  inspection: 55,
  appraisal: 70,
  clear_to_close: 88,
  closed: 100,
};

export const RENTAL_STATUS_LABEL: Record<RentalUnit["occupancy"], string> = {
  occupied: "Occupied",
  vacant: "Vacant",
  notice: "Notice given",
};

export type NewDealInput = {
  propertyTitle: string;
  clientName: string;
  value: number;
  stage: Deal["stage"];
  /** ISO timestamp at local midnight. Omitted when no closing date is set. */
  closingDate?: string;
};

export type NewRentalInput = {
  address: string;
  unit?: string;
  beds: number;
  baths: number;
  sqft?: number;
  occupancy: RentalUnit["occupancy"];
  /** Required unless the unit is vacant. */
  rent?: number;
  /** The agent's own estimate. No code looks one up. */
  marketRent?: number;
  tenant?: string;
  /** ISO timestamp at local midnight. */
  leaseEnd?: string;
};

export type DealForm = {
  propertyTitle: string;
  clientName: string;
  value: string;
  stage: string;
  closingDate: string;
};

export type RentalForm = {
  address: string;
  unit: string;
  beds: string;
  baths: string;
  sqft: string;
  occupancy: string;
  rent: string;
  marketRent: string;
  tenant: string;
  leaseEnd: string;
};

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export const EMPTY_DEAL_FORM: DealForm = {
  propertyTitle: "",
  clientName: "",
  value: "",
  stage: "",
  closingDate: "",
};

export const EMPTY_RENTAL_FORM: RentalForm = {
  address: "",
  unit: "",
  beds: "",
  baths: "",
  sqft: "",
  occupancy: "",
  rent: "",
  marketRent: "",
  tenant: "",
  leaseEnd: "",
};

const MAX_TEXT = 200;
/** Above any real price or rent; catches a slipped decimal or a pasted phone number. */
const MAX_AMOUNT = 1_000_000_000;

/** A blank field is "not entered". Number("") is 0, which would read as a real zero. */
function numberOrNull(raw: string): number | null {
  const text = raw.trim().replace(/[$,\s]/g, "");
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function isStage(value: string): value is Deal["stage"] {
  return (DEAL_STAGES as readonly string[]).includes(value);
}

function isOccupancy(value: string): value is RentalUnit["occupancy"] {
  return value === "occupied" || value === "vacant" || value === "notice";
}

/** The value a date field shows for a stored ISO timestamp: YYYY-MM-DD in local time. */
export function dateFieldValue(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "310 Seabreeze Dr, Unit A", or only the address when there is no unit number. */
export function rentalLabel(unit: Pick<RentalUnit, "address" | "unit">): string {
  const number = unit.unit?.trim();
  return number ? `${unit.address}, Unit ${number}` : unit.address;
}

export function parseDealForm(form: DealForm): ParseResult<NewDealInput> {
  const propertyTitle = form.propertyTitle.trim();
  if (!propertyTitle) return { ok: false, error: "Enter the property address or name." };
  if (propertyTitle.length > MAX_TEXT) {
    return { ok: false, error: `Keep the property to ${MAX_TEXT} characters or fewer.` };
  }
  const clientName = form.clientName.trim();
  if (!clientName) return { ok: false, error: "Enter the client's name." };
  if (clientName.length > MAX_TEXT) {
    return { ok: false, error: `Keep the client's name to ${MAX_TEXT} characters or fewer.` };
  }
  const value = numberOrNull(form.value);
  if (value === null || value <= 0 || value > MAX_AMOUNT) {
    return { ok: false, error: "Enter the price as a number greater than 0." };
  }
  if (!isStage(form.stage)) return { ok: false, error: "Choose the stage this deal is in." };

  let closingDate: string | undefined;
  if (form.closingDate.trim()) {
    const parsed = parseLocalCalendarDate(form.closingDate.trim());
    if (!parsed) return { ok: false, error: "Enter a real closing date, or leave it blank." };
    closingDate = parsed.toISOString();
  }
  return {
    ok: true,
    value: { propertyTitle, clientName, value: Math.round(value), stage: form.stage, closingDate },
  };
}

export function parseRentalForm(form: RentalForm): ParseResult<NewRentalInput> {
  const address = form.address.trim();
  if (!address) return { ok: false, error: "Enter the street address." };
  if (address.length > MAX_TEXT) {
    return { ok: false, error: `Keep the address to ${MAX_TEXT} characters or fewer.` };
  }
  const unit = form.unit.trim();
  if (unit.length > 20) {
    return { ok: false, error: "Keep the unit number to 20 characters or fewer." };
  }
  if (!isOccupancy(form.occupancy)) {
    return { ok: false, error: "Choose a status: occupied, vacant or notice given." };
  }
  const beds = numberOrNull(form.beds);
  if (beds === null || !Number.isInteger(beds) || beds < 0 || beds > 99) {
    return {
      ok: false,
      error: "Enter the number of bedrooms as a whole number. Use 0 for a studio.",
    };
  }
  const baths = numberOrNull(form.baths);
  if (baths === null || baths <= 0 || baths > 99) {
    return { ok: false, error: "Enter the number of bathrooms, for example 1 or 1.5." };
  }
  const sqft = numberOrNull(form.sqft);
  if (form.sqft.trim() && (sqft === null || sqft <= 0 || sqft > 1_000_000)) {
    return {
      ok: false,
      error: "Enter the square footage as a number greater than 0, or leave it blank.",
    };
  }

  const vacant = form.occupancy === "vacant";
  const rent = numberOrNull(form.rent);
  if (!vacant && (rent === null || rent <= 0 || rent > MAX_AMOUNT)) {
    return { ok: false, error: "Enter the monthly rent as a number greater than 0." };
  }
  const marketRent = numberOrNull(form.marketRent);
  if (form.marketRent.trim() && (marketRent === null || marketRent <= 0 || marketRent > MAX_AMOUNT)) {
    return {
      ok: false,
      error: "Enter the market rent as a number greater than 0, or leave it blank.",
    };
  }
  const tenant = form.tenant.trim();
  if (tenant.length > MAX_TEXT) {
    return { ok: false, error: `Keep the tenant's name to ${MAX_TEXT} characters or fewer.` };
  }
  let leaseEnd: string | undefined;
  if (!vacant && form.leaseEnd.trim()) {
    const parsed = parseLocalCalendarDate(form.leaseEnd.trim());
    if (!parsed) return { ok: false, error: "Enter a real lease end date, or leave it blank." };
    leaseEnd = parsed.toISOString();
  }

  return {
    ok: true,
    value: {
      address,
      unit: unit || undefined,
      beds,
      baths,
      sqft: sqft === null ? undefined : Math.round(sqft),
      occupancy: form.occupancy,
      // A vacant unit has no rent, tenant or lease, whatever was typed before the status changed.
      rent: vacant || rent === null ? undefined : Math.round(rent),
      marketRent: marketRent === null ? undefined : Math.round(marketRent),
      tenant: vacant || !tenant ? undefined : tenant,
      leaseEnd,
    },
  };
}

/** The fields of a deal that the form controls, as stored. Used to add and to edit. */
export function dealFields(
  input: NewDealInput,
): Pick<Deal, "propertyTitle" | "clientName" | "value" | "stage" | "progress" | "closingDate"> {
  return {
    propertyTitle: input.propertyTitle.trim(),
    clientName: input.clientName.trim(),
    value: Math.round(input.value),
    stage: input.stage,
    progress: DEAL_STAGE_PROGRESS[input.stage],
    closingDate: input.closingDate ?? "",
  };
}

/**
 * The fields of a rental unit that the form controls, as stored. Used to add
 * and to edit, so tenant and leaseEnd are always present as keys: editing an
 * occupied unit to vacant has to clear them, and `undefined` does that.
 * 0 means "not entered" for sqft and marketRent; the pages hide it.
 */
export function rentalFields(
  input: NewRentalInput,
): Pick<
  RentalUnit,
  | "address"
  | "unit"
  | "beds"
  | "baths"
  | "sqft"
  | "rent"
  | "marketRent"
  | "tenant"
  | "leaseEnd"
  | "occupancy"
> {
  const vacant = input.occupancy === "vacant";
  const tenant = input.tenant?.trim();
  return {
    address: input.address.trim(),
    unit: input.unit?.trim() ?? "",
    beds: input.beds,
    baths: input.baths,
    sqft: input.sqft ?? 0,
    rent: vacant ? 0 : Math.round(input.rent ?? 0),
    marketRent: Math.round(input.marketRent ?? 0),
    tenant: !vacant && tenant ? tenant : undefined,
    leaseEnd: !vacant && input.leaseEnd ? input.leaseEnd : undefined,
    occupancy: input.occupancy,
  };
}

/** Pre-fill the form to edit an existing deal. */
export function dealFormFrom(deal: Deal): DealForm {
  return {
    propertyTitle: deal.propertyTitle,
    clientName: deal.clientName,
    value: deal.value > 0 ? String(deal.value) : "",
    stage: deal.stage,
    closingDate: dateFieldValue(deal.closingDate),
  };
}

/** Pre-fill the form to edit an existing unit. Zero ("not entered") shows as blank. */
export function rentalFormFrom(unit: RentalUnit): RentalForm {
  const shown = (value: number) => (value > 0 ? String(value) : "");
  return {
    address: unit.address,
    unit: unit.unit ?? "",
    beds: String(unit.beds),
    baths: String(unit.baths),
    sqft: shown(unit.sqft),
    occupancy: unit.occupancy,
    rent: shown(unit.rent),
    marketRent: shown(unit.marketRent),
    tenant: unit.tenant ?? "",
    leaseEnd: dateFieldValue(unit.leaseEnd),
  };
}
