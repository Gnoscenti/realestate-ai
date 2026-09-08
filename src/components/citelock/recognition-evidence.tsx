import type { CiteAction } from "@/lib/aieo/types";
import type { CiteRecognitionPublicCapture } from "@/lib/aieo/recognition-types";
import { buildRecognitionReport, RECOGNITION_LIMITATIONS } from "@/lib/aieo/recognition-report";

export function RecognitionEvidence({ captures, actions }: { captures: CiteRecognitionPublicCapture[]; actions: CiteAction[] }) {
  const report = buildRecognitionReport(captures);
  return (
    <section className="space-y-4" aria-label="Recognition evidence and comparison">
      <div className="rounded-md border border-[var(--color-border)] p-4">
        <h3 className="text-sm font-semibold">What this panel measures</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--color-fg-muted)]">
          {RECOGNITION_LIMITATIONS.map((limit) => <li key={limit}>{limit}</li>)}
        </ul>
      </div>
      <div className="rounded-md border border-[var(--color-border)] p-4">
        <h3 className="text-sm font-semibold">Readiness gaps to test next</h3>
        <p className="mt-1 text-xs">These observed readiness gaps suggest specific experiments, not predicted ranking gains.</p>
        <ul className="mt-2 space-y-2 text-xs">
          {actions.slice(0, 5).map((action) => <li key={action.id}><strong>{action.issue}</strong><p>{action.fix}</p></li>)}
          {!actions.length && <li>No current readiness gaps were identified. Repeat the same panel after a meaningful public-site change.</li>}
        </ul>
      </div>
      {report.runDate && <p className="text-xs">Latest panel: {report.runDate} · {report.panelVersion}</p>}
      <div className="grid gap-3 md:grid-cols-3">
        {report.summaries.map((provider) => (
          <div key={provider.provider} className="rounded-md border border-[var(--color-border)] p-3">
            <h3 className="font-medium">{provider.provider === "chatgpt" ? "OpenAI API" : provider.provider === "grok" ? "xAI API" : "Perplexity API"}</h3>
            {provider.attempted ? <>
              <p className="mt-1 text-xs">{provider.succeeded}/{provider.attempted} requests succeeded</p>
              {provider.succeeded ? <>
                <p className="text-xs">Name observed: {provider.mentioned}/{provider.succeeded} successful answers</p>
                <p className="text-xs">Answers with provider citations: {provider.cited}/{provider.succeeded} successful answers</p>
              </> : <p className="text-xs">Recognition is unmeasured because every request failed.</p>}
              <p className="mt-1 text-xs">A citation can point to any source; inspect the URLs before drawing a conclusion about your website.</p>
            </> : <p className="mt-1 text-xs">Not measured in this panel.</p>}
          </div>
        ))}
      </div>
      {report.summaries.flatMap((provider) => provider.comparisons).map(({ capture, previous, changes }) => (
        <details key={capture.id} className="rounded-md border border-[var(--color-border)] p-3">
          <summary className="cursor-pointer text-sm">
            {capture.provider} · {capture.queryId} · {capture.status}
          </summary>
          <div className="mt-3 space-y-3 text-xs">
            <p>{capture.model} · {capture.location} · {capture.observedAt}</p>
            <p>{previous ? "Compared with " + previous.runDate + ": " + changes.join("; ") : "No earlier successful capture with the same provider, model, location, panel version, and prompt hash."}</p>
            <h4 className="font-medium">Exact prompt</h4>
            <pre className="whitespace-pre-wrap break-words">{capture.prompt}</pre>
            <p className="break-all">Prompt SHA-256: {capture.promptHash}</p>
            <h4 className="font-medium">Recorded response</h4>
            <pre className="whitespace-pre-wrap break-words">{capture.responseText || capture.errorCode || "No response text was returned."}</pre>
            <p className="break-all">Response evidence SHA-256: {capture.responseHash}</p>
            <p>The response hash covers the retained, sanitized provider evidence. Raw provider JSON remains server-side.</p>
            <ul className="space-y-1">
              {capture.citations.map((url) => <li key={url}><a className="break-all underline" href={url} target="_blank" rel="noopener noreferrer">{url}</a></li>)}
            </ul>
          </div>
        </details>
      ))}
    </section>
  );
}
