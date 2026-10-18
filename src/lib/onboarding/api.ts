import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { onboardingConfirmationSchema, onboardingScanInputSchema } from "./types";

export const getOnboardingProfile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { readOnboardingProfile } = await import("./repository.server");
    return readOnboardingProfile(context.userId);
  });

export const scanOnboardingSource = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(onboardingScanInputSchema)
  .handler(async ({ context, data }) => {
    const { consumeScrapeQuota, discoverAgentPage } = await import("@/lib/scrape-site.server");
    const { stageOnboardingSource } = await import("./repository.server");
    consumeScrapeQuota(context.userId);
    const discovery = await discoverAgentPage({
      website: data.url,
      agentNameHint: data.agentNameHint,
    });
    return stageOnboardingSource(context.userId, data.kind, discovery);
  });

export const confirmOnboardingProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(onboardingConfirmationSchema)
  .handler(async ({ context, data }) => {
    const { confirmOnboarding } = await import("./repository.server");
    return confirmOnboarding(context.userId, data);
  });
