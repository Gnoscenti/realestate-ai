import { z } from "zod";
import {
  MAX_SOLD_CSV_BYTES,
  MAX_SOLD_CSV_ROWS,
  SOLD_CSV_PREVIEW_ROWS,
  type SoldCsvPreview,
  type SoldCsvRowError,
  type SoldRecordInput,
} from "./types";

const optionalText = (max: number) => z.string().trim().max(max).nullable();

const soldRecordSchema: z.ZodType<SoldRecordInput> = z.object({
  recordKey: z.string().trim().min(1).max(240),
  listingKey: optionalText(240),
  mlsNumber: optionalText(120),
  standardStatus: z.enum(["Closed", "Sold"]),
  addressLine1: z.string().trim().min(1).max(300),
  addressLine2: optionalText(160),
  city: z.string().trim().min(1).max(120),
  state: z.string().trim().min(1).max(80),
  postalCode: optionalText(24),
  subdivision: optionalText(160),
  closePrice: z.number().finite().positive().max(999_999_999_999.99),
  closeDate: z.string().date(),
  listPrice: z.number().finite().positive().max(999_999_999_999.99).nullable(),
  originalListPrice: z
    .number()
    .finite()
    .positive()
    .max(999_999_999_999.99)
    .nullable(),
  beds: z.number().finite().nonnegative().max(999.99).nullable(),
  baths: z.number().finite().nonnegative().max(999.99).nullable(),
  livingArea: z.number().int().positive().max(100_000_000),
  yearBuilt: z.number().int().min(1000).max(2200).nullable(),
  propertyType: z.string().trim().min(1).max(160),
  propertySubtype: optionalText(160),
  latitude: z.number().finite().min(-90).max(90).nullable(),
  longitude: z.number().finite().min(-180).max(180).nullable(),
  daysOnMarket: z.number().int().nonnegative().max(1_000_000).nullable(),
  sourceUpdatedAt: z.string().datetime({ offset: true }).nullable(),
});

type CanonicalField =
  | "recordKey"
  | "listingKey"
  | "mlsNumber"
  | "standardStatus"
  | "fullAddress"
  | "addressLine1"
  | "addressLine2"
  | "city"
  | "state"
  | "postalCode"
  | "subdivision"
  | "closePrice"
  | "closeDate"
  | "listPrice"
  | "originalListPrice"
  | "beds"
  | "baths"
  | "livingArea"
  | "yearBuilt"
  | "propertyType"
  | "propertySubtype"
  | "latitude"
  | "longitude"
  | "daysOnMarket"
  | "sourceUpdatedAt";

const HEADER_ALIASES: Record<string, CanonicalField> = {
  record_key: "recordKey",
  recordkey: "recordKey",
  record_id: "recordKey",
  listing_key: "listingKey",
  listingkey: "listingKey",
  listing_id: "listingKey",
  mls_number: "mlsNumber",
  mlsnumber: "mlsNumber",
  mls_no: "mlsNumber",
  mls: "mlsNumber",
  standard_status: "standardStatus",
  standardstatus: "standardStatus",
  status: "standardStatus",
  mls_status: "standardStatus",
  full_address: "fullAddress",
  fulladdress: "fullAddress",
  address: "fullAddress",
  unparsed_address: "fullAddress",
  unparsedaddress: "fullAddress",
  address_line_1: "addressLine1",
  address_line1: "addressLine1",
  street_address: "addressLine1",
  street: "addressLine1",
  address_line_2: "addressLine2",
  address_line2: "addressLine2",
  unit: "addressLine2",
  city: "city",
  city_name: "city",
  cityname: "city",
  state: "state",
  state_or_province: "state",
  stateorprovince: "state",
  province: "state",
  postal_code: "postalCode",
  postalcode: "postalCode",
  zip: "postalCode",
  zip_code: "postalCode",
  subdivision: "subdivision",
  subdivision_name: "subdivision",
  subdivisionname: "subdivision",
  close_price: "closePrice",
  sold_price: "closePrice",
  soldprice: "closePrice",
  sale_price: "closePrice",
  saleprice: "closePrice",
  closeprice: "closePrice",
  close_date: "closeDate",
  closedate: "closeDate",
  sold_date: "closeDate",
  solddate: "closeDate",
  sale_date: "closeDate",
  saledate: "closeDate",
  closed_date: "closeDate",
  list_price: "listPrice",
  listprice: "listPrice",
  current_list_price: "listPrice",
  currentlistprice: "listPrice",
  original_list_price: "originalListPrice",
  originallistprice: "originalListPrice",
  beds: "beds",
  bedrooms: "beds",
  bedrooms_total: "beds",
  bedroomstotal: "beds",
  baths: "baths",
  bathrooms: "baths",
  bathrooms_total_integer: "baths",
  bathroomstotalinteger: "baths",
  bathrooms_total_decimal: "baths",
  bathroomstotaldecimal: "baths",
  living_area: "livingArea",
  livingarea: "livingArea",
  living_area_sqft: "livingArea",
  square_feet: "livingArea",
  squarefeet: "livingArea",
  sqft: "livingArea",
  year_built: "yearBuilt",
  yearbuilt: "yearBuilt",
  property_type: "propertyType",
  propertytype: "propertyType",
  property_subtype: "propertySubtype",
  propertysubtype: "propertySubtype",
  latitude: "latitude",
  longitude: "longitude",
  days_on_market: "daysOnMarket",
  daysonmarket: "daysOnMarket",
  dom: "daysOnMarket",
  source_updated_at: "sourceUpdatedAt",
  sourceupdatedat: "sourceUpdatedAt",
  modification_timestamp: "sourceUpdatedAt",
  modificationtimestamp: "sourceUpdatedAt",
};

function normalizedHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** RFC 4180-style parser: quoted commas/newlines and doubled quotes are kept. */
function parseCsvRows(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let afterQuote = false;

  const finishCell = () => {
    row.push(cell.trim());
    cell = "";
    afterQuote = false;
  };
  const finishRow = () => {
    finishCell();
    if (row.some((value) => value.length > 0)) rows.push(row);
    row = [];
  };

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index]!;
    if (quoted) {
      if (char === '"') {
        if (raw[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"' && cell.length === 0 && !afterQuote) {
      quoted = true;
    } else if (char === ",") {
      finishCell();
    } else if (char === "\n") {
      finishRow();
    } else if (char === "\r") {
      if (raw[index + 1] === "\n") index += 1;
      finishRow();
    } else if (afterQuote && /\s/.test(char)) {
      // RFC allows whitespace between a closing quote and delimiter.
    } else if (afterQuote) {
      throw new Error("Unexpected character after a closing quote");
    } else {
      cell += char;
    }
  }
  if (quoted) throw new Error("Unclosed quoted field");
  if (cell.length > 0 || row.length > 0) finishRow();
  return rows;
}

function field(
  row: string[],
  columns: Partial<Record<CanonicalField, number>>,
  name: CanonicalField,
): string {
  const index = columns[name];
  return index === undefined ? "" : (row[index] ?? "").trim();
}

function addError(
  errors: SoldCsvRowError[],
  row: number,
  fieldName: string,
  message: string,
): void {
  errors.push({ row, field: fieldName, message });
}

function required(value: string, errors: SoldCsvRowError[], row: number, name: string): string {
  if (!value) addError(errors, row, name, "Required");
  return value;
}

function parseNumber(
  raw: string,
  row: number,
  name: string,
  errors: SoldCsvRowError[],
  options: { required?: boolean; integer?: boolean; positive?: boolean } = {},
): number | null {
  if (!raw) {
    if (options.required) addError(errors, row, name, "Required");
    return null;
  }
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) {
    addError(errors, row, name, "Must be a valid number");
    return null;
  }
  const value = Number(cleaned);
  if (!Number.isFinite(value)) {
    addError(errors, row, name, "Must be a finite number");
    return null;
  }
  if (options.integer && !Number.isInteger(value)) {
    addError(errors, row, name, "Must be a whole number");
    return null;
  }
  if (options.positive && value <= 0) {
    addError(errors, row, name, "Must be greater than zero");
    return null;
  }
  return value;
}

function parseDate(
  raw: string,
  row: number,
  name: string,
  errors: SoldCsvRowError[],
  requiredValue: boolean,
): string | null {
  if (!raw) {
    if (requiredValue) addError(errors, row, name, "Required");
    return null;
  }
  let year: number;
  let month: number;
  let day: number;
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (match) {
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  } else {
    match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
    if (!match) {
      addError(errors, row, name, "Use YYYY-MM-DD or MM/DD/YYYY");
      return null;
    }
    month = Number(match[1]);
    day = Number(match[2]);
    year = Number(match[3]);
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    addError(errors, row, name, "Invalid calendar date");
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseTimestamp(
  raw: string,
  row: number,
  errors: SoldCsvRowError[],
): string | null {
  if (!raw) return null;
  const timestamp = new Date(raw);
  if (
    !Number.isFinite(timestamp.valueOf()) ||
    !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)
  ) {
    addError(errors, row, "sourceUpdatedAt", "Must be an ISO date-time with an offset");
    return null;
  }
  return timestamp.toISOString();
}

function addressParts(
  rowValues: string[],
  columns: Partial<Record<CanonicalField, number>>,
  rowNumber: number,
  errors: SoldCsvRowError[],
): { line1: string; line2: string | null; city: string; state: string; postalCode: string | null } {
  const full = field(rowValues, columns, "fullAddress");
  let line1 = field(rowValues, columns, "addressLine1");
  const line2 = field(rowValues, columns, "addressLine2") || null;
  let city = field(rowValues, columns, "city");
  let state = field(rowValues, columns, "state");
  let postalCode = field(rowValues, columns, "postalCode") || null;

  if (full && city && state) {
    line1 ||= full;
  } else if (full && (!city || !state)) {
    const parts = full.split(",").map((part) => part.trim());
    const region = parts.pop() ?? "";
    const parsedCity = parts.pop() ?? "";
    const parsedLine1 = parts.join(", ");
    const regionMatch =
      /^(.+?)(?:\s+(\d{5}(?:-\d{4})?|[a-z]\d[a-z]\s?\d[a-z]\d))?$/i.exec(
        region,
      );
    if (!parsedLine1 || !parsedCity || !regionMatch) {
      addError(
        errors,
        rowNumber,
        "fullAddress",
        "Provide a quoted 'Street, City, State ZIP' value or separate Street Address, City, and State columns",
      );
    } else {
      line1 ||= parsedLine1;
      city ||= parsedCity;
      state ||= regionMatch[1]!.trim();
      postalCode ||= regionMatch[2]?.trim() || null;
    }
  }

  required(line1, errors, rowNumber, "addressLine1");
  required(city, errors, rowNumber, "city");
  required(state, errors, rowNumber, "state");
  return { line1, line2, city, state, postalCode };
}

function schemaErrors(
  input: unknown,
  row: number,
  errors: SoldCsvRowError[],
): SoldRecordInput | null {
  const result = soldRecordSchema.safeParse(input);
  if (result.success) return result.data;
  for (const issue of result.error.issues) {
    addError(errors, row, String(issue.path[0] ?? "row"), issue.message);
  }
  return null;
}

export function parseSoldCsv(raw: string): SoldCsvPreview {
  const errors: SoldCsvRowError[] = [];
  const size = new TextEncoder().encode(raw).byteLength;
  if (size === 0) {
    return {
      totalRows: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      rows: [],
      previewRows: [],
      errors: [{ row: 1, field: "file", message: "CSV file is empty" }],
      truncatedPreview: false,
    };
  }
  if (size > MAX_SOLD_CSV_BYTES) {
    return {
      totalRows: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      rows: [],
      previewRows: [],
      errors: [{
        row: 1,
        field: "file",
        message: `CSV exceeds the ${MAX_SOLD_CSV_BYTES / 1024 / 1024} MB limit`,
      }],
      truncatedPreview: false,
    };
  }

  let matrix: string[][];
  try {
    matrix = parseCsvRows(raw.replace(/^\uFEFF/, ""));
  } catch (error) {
    return {
      totalRows: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      rows: [],
      previewRows: [],
      errors: [{
        row: 1,
        field: "file",
        message: error instanceof Error ? error.message : "CSV could not be parsed",
      }],
      truncatedPreview: false,
    };
  }
  if (matrix.length < 2) {
    return {
      totalRows: Math.max(0, matrix.length - 1),
      acceptedCount: 0,
      rejectedCount: 0,
      rows: [],
      previewRows: [],
      errors: [{ row: 1, field: "file", message: "CSV needs a header and at least one data row" }],
      truncatedPreview: false,
    };
  }

  const dataRows = matrix.slice(1);
  if (dataRows.length > MAX_SOLD_CSV_ROWS) {
    return {
      totalRows: dataRows.length,
      acceptedCount: 0,
      rejectedCount: dataRows.length,
      rows: [],
      previewRows: [],
      errors: [{
        row: 1,
        field: "file",
        message: `CSV has ${dataRows.length.toLocaleString()} rows; the limit is ${MAX_SOLD_CSV_ROWS.toLocaleString()}`,
      }],
      truncatedPreview: false,
    };
  }

  const columns: Partial<Record<CanonicalField, number>> = {};
  matrix[0]!.forEach((header, index) => {
    const canonical = HEADER_ALIASES[normalizedHeader(header)];
    if (!canonical) return;
    if (columns[canonical] !== undefined) {
      addError(errors, 1, canonical, `Duplicate mapped column: ${header}`);
      return;
    }
    columns[canonical] = index;
  });

  const requiredHeaders: Array<[CanonicalField, string]> = [
    ["standardStatus", "Status"],
    ["closePrice", "Close Price"],
    ["closeDate", "Close Date"],
    ["livingArea", "Living Area"],
    ["propertyType", "Property Type"],
  ];
  for (const [canonical, label] of requiredHeaders) {
    if (columns[canonical] === undefined) {
      addError(errors, 1, canonical, `Missing required ${label} column`);
    }
  }
  if (
    columns.recordKey === undefined &&
    columns.listingKey === undefined &&
    columns.mlsNumber === undefined
  ) {
    addError(errors, 1, "recordKey", "Add Record Key, Listing Key, or MLS Number");
  }
  if (columns.fullAddress === undefined && columns.addressLine1 === undefined) {
    addError(errors, 1, "addressLine1", "Add Full Address or Street Address");
  }
  const headerHasFatalErrors = errors.length > 0;
  if (headerHasFatalErrors) {
    return {
      totalRows: dataRows.length,
      acceptedCount: 0,
      rejectedCount: dataRows.length,
      rows: [],
      previewRows: [],
      errors,
      truncatedPreview: false,
    };
  }

  const rows: SoldRecordInput[] = [];
  const seenKeys = new Map<string, number>();
  let rejectedCount = 0;
  for (let index = 0; index < dataRows.length; index += 1) {
    const values = dataRows[index]!;
    const rowNumber = index + 2;
    const rowErrorsStart = errors.length;
    if (values.length > matrix[0]!.length && values.slice(matrix[0]!.length).some(Boolean)) {
      addError(errors, rowNumber, "row", "Row has more values than the header");
    }

    const listingKey = field(values, columns, "listingKey") || null;
    const mlsNumber = field(values, columns, "mlsNumber") || null;
    const recordKey =
      field(values, columns, "recordKey") || listingKey || mlsNumber || "";
    required(recordKey, errors, rowNumber, "recordKey");
    const firstSeen = recordKey ? seenKeys.get(recordKey) : undefined;
    if (firstSeen !== undefined) {
      addError(errors, rowNumber, "recordKey", `Duplicate record key; first seen on row ${firstSeen}`);
    } else if (recordKey) {
      seenKeys.set(recordKey, rowNumber);
    }

    const statusRaw = field(values, columns, "standardStatus").toLowerCase();
    let standardStatus: "Closed" | "Sold" | null = null;
    if (statusRaw === "closed") standardStatus = "Closed";
    else if (statusRaw === "sold") standardStatus = "Sold";
    else {
      addError(
        errors,
        rowNumber,
        "standardStatus",
        statusRaw ? "Only Closed or Sold rows are accepted" : "Required",
      );
    }

    const address = addressParts(values, columns, rowNumber, errors);
    const closePrice = parseNumber(
      field(values, columns, "closePrice"),
      rowNumber,
      "closePrice",
      errors,
      { required: true, positive: true },
    );
    const closeDate = parseDate(
      field(values, columns, "closeDate"),
      rowNumber,
      "closeDate",
      errors,
      true,
    );
    const livingArea = parseNumber(
      field(values, columns, "livingArea"),
      rowNumber,
      "livingArea",
      errors,
      { required: true, integer: true, positive: true },
    );
    const propertyType = required(
      field(values, columns, "propertyType"),
      errors,
      rowNumber,
      "propertyType",
    );

    const candidate = schemaErrors(
      {
        recordKey,
        listingKey,
        mlsNumber,
        standardStatus,
        addressLine1: address.line1,
        addressLine2: address.line2,
        city: address.city,
        state: address.state,
        postalCode: address.postalCode,
        subdivision: field(values, columns, "subdivision") || null,
        closePrice,
        closeDate,
        listPrice: parseNumber(field(values, columns, "listPrice"), rowNumber, "listPrice", errors, { positive: true }),
        originalListPrice: parseNumber(field(values, columns, "originalListPrice"), rowNumber, "originalListPrice", errors, { positive: true }),
        beds: parseNumber(field(values, columns, "beds"), rowNumber, "beds", errors),
        baths: parseNumber(field(values, columns, "baths"), rowNumber, "baths", errors),
        livingArea,
        yearBuilt: parseNumber(field(values, columns, "yearBuilt"), rowNumber, "yearBuilt", errors, { integer: true }),
        propertyType,
        propertySubtype: field(values, columns, "propertySubtype") || null,
        latitude: parseNumber(field(values, columns, "latitude"), rowNumber, "latitude", errors),
        longitude: parseNumber(field(values, columns, "longitude"), rowNumber, "longitude", errors),
        daysOnMarket: parseNumber(field(values, columns, "daysOnMarket"), rowNumber, "daysOnMarket", errors, { integer: true }),
        sourceUpdatedAt: parseTimestamp(field(values, columns, "sourceUpdatedAt"), rowNumber, errors),
      },
      rowNumber,
      errors,
    );
    if (errors.length === rowErrorsStart && candidate) rows.push(candidate);
    else rejectedCount += 1;
  }

  return {
    totalRows: dataRows.length,
    acceptedCount: rows.length,
    rejectedCount,
    rows,
    previewRows: rows.slice(0, SOLD_CSV_PREVIEW_ROWS),
    errors,
    truncatedPreview: rows.length > SOLD_CSV_PREVIEW_ROWS,
  };
}
