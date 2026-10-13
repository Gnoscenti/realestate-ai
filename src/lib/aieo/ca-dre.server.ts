import type { CiteEvidence } from "./types";
import type { CiteSourceOutcome } from "./scan-types";
import { readResponseText, safeFetch } from "@/lib/safe-outbound-url.server";

const DRE_ORIGIN = "https://www2.dre.ca.gov";
const DRE_PATH = "/publicasp/pplinfo.asp";

export type CaDreRecord = {
  licenseId: string;
  name: string;
  licenseType: string;
  status: string;
  expiresOn?: string;
  responsibleBrokerLicense?: string;
  responsibleBrokerName?: string;
};

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function htmlLines(html: string): string[] {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<\/?(?:tr|td|th|div|p|br|li|h\d)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function valueAfter(lines: string[], label: RegExp): string | undefined {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const match = line.match(label);
    if (!match) continue;
    const inline = line.slice((match.index || 0) + match[0].length).replace(/^\s*:?\s*/, "");
    if (inline) return inline;
    return lines[index + 1];
  }
  return undefined;
}

function isoDate(value?: string): string | undefined {
  if (!value) return undefined;
  const match = value.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/);
  if (!match) return undefined;
  const year =
    match[3]!.length === 2 ? String(2000 + Number(match[3])) : match[3]!;
  return `${year}-${match[1]!.padStart(2, "0")}-${match[2]!.padStart(2, "0")}`;
}

function responsibleBrokerFromLines(lines: string[]): {
  license?: string;
  name?: string;
} {
  const index = lines.findIndex((line) => /^responsible\s*broker\b/i.test(line));
  if (index < 0) return {};
  const block = lines.slice(index + 1, index + 8);
  let license: string | undefined;
  let name: string | undefined;
  for (let offset = 0; offset < block.length; offset += 1) {
    const line = block[offset]!;
    const match = line.match(/\b\d{6,12}\b/);
    if (!match) continue;
    license = match[0];
    const inline = line
      .replace(/license\s*(?:id|number|no\.?)\s*:?/gi, "")
      .replace(license, "")
      .replace(/^[\s:|–—-]+/, "")
      .trim();
    const following = block[offset + 1]?.trim();
    name = inline || following;
    break;
  }
  if (
    name &&
    (/^(?:mailing|business|main office|license)\b/i.test(name) ||
      /^\d+\s/.test(name) ||
      /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(name))
  ) {
    name = undefined;
  }
  return { license, name };
}

export function parseCaDreRecord(html: string): CaDreRecord | null {
  const lines = htmlLines(html);
  const licenseId = valueAfter(lines, /^license\s*(?:id|number|no\.?)/i)?.match(/\d{6,12}/)?.[0];
  const name = valueAfter(lines, /^name\b/i)?.replace(/\s+/g, " ").trim();
  const licenseType = valueAfter(lines, /^license\s*type\b/i)?.trim();
  const status = valueAfter(lines, /^license\s*status\b/i)?.trim();
  const expiresOn = isoDate(valueAfter(lines, /^(?:expiration|expiry)\s*date\b/i));
  const responsible = responsibleBrokerFromLines(lines);

  if (!licenseId || !name || !licenseType || !status) return null;
  return {
    licenseId,
    name,
    licenseType,
    status,
    expiresOn,
    responsibleBrokerLicense: responsible.license,
    responsibleBrokerName: responsible.name,
  };
}

function normalizeName(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

export function caDreRecordMatchesPerson(
  record: CaDreRecord,
  expectedName: string,
): boolean {
  return (
    /\b(?:salesperson|broker)\b/i.test(record.licenseType) &&
    normalizeName(record.name) === normalizeName(expectedName)
  );
}

function caDreRecordCanBeResponsibleBroker(record: CaDreRecord): boolean {
  return (
    !/salesperson/i.test(record.licenseType) &&
    /broker|corporation|company|limited liability/i.test(record.licenseType)
  );
}

function credentialStatus(
  record: CaDreRecord,
): NonNullable<CiteEvidence["credentialStatus"]> {
  const status = record.status.trim().toUpperCase();
  if (status === "LICENSED") return "active";
  if (/RESTRICT/.test(status)) return "restricted";
  if (status) return "inactive";
  return "unknown";
}

function recordUrl(licenseId: string): string {
  return `${DRE_ORIGIN}${DRE_PATH}?License_id=${encodeURIComponent(licenseId)}`;
}

async function fetchCaDreRecord(licenseId: string): Promise<CaDreRecord> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const { response, finalUrl } = await safeFetch(
      recordUrl(licenseId),
      {
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent":
            "CiteLock-Verification/2.0 (+https://github.com/Gnoscenti/realestate-ai)",
        },
      },
      { allowCrossOriginRedirects: false, maxRedirects: 1 },
    );
    if (!response.ok || finalUrl.origin !== DRE_ORIGIN)
      throw new Error("registry_unavailable");
    const record = parseCaDreRecord(await readResponseText(response, 750_000));
    if (!record || record.licenseId !== licenseId)
      throw new Error("registry_record_mismatch");
    return record;
  } finally {
    clearTimeout(timer);
  }
}

export async function verifyCaDreIdentity(input: {
  license: string;
  expectedName: string;
  claimedBrokerLicense?: string;
  observedAt: string;
}): Promise<{ evidence: CiteEvidence[]; outcomes: CiteSourceOutcome[] }> {
  const agentUrl = recordUrl(input.license);
  try {
    const agent = await fetchCaDreRecord(input.license);
    if (!caDreRecordMatchesPerson(agent, input.expectedName)) {
      return {
        evidence: [],
        outcomes: [
          {
            source: "regulator",
            status: "mismatch",
            label: "California DRE identity did not match the submitted person",
            url: agentUrl,
            code: "identity_mismatch",
          },
        ],
      };
    }

    const evidence: CiteEvidence[] = [
      {
        id: `ca-dre:${agent.licenseId}:name`,
        subject: "agent",
        field: "name",
        value: agent.name,
        sourceLabel: "California Department of Real Estate",
        sourceTier: "regulator",
        status: "verified",
        sourceUrl: agentUrl,
        observedAt: input.observedAt,
      },
      {
        id: `ca-dre:${agent.licenseId}:license`,
        subject: "agent",
        field: "license",
        value: agent.licenseId,
        sourceLabel: "California Department of Real Estate",
        sourceTier: "regulator",
        status: "verified",
        sourceUrl: agentUrl,
        observedAt: input.observedAt,
        validThrough: agent.expiresOn,
        credentialStatus: credentialStatus(agent),
        jurisdiction: "US-CA",
        note: `Registry status: ${agent.status}; type: ${agent.licenseType}.`,
      },
    ];

    const agentCredentialStatus = credentialStatus(agent);
    const outcomes: CiteSourceOutcome[] = [
      {
        source: "regulator",
        status:
          agentCredentialStatus === "active" ? "verified" : "mismatch",
        label:
          agentCredentialStatus === "active"
            ? "California DRE identity and active license record verified"
            : `California DRE identity matched, but license status is ${agent.status}`,
        url: agentUrl,
        code:
          agentCredentialStatus === "active"
            ? undefined
            : "credential_not_active",
      },
    ];
    const linkedBrokerLicense = agent.responsibleBrokerLicense;
    if (linkedBrokerLicense) {
      const brokerUrl = recordUrl(linkedBrokerLicense);
      try {
        const broker = await fetchCaDreRecord(linkedBrokerLicense);
        if (!caDreRecordCanBeResponsibleBroker(broker))
          throw new Error("registry_record_mismatch");
        evidence.push(
          {
            id: `ca-dre:${agent.licenseId}:responsible-broker`,
            subject: "brokerage",
            field: "responsible_broker",
            value: broker.name,
            sourceLabel: "California Department of Real Estate",
            sourceTier: "regulator",
            status: "verified",
            sourceUrl: brokerUrl,
            observedAt: input.observedAt,
          },
          {
            id: `ca-dre:${linkedBrokerLicense}:license`,
            subject: "brokerage",
            field: "responsible_broker_license",
            value: linkedBrokerLicense,
            sourceLabel: "California Department of Real Estate",
            sourceTier: "regulator",
            status: "verified",
            sourceUrl: brokerUrl,
            observedAt: input.observedAt,
            validThrough: broker.expiresOn,
            credentialStatus: credentialStatus(broker),
            jurisdiction: "US-CA",
            note: `Registry status: ${broker.status}; type: ${broker.licenseType}.`,
          },
        );
        const brokerCredentialStatus = credentialStatus(broker);
        outcomes.push({
          source: "regulator",
          status:
            brokerCredentialStatus === "active" ? "verified" : "mismatch",
          label:
            brokerCredentialStatus === "active"
              ? "California DRE responsible broker and active license verified"
              : `California DRE responsible broker matched, but license status is ${broker.status}`,
          url: brokerUrl,
          code:
            brokerCredentialStatus === "active"
              ? undefined
              : "broker_credential_not_active",
        });
      } catch (error) {
        const code =
          error instanceof Error ? error.message : "registry_unavailable";
        outcomes.push({
          source: "regulator",
          status: "unavailable",
          label: "California DRE responsible broker verification was unavailable",
          url: brokerUrl,
          code: code.startsWith("registry_")
            ? code
            : "registry_unavailable",
        });
      }
    } else {
      outcomes.push({
        source: "regulator",
        status: "unavailable",
        label:
          "California DRE record did not provide a linked responsible broker",
        url: agentUrl,
        code: "responsible_broker_missing",
      });
    }
    if (
      input.claimedBrokerLicense &&
      input.claimedBrokerLicense !== linkedBrokerLicense
    ) {
      evidence.push({
        id: `profile:responsible-broker-license-claim`,
        subject: "brokerage",
        field: "responsible_broker_license",
        value: input.claimedBrokerLicense,
        sourceLabel: "Submitted profile",
        sourceTier: "user",
        status: "declared",
        observedAt: input.observedAt,
      });
    }

    return {
      evidence,
      outcomes,
    };
  } catch (error) {
    const code = error instanceof Error ? error.message : "registry_unavailable";
    return {
      evidence: [],
      outcomes: [
        {
          source: "regulator",
          status: "unavailable",
          label: "California DRE verification was unavailable",
          url: agentUrl,
          code: code.startsWith("registry_") ? code : "registry_unavailable",
        },
      ],
    };
  }
}
