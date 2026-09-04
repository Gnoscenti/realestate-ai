import type { CiteRecognitionRun } from "./types";

export const RECOGNITION_PANEL_VERSION = "san-diego-v1-2026-09-04";
export const RECOGNITION_LOCATION = "San Diego, California, United States";

export function recognitionRunDate(observedAt: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(observedAt));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export type RecognitionProviderId = "chatgpt" | "grok" | "perplexity";

export type CiteRecognitionCapture = CiteRecognitionRun & {
  scanId: string;
  subjectFingerprint: string;
  panelVersion: string;
  prompt: string;
  promptHash: string;
  status: "succeeded" | "failed";
  responseText: string;
  rawResponse: Record<string, unknown>;
  responseHash: string;
  runDate: string;
  errorCode?: string;
};

export type RecognitionPanelResult = {
  panelVersion: string;
  location: string;
  configuredProviders: RecognitionProviderId[];
  captures: CiteRecognitionCapture[];
};
