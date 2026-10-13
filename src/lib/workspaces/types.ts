import { z } from "zod";

export const workspaceRoleSchema = z.enum(["owner", "admin", "member"]);
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

export interface WorkspaceContext {
  id: string;
  name: string;
  kind: "personal" | "team";
  role: WorkspaceRole;
}

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);

export const agentProfileInputSchema = z.object({
  displayName: optionalTrimmed(120),
  businessName: optionalTrimmed(160),
  brokerage: optionalTrimmed(160),
  businessPhone: optionalTrimmed(40),
  websiteUrl: optionalTrimmed(500).refine(
    (value) => !value || /^https:\/\//i.test(value),
    "Website must use HTTPS",
  ),
  areaOfOperations: optionalTrimmed(240),
  mlsBoard: optionalTrimmed(160),
  mlsAgentId: optionalTrimmed(120),
  licenseNumber: optionalTrimmed(120),
  timezone: z.string().trim().min(1).max(100).default("America/Los_Angeles"),
});

export type AgentProfileInput = z.input<typeof agentProfileInputSchema>;

export interface AgentProfileRecord {
  workspaceId: string;
  displayName: string | null;
  businessName: string | null;
  brokerage: string | null;
  businessPhone: string | null;
  websiteUrl: string | null;
  areaOfOperations: string | null;
  mlsBoard: string | null;
  mlsAgentId: string | null;
  licenseNumber: string | null;
  timezone: string;
  provenance: "user_entered" | "workspace_import" | "provider_sync";
}
