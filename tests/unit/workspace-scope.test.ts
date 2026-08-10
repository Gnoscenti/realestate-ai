import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
});

describe("workspace scope", () => {
  it("does not crash when persist api is unavailable", async () => {
    vi.resetModules();
    const setState = vi.fn();

    vi.doMock("@/lib/store", () => ({
      useAppStore: {
        getState: () => ({ hydrated: false }),
        setState,
      },
    }));

    const { bindWorkspaceToUser, currentWorkspaceKey, workspaceStorageKey } =
      await import("@/lib/auth/workspace-scope");

    await expect(bindWorkspaceToUser("user-123")).resolves.toBeUndefined();
    expect(currentWorkspaceKey()).toBe("realestate-ai-workspace-v12:user-123");
    expect(workspaceStorageKey(" user-123 ")).toBe(
      "realestate-ai-workspace-v12:user-123",
    );
    expect(setState).toHaveBeenCalledWith({ hydrated: true });
  });
});
