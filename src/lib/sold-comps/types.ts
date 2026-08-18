export const MAX_SOLD_CSV_BYTES = 2 * 1024 * 1024;
export const MAX_SOLD_CSV_ROWS = 5_000;
export const SOLD_CSV_PREVIEW_ROWS = 25;

export function isCurrentSoldCsvPreview(
  previewRevision: number,
  selectedFileRevision: number,
): boolean {
  return previewRevision === selectedFileRevision;
}

export interface SoldRecordInput {
  recordKey: string;
  listingKey: string | null;
  mlsNumber: string | null;
  standardStatus: "Closed" | "Sold";
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string | null;
  subdivision: string | null;
  closePrice: number;
  closeDate: string;
  listPrice: number | null;
  originalListPrice: number | null;
  beds: number | null;
  baths: number | null;
  livingArea: number;
  yearBuilt: number | null;
  propertyType: string;
  propertySubtype: string | null;
  latitude: number | null;
  longitude: number | null;
  daysOnMarket: number | null;
  sourceUpdatedAt: string | null;
}

export interface SoldCsvRowError {
  row: number;
  field: string;
  message: string;
}

export interface SoldCsvPreview {
  totalRows: number;
  acceptedCount: number;
  rejectedCount: number;
  rows: SoldRecordInput[];
  previewRows: SoldRecordInput[];
  errors: SoldCsvRowError[];
  truncatedPreview: boolean;
}

export interface SoldCompSourceRecord {
  id: string;
  kind: "mls_csv" | "reso_api";
  provider: string | null;
  dataset: string | null;
  filename: string | null;
  sourceAsOf: string | null;
  rowCount: number;
  rejectedCount: number;
  linkedRecordCount: number;
  createdAt: string;
}

export interface SoldDataRecord {
  id: string;
  sourceId: string;
  recordKey: string;
  listingKey: string | null;
  mlsNumber: string | null;
  standardStatus: "Closed" | "Sold";
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string | null;
  closePrice: string;
  closeDate: string;
  livingArea: number;
  propertyType: string;
  sourceAsOf: string | null;
  sourceFilename: string | null;
  sourceProvider: string | null;
  sourceDataset: string | null;
}

export interface SoldDataLibrary {
  sources: SoldCompSourceRecord[];
  records: SoldDataRecord[];
  recordCount: number;
  recordsTruncated: boolean;
}

export const SOLD_CSV_TEMPLATE =
  "Record Key,Listing Key,MLS Number,Status,Full Address,City,State,Postal Code,Close Price,Close Date,Living Area,Property Type,List Price,Beds,Baths,Source Updated At\n";

export const SOLD_DATA_EMPTY_ASSISTANT_MESSAGE = [
  "No authorized Closed/Sold records are available in this workspace yet.",
  "Import an authorized Closed/Sold CSV in the CMA data workspace (/cma), or ask your administrator to connect a licensed RESO feed after the vendor and dataset are approved. Public websites and active listings are not substitutes.",
].join("\n\n");
