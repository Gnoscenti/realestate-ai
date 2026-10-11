import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";

const inputSchema = z.object({
  website: z.string().min(3).max(500),
  agentNameHint: z.string().max(120).optional(),
  maxPages: z.number().min(1).max(8).optional(),
});

export const scrapeAgentWebsite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(inputSchema)
  .handler(async ({ data, context }) => {
    const { consumeScrapeQuota, scrapeRealtorWebsite } = await import(
      "@/lib/scrape-site.server"
    );
    consumeScrapeQuota(context.userId);
    return scrapeRealtorWebsite(data);
  });
