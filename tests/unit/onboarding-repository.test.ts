import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getSql, type Sql } from "../../src/lib/db";
import {
  ensurePersonalWorkspace,
  getAgentProfile,
  saveAgentProfile,
} from "../../src/lib/workspaces/repository.server";
import type { AgentPageDiscovery } from "../../src/lib/website-scrape";
import {
  confirmOnboarding,
  readOnboardingProfile,
  stageOnboardingSource,
} from "../../src/lib/onboarding/repository.server";
import type { OnboardingConfirmation } from "../../src/lib/onboarding/types";

const NOW = "2026-10-17T20:00:00.000Z";
function discovery(
  profile: AgentPageDiscovery["candidates"][number]["profile"],
  sourceUrl = "https://agent.example",
): AgentPageDiscovery {
  return {
    ok: true,
    sourceUrl,
    observedAt: NOW,
    candidates: [{ profile, identityMatch: "unconfirmed" }],
    warnings: [],
  };
}
const person = {
  name: "Avery Agent",
  phone: "619-555-0100",
  email: "avery@example.com",
  brokerage: "Example Realty",
  market: "Portland, OR",
  mlsNumber: "MEMBER-42",
  license: "REG-123",
  licenseJurisdiction: "OR",
  bio: "Local agent biography.",
  sameAs: ["https://social.example/avery"],
};

describe("durable website and biography onboarding", () => {
  it("shows an existing core profile before first confirmation and preserves its same-person corrections", async () => {
    const owner = `onboarding-core-upgrade-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(owner);
    await saveAgentProfile(owner, workspace.id, {
      displayName: person.name,
      businessName: "Agent LLC",
      businessPhone: "555-0166",
      mlsAgentId: "CORE-MEMBER",
      licenseNumber: "CORE-LICENSE",
      timezone: "America/New_York",
    });
    const prior = await readOnboardingProfile(owner);
    expect(prior).toMatchObject({
      revision: 0,
      profile: {
        name: person.name,
        phone: "555-0166",
        agentMlsId: "CORE-MEMBER",
        license: "CORE-LICENSE",
        website: "",
        areaOfOperations: "",
        mls: "",
        onboardedAt: "",
        onboardingRevision: 0,
      },
    });
    expect(prior?.sources).toEqual([]);
    const source = await stageOnboardingSource(
      owner,
      "website",
      discovery({ name: person.name, market: "Portland, OR", phone: "555-0199" }),
    );
    const saved = await confirmOnboarding(
      owner,
      { expectedRevision: prior!.revision, scanIds: [source.id], confirmedName: person.name },
      NOW,
    );
    expect(saved).toMatchObject({
      revision: 1,
      profile: {
        phone: "555-0166",
        agentMlsId: "CORE-MEMBER",
        license: "CORE-LICENSE",
        website: source.sourceUrl,
        areaOfOperations: "Portland, OR",
        onboardedAt: NOW,
      },
    });
    expect(saved.conflicts.find(({ field }) => field === "phone")?.keptValue).toBe("555-0166");
    expect(await getAgentProfile(owner, workspace.id)).toMatchObject({
      businessName: "Agent LLC",
      timezone: "America/New_York",
      businessPhone: "555-0166",
      mlsAgentId: "CORE-MEMBER",
      licenseNumber: "CORE-LICENSE",
    });
  });

  it("does not bind an unnamed or different-person legacy core profile to a newly confirmed person", async () => {
    const owner = `onboarding-core-person-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(owner);
    await saveAgentProfile(owner, workspace.id, {
      businessPhone: "555-0180",
      licenseNumber: "PRIVATE-CORE",
    });
    expect(await readOnboardingProfile(owner)).toBeNull();
    await saveAgentProfile(owner, workspace.id, {
      displayName: "Different Person",
      businessPhone: "555-0180",
      licenseNumber: "OTHER-CORE",
    });
    expect((await readOnboardingProfile(owner))?.profile.name).toBe("Different Person");
    const source = await stageOnboardingSource(owner, "website", discovery({ name: person.name }));
    const saved = await confirmOnboarding(
      owner,
      { expectedRevision: 0, scanIds: [source.id], confirmedName: person.name },
      NOW,
    );
    expect(saved.profile.phone).toBeUndefined();
    expect(saved.profile.license).toBeUndefined();
  });

  it("reconciles both person-bound sources, exposes conflicts, and shares the confirmed profile with Outreach", async () => {
    const owner = `onboarding-${randomUUID()}`;
    const website = await stageOnboardingSource(owner, "website", discovery(person));
    const bio = await stageOnboardingSource(
      owner,
      "brokerage_bio",
      discovery(
        { ...person, phone: "503-555-0101", title: "Principal broker" },
        "https://brokerage.example/avery",
      ),
    );
    const saved = await confirmOnboarding(
      owner,
      {
        expectedRevision: 0,
        scanIds: [website.id, bio.id],
        confirmedName: person.name,
        overrides: { phone: "503-555-0101", mls: "Example board" },
      },
      NOW,
    );
    expect(saved.revision).toBe(1);
    expect(saved.profile).toMatchObject({
      name: person.name,
      phone: "503-555-0101",
      areaOfOperations: "Portland, OR",
      website: website.sourceUrl,
      brokerageBioUrl: bio.sourceUrl,
      agentMlsId: "MEMBER-42",
      license: "REG-123",
      licenseJurisdiction: "OR",
      title: "Principal broker",
      sameAs: person.sameAs,
    });
    expect(
      saved.conflicts.find(({ field }) => field === "phone")?.values.map(({ value }) => value),
    ).toEqual(["619-555-0100", "503-555-0101"]);
    expect(saved.correctedFields).toEqual(["mls", "phone"]);
    expect(saved.sources).toHaveLength(2);
    expect(await readOnboardingProfile(owner)).toEqual(saved);
    expect(await getAgentProfile(owner, saved.workspaceId)).toMatchObject({
      displayName: person.name,
      businessPhone: "503-555-0101",
      mlsAgentId: "MEMBER-42",
      licenseNumber: "REG-123",
      mlsBoard: "Example board",
    });
  });

  it("never imports another person's contact, MLS identifier, or license", async () => {
    const owner = `onboarding-other-person-${randomUUID()}`;
    const wrong = await stageOnboardingSource(
      owner,
      "brokerage_bio",
      discovery({ ...person, name: "Different Broker" }),
    );
    const saved = await confirmOnboarding(
      owner,
      { expectedRevision: 0, scanIds: [wrong.id], confirmedName: person.name },
      NOW,
    );
    expect(saved.profile.name).toBe(person.name);
    expect(saved.profile.phone).toBeUndefined();
    expect(saved.profile.license).toBeUndefined();
    expect(saved.profile.agentMlsId).toBeUndefined();
    expect(saved.profile.brokerageBioUrl).toBeUndefined();
    expect(saved.profile.areaOfOperations).toBe("");
    expect(saved.profile.mls).toBe("");
  });

  it("isolates scan IDs and saved profiles by the authenticated personal workspace", async () => {
    const owner = `onboarding-owner-${randomUUID()}`;
    const other = `onboarding-stranger-${randomUUID()}`;
    const source = await stageOnboardingSource(owner, "website", discovery(person));
    await expect(
      confirmOnboarding(
        other,
        { expectedRevision: 0, scanIds: [source.id], confirmedName: person.name },
        NOW,
      ),
    ).rejects.toThrow("Page scan not found");
    expect(await readOnboardingProfile(other)).toBeNull();
    expect(await readOnboardingProfile(owner)).toBeNull();
    const saved = await confirmOnboarding(
      owner,
      { expectedRevision: 0, scanIds: [source.id], confirmedName: person.name },
      NOW,
    );
    await expect(getAgentProfile(other, saved.workspaceId)).rejects.toThrow("Workspace not found");
    await expect(readOnboardingProfile(` ${owner}`)).rejects.toThrow("Invalid user id");
  });

  it("serializes duplicate submissions and rejects a stale revision without losing corrections", async () => {
    const owner = `onboarding-duplicate-${randomUUID()}`;
    const source = await stageOnboardingSource(owner, "website", discovery(person));
    const command: OnboardingConfirmation = {
      expectedRevision: 0,
      scanIds: [source.id],
      confirmedName: person.name,
    };
    const [first, duplicate] = await Promise.all([
      confirmOnboarding(owner, command, NOW),
      confirmOnboarding(owner, command, NOW),
    ]);
    expect(duplicate).toEqual(first);
    expect(
      (await confirmOnboarding(owner, { ...command, expectedRevision: 1 }, NOW)).revision,
    ).toBe(1);
    await expect(
      confirmOnboarding(owner, { ...command, overrides: { phone: "555-0199" } }, NOW),
    ).rejects.toThrow("saved profile changed");
    const sql = await getSql();
    expect(
      await sql.query("select revision from workspace_onboarding_revisions where workspace_id=$1", [
        first.workspaceId,
      ]),
    ).toHaveLength(1);
  });

  it("preserves edits and older evidence across rescans, including an intentional empty field", async () => {
    const owner = `onboarding-corrections-${randomUUID()}`;
    const firstSource = await stageOnboardingSource(owner, "website", discovery(person));
    const first = await confirmOnboarding(
      owner,
      {
        expectedRevision: 0,
        scanIds: [firstSource.id],
        confirmedName: person.name,
        overrides: { phone: "555-0188", bio: "" },
      },
      NOW,
    );
    const nextSource = await stageOnboardingSource(
      owner,
      "website",
      discovery({ ...person, phone: "555-0111", bio: "Updated public biography" }),
    );
    const second = await confirmOnboarding(
      owner,
      { expectedRevision: 1, scanIds: [nextSource.id], confirmedName: person.name },
      NOW,
    );
    expect(second.profile.phone).toBe("555-0188");
    expect(second.profile.bio).toBe("");
    expect(second.sources.map(({ id }) => id).sort()).toEqual(
      [firstSource.id, nextSource.id].sort(),
    );
    expect(second.conflicts.find(({ field }) => field === "phone")).toMatchObject({
      keptValue: "555-0188",
    });
    const chosen = await confirmOnboarding(
      owner,
      {
        expectedRevision: 2,
        scanIds: [],
        confirmedName: person.name,
        overrides: { phone: "555-0111" },
      },
      NOW,
    );
    expect(chosen.profile.phone).toBe("555-0111");
    const sql = await getSql();
    const history = await sql.query<{ profile: { phone: string } }>(
      "select profile from workspace_onboarding_revisions where workspace_id=$1 order by revision",
      [first.workspaceId],
    );
    expect(history.map(({ profile }) => profile.phone)).toEqual([
      "555-0188",
      "555-0188",
      "555-0111",
    ]);
  });

  it("rejects expired scans but lets blocked pages finish with an honest manual profile", async () => {
    const owner = `onboarding-expired-${randomUUID()}`;
    const source = await stageOnboardingSource(owner, "website", discovery(person));
    await expect(
      confirmOnboarding(
        owner,
        { expectedRevision: 0, scanIds: [source.id], confirmedName: person.name },
        "2026-10-19T20:00:00.000Z",
      ),
    ).rejects.toThrow("scan has expired");
    expect(await readOnboardingProfile(owner)).toBeNull();
    const blocked = await stageOnboardingSource(owner, "website", {
      ok: false,
      sourceUrl: "http://agent.example",
      observedAt: NOW,
      candidates: [],
      warnings: [],
      error: "The site blocked automated reading.",
    });
    const saved = await confirmOnboarding(
      owner,
      {
        expectedRevision: 0,
        scanIds: [blocked.id],
        confirmedName: person.name,
        overrides: { website: "http://agent.example", email: "signed-in@example.com" },
      },
      NOW,
    );
    expect(saved.profile).toMatchObject({
      name: person.name,
      website: "http://agent.example",
      email: "signed-in@example.com",
      mls: "",
      areaOfOperations: "",
      dataSource: "manual",
    });
    expect(saved.sources[0].ok).toBe(false);
    expect((await getAgentProfile(owner, saved.workspaceId))?.websiteUrl).toBe(
      "http://agent.example",
    );
  });

  it("does not carry another confirmed person's optional credentials into a changed identity", async () => {
    const owner = `onboarding-identity-change-${randomUUID()}`;
    const original = await stageOnboardingSource(owner, "website", discovery(person));
    await confirmOnboarding(
      owner,
      {
        expectedRevision: 0,
        scanIds: [original.id],
        confirmedName: person.name,
        overrides: { phone: "555-0112" },
      },
      NOW,
    );
    const next = await stageOnboardingSource(
      owner,
      "brokerage_bio",
      discovery({ name: "Blair Broker", title: "Agent" }),
    );
    const changed = await confirmOnboarding(
      owner,
      { expectedRevision: 1, scanIds: [next.id], confirmedName: "Blair Broker" },
      NOW,
    );
    expect(changed.profile).toMatchObject({ name: "Blair Broker", title: "Agent" });
    expect(changed.profile.phone).toBeUndefined();
    expect(changed.profile.license).toBeUndefined();
    expect(changed.profile.agentMlsId).toBeUndefined();
    expect(changed.correctedFields).toEqual([]);
    expect(changed.sources).toHaveLength(2);
    expect(await getAgentProfile(owner, changed.workspaceId)).toMatchObject({
      displayName: "Blair Broker",
      businessPhone: null,
      licenseNumber: null,
      mlsAgentId: null,
    });
  });

  it("persists a manual identity change instead of treating its empty fields as an unchanged profile", async () => {
    const owner = `onboarding-manual-identity-${randomUUID()}`;
    const original = await confirmOnboarding(
      owner,
      { expectedRevision: 0, scanIds: [], confirmedName: "Avery Agent" },
      NOW,
    );
    const changed = await confirmOnboarding(
      owner,
      { expectedRevision: original.revision, scanIds: [], confirmedName: "Blair Broker" },
      NOW,
    );
    expect(changed.revision).toBe(2);
    expect(changed.profile.name).toBe("Blair Broker");
    expect((await readOnboardingProfile(owner))?.profile.name).toBe("Blair Broker");
    expect((await getAgentProfile(owner, changed.workspaceId))?.displayName).toBe("Blair Broker");
  });

  it("rolls back profile, evidence acceptance, and revision history if the shared core save fails", async () => {
    const owner = `onboarding-rollback-${randomUUID()}`;
    const source = await stageOnboardingSource(owner, "website", discovery(person));
    const sql = await getSql();
    const broken = {
      ...sql,
      transaction: <T>(work: (tx: Sql) => Promise<T>) =>
        sql.transaction((tx) =>
          work({
            ...tx,
            query: async <R>(statement: string, params?: unknown[]): Promise<R[]> => {
              if (/insert into agent_profiles/.test(statement))
                throw new Error("Injected core profile failure");
              return tx.query<R>(statement, params);
            },
          } as Sql),
        ),
    } as Sql;
    await expect(
      confirmOnboarding(
        owner,
        { expectedRevision: 0, scanIds: [source.id], confirmedName: person.name },
        NOW,
        broken,
      ),
    ).rejects.toThrow("Injected core profile failure");
    expect(await readOnboardingProfile(owner)).toBeNull();
    const [row] = await sql.query<{ confirmed_revision: number | null }>(
      "select confirmed_revision from workspace_onboarding_sources where id=$1",
      [source.id],
    );
    expect(row.confirmed_revision).toBeNull();
    expect(
      await sql.query("select revision from workspace_onboarding_revisions where workspace_id=$1", [
        `personal:${owner}`,
      ]),
    ).toHaveLength(0);
  });
});
