/**
 * One-off Gmail scan with an access token the signed-in user pastes into
 * Email Alerts. The token is used for this request only: this module does not
 * store or log it. There is no OAuth flow and no other provider here.
 * No process-wide mailbox credential is ever shared across beta users.
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { z } from "zod";
import type { RawEmailMessage } from "@/lib/email-alerts";

const inputSchema = z.object({
  accessToken: z.string().max(4000).optional(),
  maxResults: z.number().min(1).max(25).optional(),
});

/** How long one request to Gmail may take before the scan gives up. */
const GMAIL_TIMEOUT_MS = 10_000;

/** A refused Gmail request, worded for the person reading the message. */
class GmailRequestError extends Error {}

/**
 * Google's own error body is never passed on: it is raw JSON, and the text
 * returned here is shown to the agent and saved in their browser.
 */
function gmailErrorMessage(status: number): string {
  if (status === 401) {
    return "Gmail did not accept that access token. It may have expired. Paste a new one and scan again.";
  }
  if (status === 403) {
    return "Gmail refused the request. The access token may not include permission to read mail.";
  }
  if (status === 429) {
    return "Gmail is limiting requests right now. Wait a few minutes and scan again.";
  }
  return `Gmail returned an error (code ${status}). No alerts were added.`;
}

function gmailGet(url: string, token: string): Promise<Response> {
  return fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(GMAIL_TIMEOUT_MS),
  });
}

async function gmailList(
  token: string,
  query: string,
  maxResults: number,
): Promise<RawEmailMessage[]> {
  const q = encodeURIComponent(query);
  const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=${maxResults}`;
  const listRes = await gmailGet(listUrl, token);
  if (!listRes.ok) {
    throw new GmailRequestError(gmailErrorMessage(listRes.status));
  }
  const listJson = (await listRes.json()) as {
    messages?: { id: string }[];
  };
  const ids = (listJson.messages || []).slice(0, maxResults);
  const out: RawEmailMessage[] = [];

  for (const { id } of ids) {
    const mRes = await gmailGet(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      token,
    );
    if (!mRes.ok) continue;
    const m = (await mRes.json()) as {
      id: string;
      snippet?: string;
      internalDate?: string;
      payload?: { headers?: { name: string; value: string }[] };
    };
    const headers = m.payload?.headers || [];
    const get = (n: string) =>
      headers.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value || "";
    out.push({
      id: m.id,
      from: get("From"),
      subject: get("Subject"),
      snippet: m.snippet,
      date: m.internalDate
        ? new Date(Number(m.internalDate)).toISOString()
        : get("Date")
          ? new Date(get("Date")).toISOString()
          : new Date().toISOString(),
      provider: "gmail",
    });
  }
  return out;
}

const COMBINED_QUERY =
  "newer_than:14d (from:docusign.net OR from:docusign.com OR subject:DocuSign OR subject:escrow OR subject:inspection OR subject:showing OR subject:\"Complete with DocuSign\" OR subject:appraisal OR subject:underwriting OR subject:invitation OR is:important)";

export async function scanGmailInbox(opts: {
  accessToken?: string;
  maxResults?: number;
}): Promise<{ ok: boolean; messages: RawEmailMessage[]; error?: string; mode: string }> {
  const token = opts.accessToken?.trim() || "";
  if (!token) {
    return {
      ok: false,
      messages: [],
      error: "No Gmail access token was sent, so nothing was scanned.",
      mode: "none",
    };
  }
  try {
    const messages = await gmailList(token, COMBINED_QUERY, opts.maxResults ?? 15);
    return { ok: true, messages, mode: "gmail_api" };
  } catch (e) {
    return {
      ok: false,
      messages: [],
      error:
        e instanceof GmailRequestError
          ? e.message
          : "Our server could not complete the request to Gmail. No alerts were added. Try again in a few minutes.",
      mode: "gmail_api",
    };
  }
}

export const scanConnectedEmail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(inputSchema)
  .handler(async ({ data }) => {
    return scanGmailInbox({
      accessToken: data.accessToken,
      maxResults: data.maxResults,
    });
  });
