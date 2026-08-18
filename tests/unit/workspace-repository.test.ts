import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  ensurePersonalWorkspace,
  getAgentProfile,
  requireWorkspaceAccess,
  saveAgentProfile,
} from "../../src/lib/workspaces/repository.server";

describe("server-owned workspaces", () => {
  it("creates one idempotent personal workspace per user", async () => {
    const userId = `workspace-test-${randomUUID()}`;
    const first = await ensurePersonalWorkspace(userId);
    const second = await ensurePersonalWorkspace(userId);

    expect(second).toEqual(first);
    expect(first.role).toBe("owner");
    expect(first.kind).toBe("personal");
  });

  it("does not let another user discover or access a workspace", async () => {
    const owner = `owner-${randomUUID()}`;
    const stranger = `stranger-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(owner);

    await expect(
      requireWorkspaceAccess(stranger, workspace.id),
    ).rejects.toThrow("Workspace not found");
  });

  it("rejects whitespace variants instead of authorizing one tenant and querying another", async () => {
    const userId = `opaque-id-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);

    await expect(
      requireWorkspaceAccess(userId, ` ${workspace.id}`),
    ).rejects.toThrow("Invalid workspace id");
    await expect(
      requireWorkspaceAccess(` ${userId}`, workspace.id),
    ).rejects.toThrow("Invalid user id");
  });

  it("persists an authenticated workspace profile", async () => {
    const userId = `profile-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    const saved = await saveAgentProfile(userId, workspace.id, {
      displayName: "Beta Agent",
      businessName: "Beta Realty",
      websiteUrl: "https://example.com",
      areaOfOperations: "San Diego County",
      timezone: "America/Los_Angeles",
    });

    expect(saved.displayName).toBe("Beta Agent");
    expect(saved.provenance).toBe("user_entered");
    await expect(getAgentProfile(userId, workspace.id)).resolves.toEqual(saved);
  });
});
