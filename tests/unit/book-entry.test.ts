import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEAL_STAGES,
  DEAL_STAGE_PROGRESS,
  EMPTY_DEAL_FORM,
  EMPTY_RENTAL_FORM,
  dateFieldValue,
  dealFields,
  dealFormFrom,
  parseDealForm,
  parseRentalForm,
  rentalFields,
  rentalFormFrom,
  rentalLabel,
  type DealForm,
  type RentalForm,
} from "@/lib/book-entry";
import { SEED_DEALS, SEED_RENTALS } from "@/data/seed";

const deal = (over: Partial<DealForm> = {}): DealForm => ({
  propertyTitle: "12 Harbor Way",
  clientName: "Dana Whitfield",
  value: "850000",
  stage: "offer",
  closingDate: "",
  ...over,
});

const unit = (over: Partial<RentalForm> = {}): RentalForm => ({
  address: "40 Juniper St",
  unit: "",
  beds: "2",
  baths: "1.5",
  sqft: "",
  occupancy: "occupied",
  rent: "2400",
  marketRent: "",
  tenant: "",
  leaseEnd: "",
  ...over,
});

function expectError<T>(result: { ok: true; value: T } | { ok: false; error: string }): string {
  expect(result.ok).toBe(false);
  return result.ok ? "" : result.error;
}

function expectValue<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(`expected a valid form, got: ${result.error}`);
  return result.value;
}

describe("deal form", () => {
  it("starts with nothing filled in, so nothing is saved that the agent did not enter", () => {
    expect(Object.values(EMPTY_DEAL_FORM).every((value) => value === "")).toBe(true);
    expect(expectError(parseDealForm(EMPTY_DEAL_FORM))).toBe("Enter the property address or name.");
  });

  it("names the first thing that is missing or wrong", () => {
    expect(expectError(parseDealForm(deal({ propertyTitle: "   " })))).toBe(
      "Enter the property address or name.",
    );
    expect(expectError(parseDealForm(deal({ clientName: "" })))).toBe("Enter the client's name.");
    for (const value of ["", "  ", "0", "-5", "abc", "1e400"]) {
      expect(expectError(parseDealForm(deal({ value })))).toBe(
        "Enter the price as a number greater than 0.",
      );
    }
    expect(expectError(parseDealForm(deal({ stage: "" })))).toBe("Choose the stage this deal is in.");
    expect(expectError(parseDealForm(deal({ stage: "won" })))).toBe("Choose the stage this deal is in.");
    expect(expectError(parseDealForm(deal({ closingDate: "2026-02-30" })))).toBe(
      "Enter a real closing date, or leave it blank.",
    );
  });

  it("trims text, rounds the price and accepts a pasted price with a dollar sign and commas", () => {
    const value = expectValue(
      parseDealForm(deal({ propertyTitle: "  12 Harbor Way ", clientName: " Dana Whitfield ", value: "$1,250,000.49" })),
    );
    expect(value).toMatchObject({
      propertyTitle: "12 Harbor Way",
      clientName: "Dana Whitfield",
      value: 1_250_000,
      stage: "offer",
    });
    expect(value.closingDate).toBeUndefined();
  });

  it("rejects text that is too long to be a name or an address", () => {
    expect(expectError(parseDealForm(deal({ propertyTitle: "x".repeat(201) })))).toMatch(/200 characters/);
    expect(expectError(parseDealForm(deal({ clientName: "x".repeat(201) })))).toMatch(/200 characters/);
  });

  it("stores a closing date at local midnight, so it reads back as the day that was typed", () => {
    const value = expectValue(parseDealForm(deal({ closingDate: "2026-12-01" })));
    expect(value.closingDate).toBe(new Date("2026-12-01T00:00:00").toISOString());
    const shown = new Date(value.closingDate!);
    expect([shown.getFullYear(), shown.getMonth() + 1, shown.getDate()]).toEqual([2026, 12, 1]);
    expect(dateFieldValue(value.closingDate)).toBe("2026-12-01");
  });

  it("derives progress from the stage and stores a missing closing date as an empty string", () => {
    for (const stage of DEAL_STAGES) {
      const fields = dealFields(expectValue(parseDealForm(deal({ stage }))));
      expect(fields.progress).toBe(DEAL_STAGE_PROGRESS[stage]);
      expect(fields.closingDate).toBe("");
    }
    expect(DEAL_STAGES.map((stage) => DEAL_STAGE_PROGRESS[stage])).toEqual([15, 40, 55, 70, 88, 100]);
  });

  it("round-trips an existing deal through the edit form without changing it", () => {
    for (const existing of SEED_DEALS) {
      const fields = dealFields(expectValue(parseDealForm(dealFormFrom(existing))));
      expect(fields.propertyTitle).toBe(existing.propertyTitle);
      expect(fields.clientName).toBe(existing.clientName);
      expect(fields.value).toBe(existing.value);
      expect(fields.stage).toBe(existing.stage);
    }
  });
});

describe("rental unit form", () => {
  it("starts with nothing filled in", () => {
    expect(Object.values(EMPTY_RENTAL_FORM).every((value) => value === "")).toBe(true);
    expect(expectError(parseRentalForm(EMPTY_RENTAL_FORM))).toBe("Enter the street address.");
  });

  it("names the first thing that is missing or wrong", () => {
    expect(expectError(parseRentalForm(unit({ occupancy: "" })))).toBe(
      "Choose a status: occupied, vacant or notice given.",
    );
    for (const beds of ["", "1.5", "-1", "x"]) {
      expect(expectError(parseRentalForm(unit({ beds })))).toBe(
        "Enter the number of bedrooms as a whole number. Use 0 for a studio.",
      );
    }
    for (const baths of ["", "0", "-1"]) {
      expect(expectError(parseRentalForm(unit({ baths })))).toBe(
        "Enter the number of bathrooms, for example 1 or 1.5.",
      );
    }
    expect(expectError(parseRentalForm(unit({ sqft: "0" })))).toBe(
      "Enter the square footage as a number greater than 0, or leave it blank.",
    );
    expect(expectError(parseRentalForm(unit({ rent: "" })))).toBe(
      "Enter the monthly rent as a number greater than 0.",
    );
    expect(expectError(parseRentalForm(unit({ occupancy: "notice", rent: "0" })))).toBe(
      "Enter the monthly rent as a number greater than 0.",
    );
    expect(expectError(parseRentalForm(unit({ marketRent: "-10" })))).toBe(
      "Enter the market rent as a number greater than 0, or leave it blank.",
    );
    expect(expectError(parseRentalForm(unit({ leaseEnd: "2026-13-01" })))).toBe(
      "Enter a real lease end date, or leave it blank.",
    );
  });

  it("accepts a studio and a half bathroom", () => {
    const value = expectValue(parseRentalForm(unit({ beds: "0", baths: "0.5" })));
    expect(value.beds).toBe(0);
    expect(value.baths).toBe(0.5);
  });

  it("leaves optional figures unset instead of saving a zero as if it were entered", () => {
    const value = expectValue(parseRentalForm(unit()));
    expect(value.sqft).toBeUndefined();
    expect(value.marketRent).toBeUndefined();
    expect(value.tenant).toBeUndefined();
    expect(value.leaseEnd).toBeUndefined();
    expect(value.unit).toBeUndefined();
    // As stored: 0 means "not entered" and the pages hide it.
    expect(rentalFields(value)).toMatchObject({ sqft: 0, marketRent: 0, unit: "", rent: 2400 });
  });

  it("does not ask a vacant unit for rent, and drops rent, tenant and lease typed before the status changed", () => {
    const value = expectValue(
      parseRentalForm(
        unit({ occupancy: "vacant", rent: "2400", tenant: "Old Tenant", leaseEnd: "2026-06-30", marketRent: "2600" }),
      ),
    );
    expect(value.rent).toBeUndefined();
    expect(value.tenant).toBeUndefined();
    expect(value.leaseEnd).toBeUndefined();
    const stored = rentalFields(value);
    expect(stored.rent).toBe(0);
    expect(stored.marketRent).toBe(2600);
    // Present as keys with undefined, so editing an occupied unit to vacant clears them.
    expect("tenant" in stored && stored.tenant === undefined).toBe(true);
    expect("leaseEnd" in stored && stored.leaseEnd === undefined).toBe(true);
    expect(expectValue(parseRentalForm(unit({ occupancy: "vacant", rent: "" }))).occupancy).toBe("vacant");
  });

  it("keeps the tenant and a local-midnight lease end for a rented unit", () => {
    const stored = rentalFields(
      expectValue(parseRentalForm(unit({ tenant: "  Priya Nair ", leaseEnd: "2027-03-31", unit: " 2B " }))),
    );
    expect(stored.tenant).toBe("Priya Nair");
    expect(stored.unit).toBe("2B");
    expect(dateFieldValue(stored.leaseEnd)).toBe("2027-03-31");
  });

  it("round-trips every sample unit through the edit form without changing what is stored", () => {
    for (const existing of SEED_RENTALS) {
      const stored = rentalFields(expectValue(parseRentalForm(rentalFormFrom(existing))));
      expect(stored.address).toBe(existing.address);
      expect(stored.unit).toBe(existing.unit);
      expect(stored.beds).toBe(existing.beds);
      expect(stored.baths).toBe(existing.baths);
      expect(stored.occupancy).toBe(existing.occupancy);
      expect(stored.rent).toBe(existing.occupancy === "vacant" ? 0 : existing.rent);
      expect(stored.marketRent).toBe(existing.marketRent);
      expect(stored.tenant).toBe(existing.occupancy === "vacant" ? undefined : existing.tenant);
    }
  });
});

describe("labels and dates", () => {
  it("names a unit by address, adding the unit number only when there is one", () => {
    expect(rentalLabel({ address: "310 Seabreeze Dr", unit: "A" })).toBe("310 Seabreeze Dr, Unit A");
    expect(rentalLabel({ address: "40 Juniper St", unit: "" })).toBe("40 Juniper St");
    expect(rentalLabel({ address: "40 Juniper St", unit: "   " })).toBe("40 Juniper St");
  });

  it("shows no date for a missing or unreadable timestamp", () => {
    expect(dateFieldValue(undefined)).toBe("");
    expect(dateFieldValue("")).toBe("");
    expect(dateFieldValue("not a date")).toBe("");
  });
});

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

describe("deals and rental units in the store", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "localStorage");
    Reflect.deleteProperty(globalThis, "window");
    vi.resetModules();
  });

  async function freshStore() {
    const localStorage = createMemoryStorage();
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: localStorage });
    Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage } });
    const { useAppStore } = await import("@/lib/store");
    return { useAppStore, localStorage };
  }

  it("adds a deal with only what was entered and puts it first", async () => {
    const { useAppStore } = await freshStore();
    const first = useAppStore.getState().addDeal(expectValue(parseDealForm(deal())));
    const second = useAppStore
      .getState()
      .addDeal(expectValue(parseDealForm(deal({ propertyTitle: "9 Elm Ct", stage: "inspection" }))));

    expect(first.id).toMatch(/^deal_/);
    // Sample deals are recognised by a numeric id; a real one must never look like that.
    expect(first.id).not.toMatch(/^deal_\d+$/);
    expect(first).toMatchObject({
      propertyId: "",
      propertyTitle: "12 Harbor Way",
      clientName: "Dana Whitfield",
      value: 850_000,
      stage: "offer",
      progress: 15,
      closingDate: "",
      issues: [],
      documents: [],
    });
    expect(Number.isFinite(Date.parse(first.updatedAt))).toBe(true);
    expect(second.progress).toBe(55);
    expect(useAppStore.getState().deals.map((d) => d.id)).toEqual([second.id, first.id]);
    expect(useAppStore.getState().activity[0]).toMatchObject({ type: "deal", title: "Deal added" });
    expect(useAppStore.getState().activity[0].badge).not.toBe("");
  });

  it("keeps the progress bar in step when a deal's stage is edited, forwards or back", async () => {
    const { useAppStore } = await freshStore();
    const created = useAppStore.getState().addDeal(expectValue(parseDealForm(deal({ stage: "appraisal" }))));
    useAppStore.getState().updateDeal(created.id, { stage: "under_contract" });
    expect(useAppStore.getState().deals[0]).toMatchObject({ stage: "under_contract", progress: 40 });
    useAppStore.getState().advanceDeal(created.id);
    expect(useAppStore.getState().deals[0]).toMatchObject({ stage: "inspection", progress: 55 });
    // An explicit progress still wins, as advanceDeal and the sample data rely on.
    useAppStore.getState().updateDeal(created.id, { stage: "closed", progress: 97 });
    expect(useAppStore.getState().deals[0].progress).toBe(97);
  });

  it("deletes one deal and only that deal, with its completed marks", async () => {
    const { useAppStore } = await freshStore();
    const keep = useAppStore.getState().addDeal(expectValue(parseDealForm(deal())));
    const drop = useAppStore.getState().addDeal(expectValue(parseDealForm(deal({ propertyTitle: "9 Elm Ct" }))));
    useAppStore.getState().completePriority(`ms_${drop.id}`);
    useAppStore.getState().completePriority(`ms_${keep.id}`);
    useAppStore.getState().deleteDeal(drop.id);
    expect(useAppStore.getState().deals.map((d) => d.id)).toEqual([keep.id]);
    expect(useAppStore.getState().completedPriorities).toEqual([`ms_${keep.id}`]);
    useAppStore.getState().deleteDeal("no-such-deal");
    expect(useAppStore.getState().deals).toHaveLength(1);
  });

  it("adds a rental unit with no invented score, rent or market rent", async () => {
    const { useAppStore } = await freshStore();
    const vacant = useAppStore
      .getState()
      .addRental(expectValue(parseRentalForm(unit({ occupancy: "vacant", rent: "" }))));
    expect(vacant.id).toMatch(/^rent_/);
    expect(vacant.id).not.toMatch(/^rent_\d+$/);
    expect(vacant).toMatchObject({ rent: 0, marketRent: 0, sqft: 0, occupancy: "vacant", issues: [] });
    expect(vacant.maintenanceScore).toBeUndefined();
    expect(vacant.tenant).toBeUndefined();
    expect(vacant.leaseEnd).toBeUndefined();
    expect(useAppStore.getState().activity[0]).toMatchObject({
      title: "Rental unit added",
      description: "40 Juniper St",
    });
  });

  it("clears the tenant and lease when a rented unit is edited to vacant", async () => {
    const { useAppStore } = await freshStore();
    const rented = useAppStore
      .getState()
      .addRental(expectValue(parseRentalForm(unit({ tenant: "Priya Nair", leaseEnd: "2027-03-31" }))));
    expect(rented).toMatchObject({ tenant: "Priya Nair", rent: 2400 });
    const edited = rentalFields(
      expectValue(parseRentalForm({ ...rentalFormFrom(rented), occupancy: "vacant" })),
    );
    useAppStore.getState().updateRental(rented.id, edited);
    const after = useAppStore.getState().rentals[0];
    expect(after.occupancy).toBe("vacant");
    expect(after.rent).toBe(0);
    expect(after.tenant).toBeUndefined();
    expect(after.leaseEnd).toBeUndefined();
  });

  it("applies the market rent only when one is on record", async () => {
    const { useAppStore } = await freshStore();
    const none = useAppStore.getState().addRental(expectValue(parseRentalForm(unit())));
    useAppStore.getState().applyMarketRent(none.id);
    expect(useAppStore.getState().rentals[0].rent).toBe(2400);
    const some = useAppStore.getState().addRental(expectValue(parseRentalForm(unit({ marketRent: "2700" }))));
    useAppStore.getState().applyMarketRent(some.id);
    expect(useAppStore.getState().rentals.find((r) => r.id === some.id)?.rent).toBe(2700);
  });

  it("deletes one rental unit and only that unit", async () => {
    const { useAppStore } = await freshStore();
    const keep = useAppStore.getState().addRental(expectValue(parseRentalForm(unit())));
    const drop = useAppStore.getState().addRental(expectValue(parseRentalForm(unit({ address: "7 Birch Ln" }))));
    useAppStore.getState().deleteRental(drop.id);
    expect(useAppStore.getState().rentals.map((r) => r.id)).toEqual([keep.id]);
  });

  it("never removes a real deal for sharing a sample client's name", async () => {
    const { useAppStore } = await freshStore();
    const real = useAppStore
      .getState()
      .addDeal(expectValue(parseDealForm(deal({ clientName: "Sarah Johnson" }))));
    const unitAdded = useAppStore.getState().addRental(expectValue(parseRentalForm(unit())));
    useAppStore.getState().purgeSeedData();
    expect(useAppStore.getState().deals.map((d) => d.id)).toEqual([real.id]);
    expect(useAppStore.getState().rentals.map((r) => r.id)).toEqual([unitAdded.id]);
  });
});
