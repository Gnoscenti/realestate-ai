import type { CiteRecognitionPublicCapture, RecognitionProviderId } from "./recognition-types";

export const RECOGNITION_LIMITATIONS = [
  "These are API observations from the controlled San Diego panel, not consumer-app rankings.",
  "Named identity prompts and unbranded discovery prompts answer different questions.",
  "A provider citation is counted only when returned in its citation metadata.",
  "Failed requests are shown separately and do not count as negative recognition.",
  "Readiness recommendations are hypotheses to test; a change between runs does not prove causation.",
  "Hashes support evidence comparison; they do not establish independent notarization.",
];

export type RecognitionComparison = {
  capture: CiteRecognitionPublicCapture;
  previous?: CiteRecognitionPublicCapture;
  changes: string[];
};
export type ProviderRecognitionSummary = {
  provider: RecognitionProviderId;
  attempted: number;
  succeeded: number;
  mentioned: number;
  cited: number;
  comparisons: RecognitionComparison[];
};

function comparable(a: CiteRecognitionPublicCapture, b: CiteRecognitionPublicCapture) {
  return Boolean(a.model) && a.subjectFingerprint === b.subjectFingerprint &&
    a.panelVersion === b.panelVersion && a.provider === b.provider &&
    a.model === b.model && a.location === b.location &&
    a.queryId === b.queryId && a.promptHash === b.promptHash &&
    a.status === "succeeded" && b.status === "succeeded";
}

export function buildRecognitionReport(captures: CiteRecognitionPublicCapture[]) {
  const sorted = [...captures].sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  const latest = sorted[0];
  const summaries: ProviderRecognitionSummary[] = (["chatgpt", "grok", "perplexity"] as const).map((provider) => {
    const seen = new Set<string>();
    const current = sorted.filter((capture) => {
      if (!latest || capture.runDate !== latest.runDate || capture.panelVersion !== latest.panelVersion ||
        capture.subjectFingerprint !== latest.subjectFingerprint || capture.provider !== provider) return false;
      const key = [capture.queryId, capture.promptHash, capture.model, capture.location].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const successful = current.filter((capture) => capture.status === "succeeded");
    return {
      provider, attempted: current.length, succeeded: successful.length,
      mentioned: successful.filter((capture) => capture.mentioned).length,
      cited: successful.filter((capture) => capture.cited).length,
      comparisons: current.map((capture) => {
        const previous = sorted.find((candidate) =>
          candidate.runDate < capture.runDate && comparable(capture, candidate));
        const changes: string[] = [];
        if (previous) {
          if (previous.mentioned !== capture.mentioned) changes.push(capture.mentioned ? "Name now observed" : "Name no longer observed");
          if (previous.cited !== capture.cited) changes.push(capture.cited ? "Provider citations now present" : "Provider citations no longer present");
          if (previous.correctIdentity !== capture.correctIdentity) changes.push("Identity evidence changed");
          if (previous.correctBrokerage !== capture.correctBrokerage) changes.push("Brokerage attribution changed");
          if (previous.responseHash !== capture.responseHash) changes.push("Response evidence changed");
          if (!changes.length) changes.push("No measured change");
        }
        return { capture, previous, changes };
      }),
    };
  });
  return { runDate: latest?.runDate, panelVersion: latest?.panelVersion, summaries };
}
