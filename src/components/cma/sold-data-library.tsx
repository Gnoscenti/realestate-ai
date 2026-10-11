import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteMySoldSource,
  getMySoldDataLibrary,
  importMySoldCsv,
  previewSoldCsv,
} from "@/lib/sold-comps/api";
import {
  MAX_SOLD_CSV_BYTES,
  MAX_SOLD_CSV_ROWS,
  SOLD_CSV_TEMPLATE,
  isCurrentSoldCsvPreview,
  type SoldCsvRowError,
  type SoldDataLibrary,
  type SoldRecordInput,
} from "@/lib/sold-comps/types";

interface PreviewResult {
  fileRevision: number;
  totalRows: number;
  acceptedCount: number;
  rejectedCount: number;
  previewRows: SoldRecordInput[];
  errors: SoldCsvRowError[];
  truncatedPreview: boolean;
}

function message(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "Request failed";
}

function downloadTemplate(): void {
  const blob = new Blob([SOLD_CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "closed-sold-import-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const INTEGER_FORMATTER = new Intl.NumberFormat("en-US");

function formatMoney(value: string): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? USD_FORMATTER.format(amount) : value;
}

export function SoldDataLibraryPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileRevisionRef = useRef(0);
  const [library, setLibrary] = useState<SoldDataLibrary | null>(null);
  const [filename, setFilename] = useState("");
  const [csv, setCsv] = useState("");
  const [sourceAsOf, setSourceAsOf] = useState("");
  const [provider, setProvider] = useState("");
  const [dataset, setDataset] = useState("");
  const [licenseConfirmed, setLicenseConfirmed] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [libraryError, setLibraryError] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const reload = useCallback(async () => {
    setLoadingLibrary(true);
    setLibraryError("");
    try {
      setLibrary(await getMySoldDataLibrary());
    } catch (error) {
      const detail = message(error);
      setLibraryError(detail);
      toast.error(detail);
    } finally {
      setLoadingLibrary(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const chooseFile = async (file: File | undefined) => {
    const fileRevision = fileRevisionRef.current + 1;
    fileRevisionRef.current = fileRevision;
    setPreview(null);
    setCsv("");
    setFilename("");
    setSourceAsOf("");
    setProvider("");
    setDataset("");
    setLicenseConfirmed(false);
    setStatus("");
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Choose a .csv file");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.size > MAX_SOLD_CSV_BYTES) {
      toast.error(`CSV must be ${MAX_SOLD_CSV_BYTES / 1024 / 1024} MB or smaller`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    try {
      const text = await file.text();
      if (!isCurrentSoldCsvPreview(fileRevision, fileRevisionRef.current)) return;
      setFilename(file.name);
      setCsv(text);
      setStatus(`${file.name} is ready to preview.`);
    } catch {
      toast.error("The selected file could not be read");
    }
  };

  const runPreview = async () => {
    if (!filename || !csv) {
      toast.error("Choose a CSV file first");
      return;
    }
    setPreviewing(true);
    setStatus("Checking every row…");
    const fileRevision = fileRevisionRef.current;
    try {
      const result = await previewSoldCsv({ data: { filename, csv } });
      if (!isCurrentSoldCsvPreview(fileRevision, fileRevisionRef.current)) return;
      setPreview({ ...result, fileRevision });
      setStatus(
        `${result.acceptedCount} accepted and ${result.rejectedCount} rejected out of ${result.totalRows} rows.`,
      );
    } catch (error) {
      toast.error(message(error));
      setStatus("Preview failed.");
    } finally {
      setPreviewing(false);
    }
  };

  const confirmImport = async () => {
    if (
      !preview ||
      !isCurrentSoldCsvPreview(
        preview.fileRevision,
        fileRevisionRef.current,
      ) ||
      preview.acceptedCount === 0
    ) {
      toast.error("Preview must contain at least one valid Closed/Sold row");
      return;
    }
    if (!sourceAsOf) {
      toast.error("Enter the source as-of date shown by the export");
      return;
    }
    if (!dataset.trim()) {
      toast.error("Enter the dataset or MLS board namespace");
      return;
    }
    if (!licenseConfirmed) {
      toast.error("Confirm that you are authorized to use this export");
      return;
    }
    setImporting(true);
    setStatus("Saving accepted rows to your workspace…");
    try {
      const result = await importMySoldCsv({
        data: {
          filename,
          csv,
          sourceAsOf,
          provider: provider.trim() || undefined,
          dataset: dataset.trim(),
          licenseConfirmed: true,
        },
      });
      toast.success(
        `Saved ${result.createdCount} new, refreshed ${result.updatedCount}, and skipped ${result.staleSkippedCount} stale record${result.staleSkippedCount === 1 ? "" : "s"}`,
      );
      setStatus(
        `Import complete: ${result.createdCount} new, ${result.updatedCount} refreshed, ${result.staleSkippedCount} stale skipped, and ${result.rejectedCount} invalid rejected.`,
      );
      setPreview(null);
      fileRevisionRef.current += 1;
      setCsv("");
      setFilename("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await reload();
    } catch (error) {
      toast.error(message(error));
      setStatus("Import failed; no completion was reported.");
    } finally {
      setImporting(false);
    }
  };

  const deleteSource = async (sourceId: string, label: string) => {
    if (
      !window.confirm(
        `Delete ${label} and every Closed/Sold record still linked to it? This cannot be undone.`,
      )
    ) {
      return;
    }
    setDeletingId(sourceId);
    try {
      const result = await deleteMySoldSource({ data: { sourceId } });
      if (!result.deleted) throw new Error("Source was not found");
      toast.success("Source deleted");
      await reload();
    } catch (error) {
      toast.error(message(error));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="space-y-4" aria-labelledby="sold-library-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            <Badge variant="default">
              <FileSpreadsheet className="h-3 w-3" />
              Closed/Sold data
            </Badge>
            <Badge variant="secondary">Workspace private</Badge>
          </div>
          <h2 id="sold-library-title" className="font-display text-xl font-semibold">
            Closed/Sold source library
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--color-fg-muted)]">
            Upload an export you are authorized to use. Rows are stored with their
            source and as-of date. They are not called comparable properties and
            are not used for pricing until a subject-matching method is added.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="min-h-11 shrink-0"
          onClick={downloadTemplate}
        >
          <Download className="h-4 w-4" />
          Download template
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Import an authorized CSV</CardTitle>
          <CardDescription>
            Maximum {INTEGER_FORMATTER.format(MAX_SOLD_CSV_ROWS)} rows and {MAX_SOLD_CSV_BYTES / 1024 / 1024} MB.
            Only explicit Closed/Sold rows with a key, full address, close price,
            close date, living area, and property type are accepted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="sold-csv-file">Closed/Sold CSV</Label>
            <Input
              ref={fileInputRef}
              id="sold-csv-file"
              type="file"
              accept=".csv,text/csv"
              disabled={previewing || importing}
              className="mt-1.5 min-h-11 cursor-pointer file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium"
              onChange={(event) => void chooseFile(event.target.files?.[0])}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="sold-as-of">Source as-of date</Label>
              <Input
                id="sold-as-of"
                type="date"
                required
                className="mt-1.5 min-h-11"
                value={sourceAsOf}
                onChange={(event) => setSourceAsOf(event.target.value)}
              />
              <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">
                Use the date stated by the export; it is not guessed.
              </p>
            </div>
            <div>
              <Label htmlFor="sold-provider">MLS/provider (optional)</Label>
              <Input
                id="sold-provider"
                className="mt-1.5 min-h-11"
                value={provider}
                maxLength={160}
                onChange={(event) => setProvider(event.target.value)}
                placeholder="Provider named in your license"
              />
            </div>
            <div>
              <Label htmlFor="sold-dataset">Dataset/board namespace</Label>
              <Input
                id="sold-dataset"
                className="mt-1.5 min-h-11"
                value={dataset}
                required
                maxLength={160}
                onChange={(event) => setDataset(event.target.value)}
                placeholder="Required · e.g. RMLS Portland"
              />
              <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">
                Prevents the same ListingKey from two boards from colliding.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <label className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 text-sm text-[var(--color-fg-muted)]">
              <input
                type="checkbox"
                className="h-5 w-5 shrink-0 accent-[var(--color-primary)]"
                checked={licenseConfirmed}
                onChange={(event) => setLicenseConfirmed(event.target.checked)}
              />
              I confirm that I am authorized to upload and use this MLS/export data in this workspace.
            </label>
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              disabled={!csv || previewing || importing}
              onClick={() => void runPreview()}
            >
              {previewing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Preview rows
            </Button>
            <Button
              type="button"
              className="min-h-11"
              disabled={
                !preview ||
                !isCurrentSoldCsvPreview(
                  preview.fileRevision,
                  fileRevisionRef.current,
                ) ||
                preview.acceptedCount === 0 ||
                !sourceAsOf ||
                !dataset.trim() ||
                !licenseConfirmed ||
                previewing ||
                importing
              }
              onClick={() => void confirmImport()}
            >
              {importing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Confirm accepted rows
            </Button>
          </div>

          <p className="text-sm text-[var(--color-fg-muted)]" aria-live="polite">
            {status}
          </p>

          {preview && (
            <div className="space-y-4 border-t border-[var(--color-border)] pt-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="success">{preview.acceptedCount} accepted</Badge>
                <Badge variant={preview.rejectedCount ? "warning" : "secondary"}>
                  {preview.rejectedCount} rejected
                </Badge>
                <Badge variant="secondary">{preview.totalRows} total</Badge>
              </div>

              {preview.previewRows.length > 0 && (
                <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border)]">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="bg-[var(--color-surface-2)] text-xs uppercase tracking-wide text-[var(--color-fg-subtle)]">
                      <tr>
                        <th scope="col" className="p-3 font-medium">Key</th>
                        <th scope="col" className="p-3 font-medium">Status</th>
                        <th scope="col" className="p-3 font-medium">Address</th>
                        <th scope="col" className="p-3 font-medium">Close date</th>
                        <th scope="col" className="p-3 font-medium">Close price</th>
                        <th scope="col" className="p-3 font-medium">Living area</th>
                        <th scope="col" className="p-3 font-medium">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.previewRows.map((row) => (
                        <tr key={row.recordKey} className="border-t border-[var(--color-border)]">
                          <td className="p-3 font-mono text-xs">{row.recordKey}</td>
                          <td className="p-3">{row.standardStatus}</td>
                          <td className="p-3">
                            {row.addressLine1}, {row.city}, {row.state}
                          </td>
                          <td className="p-3 tabular-nums">{row.closeDate}</td>
                          <td className="p-3 tabular-nums">
                            {formatMoney(String(row.closePrice))}
                          </td>
                          <td className="p-3 tabular-nums">
                            {INTEGER_FORMATTER.format(row.livingArea)} sq ft
                          </td>
                          <td className="p-3">{row.propertyType}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {preview.truncatedPreview && (
                <p className="text-xs text-[var(--color-fg-subtle)]">
                  Preview shows the first {preview.previewRows.length} accepted rows.
                  Every accepted row will be saved after confirmation.
                </p>
              )}

              {preview.errors.length > 0 && (
                <div className="rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--color-warning)_40%,var(--color-border))] bg-[var(--color-warning-soft)] p-3">
                  <h3 className="flex items-center gap-2 text-sm font-medium text-[var(--color-fg)]">
                    <AlertCircle className="h-4 w-4 text-[var(--color-warning)]" />
                    Rejected row details
                  </h3>
                  <div className="mt-2 max-h-64 overflow-auto">
                    <table className="w-full min-w-[520px] text-left text-xs">
                      <thead>
                        <tr className="text-[var(--color-fg-subtle)]">
                          <th scope="col" className="pb-2 pr-3 font-medium">Row</th>
                          <th scope="col" className="pb-2 pr-3 font-medium">Field</th>
                          <th scope="col" className="pb-2 font-medium">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.errors.map((error, index) => (
                          <tr key={`${error.row}-${error.field}-${index}`} className="border-t border-[var(--color-border)]/60">
                            <td className="py-2 pr-3 tabular-nums">{error.row}</td>
                            <td className="py-2 pr-3 font-mono">{error.field}</td>
                            <td className="py-2">{error.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Imported sources</CardTitle>
            <CardDescription>
              Deleting a source also deletes records still linked to that source.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11"
            disabled={loadingLibrary}
            onClick={() => void reload()}
            aria-label="Refresh imported sources"
          >
            <RefreshCw className={loadingLibrary ? "animate-spin" : ""} />
          </Button>
        </CardHeader>
        <CardContent>
          {loadingLibrary && !library ? (
            <div className="flex min-h-24 items-center justify-center text-sm text-[var(--color-fg-muted)]">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading sources…
            </div>
          ) : libraryError ? (
            <div
              role="alert"
              className="rounded-[var(--radius-md)] border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] p-4"
            >
              <p className="text-sm text-[var(--color-danger)]">
                Imported sources could not be loaded: {libraryError}
              </p>
              <Button
                type="button"
                variant="secondary"
                className="mt-3 min-h-11"
                onClick={() => void reload()}
              >
                <RefreshCw /> Retry
              </Button>
            </div>
          ) : library?.sources.length ? (
            <div className="space-y-3">
              {library.sources.map((source) => {
                const label = source.filename || source.provider || "Closed/Sold source";
                return (
                  <div
                    key={source.id}
                    className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-[var(--color-fg)]">
                        {label}
                      </div>
                      <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">
                        As of {source.sourceAsOf?.slice(0, 10) || "not provided"}
                        {source.provider ? ` · ${source.provider}` : ""}
                        {source.dataset ? ` · ${source.dataset}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
                        {source.linkedRecordCount} current records · {source.rowCount} accepted at import · {source.rejectedCount} rejected
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="danger"
                      size="icon"
                      className="min-h-11 min-w-11 self-end sm:self-auto"
                      disabled={deletingId !== null}
                      aria-label={`Delete source ${label}`}
                      onClick={() => void deleteSource(source.id, label)}
                    >
                      {deletingId === source.id ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Trash2 />
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] p-6 text-center">
              <FileSpreadsheet className="mx-auto h-7 w-7 text-[var(--color-fg-subtle)]" />
              <h3 className="mt-3 text-sm font-medium text-[var(--color-fg)]">
                No Closed/Sold sources yet
              </h3>
              <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-[var(--color-fg-muted)]">
                Download the template, export data you are licensed to use, and
                preview it above. The app does not scrape public sites for MLS data.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {library && library.recordCount > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Closed/Sold records ({INTEGER_FORMATTER.format(library.recordCount)})
            </CardTitle>
            <CardDescription>
              Source records only. They have not been matched or ranked against a subject property.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-fg-subtle)]">
                  <th scope="col" className="pb-3 pr-3 font-medium">Record</th>
                  <th scope="col" className="pb-3 pr-3 font-medium">Address</th>
                  <th scope="col" className="pb-3 pr-3 font-medium">Status</th>
                  <th scope="col" className="pb-3 pr-3 font-medium">Close date</th>
                  <th scope="col" className="pb-3 pr-3 font-medium">Close price</th>
                  <th scope="col" className="pb-3 pr-3 font-medium">Living area</th>
                  <th scope="col" className="pb-3 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {library.records.map((record) => (
                  <tr
                    key={record.id}
                    className="border-b border-[var(--color-border)]/60 [content-visibility:auto] [contain-intrinsic-size:auto_52px]"
                  >
                    <td className="py-3 pr-3 font-mono text-xs">
                      {record.mlsNumber || record.listingKey || record.recordKey}
                    </td>
                    <td className="py-3 pr-3">
                      <div>{record.addressLine1}</div>
                      <div className="text-xs text-[var(--color-fg-subtle)]">
                        {record.city}, {record.state} {record.postalCode || ""}
                      </div>
                    </td>
                    <td className="py-3 pr-3">{record.standardStatus}</td>
                    <td className="py-3 pr-3 tabular-nums">{record.closeDate}</td>
                    <td className="py-3 pr-3 tabular-nums">{formatMoney(record.closePrice)}</td>
                    <td className="py-3 pr-3 tabular-nums">
                      {INTEGER_FORMATTER.format(record.livingArea)} sq ft
                    </td>
                    <td className="py-3 text-xs text-[var(--color-fg-muted)]">
                      <div>{record.sourceDataset || record.sourceFilename || "Authorized import"}</div>
                      <div className="text-[var(--color-fg-subtle)]">
                        {record.sourceProvider ? `${record.sourceProvider} · ` : ""}
                        as of {record.sourceAsOf?.slice(0, 10) || "—"}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {library.recordsTruncated && (
              <p className="mt-3 text-xs text-[var(--color-fg-subtle)]">
                Showing the 500 most recent records. Source totals above include every persisted row.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
