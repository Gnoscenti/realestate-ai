/**
 * Optional live Gmail scan using the signed-in caller's in-app token.
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

async function gmailList(
  token: string,
  query: string,
  maxResults: number,
): Promise<RawEmailMessage[]> {
  const q = encodeURIComponent(query);
  const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=${maxResults}`;
  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listRes.ok) {
    const err = await listRes.text();
    throw new Error(`Gmail list failed (${listRes.status}): ${err.slice(0, 160)}`);
  }
  const listJson = (await listRes.json()) as {
    messages?: { id: string }[];
  };
  const ids = (listJson.messages || []).slice(0, maxResults);
  const out: RawEmailMessage[] = [];

  for (const { id } of ids) {
    const mRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${token}` } },
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
      error: "No Gmail token — connect your inbox in the app",
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
      error: e instanceof Error ? e.message : "Gmail scan failed",
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
