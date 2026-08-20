import { useState } from "react";
import { ImageIcon, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buildImaginePrompt } from "@/lib/imagine-media";
import type { Property } from "@/data/seed";
import type { CampaignPlan } from "@/lib/social-agent";

type Props = {
  property?: Property | null;
  imageUrl?: string | null;
  activePlan: CampaignPlan | null;
  onPlan: (plan: CampaignPlan) => void;
};

export function SocialGenerateButtons({ property, imageUrl, activePlan, onPlan }: Props) {
  const [busy, setBusy] = useState(false);
  const hasPhoto = Boolean(imageUrl);

  const applyUrl = (url: string, prompt: string, kind: "image" | "video") => {
    if (!activePlan) {
      toast.success(kind === "image" ? "Social image ready" : "Social video ready");
      return;
    }
    const next = {
      ...activePlan,
      posts: activePlan.posts.map((post) => ({
        ...post,
        imageUrl: url,
        mediaSource: "imagine" as const,
        imaginePrompt: prompt,
        visualBrief: `Grok Imagine ${kind} · ${property?.title || "listing"}`,
      })),
    };
    onPlan(next);
    toast.success(kind === "image" ? "Social image applied to campaign" : "Social video applied to campaign");
  };

  return (
    <div className="grid gap-2">
      <Button
        className="min-h-[44px] w-full"
        disabled={!hasPhoto || busy}
        onClick={() => {
          void (async () => {
            if (!imageUrl) {
              toast.message("Add real listing photos in MLS Hub first");
              return;
            }
            setBusy(true);
            try {
              const { generateImage } = await import("@/lib/imagine-api");
              const prompt = buildImaginePrompt(property, "enhance");
              const res = await generateImage({
                data: { prompt, imageUrl, aspectRatio: "1:1" },
              });
              if (!res.ok) {
                toast.message(res.error);
                return;
              }
              applyUrl(res.urls[0]!, prompt, "image");
            } catch (e) {
              toast.message(e instanceof Error ? e.message : "Image generation failed");
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating…
          </>
        ) : (
          <>
            <ImageIcon className="h-4 w-4" />
            Generate Social Image
          </>
        )}
      </Button>
      <Button
        className="min-h-[44px] w-full"
        variant="outline"
        disabled={!hasPhoto || busy}
        onClick={() => {
          void (async () => {
            if (!imageUrl) {
              toast.message("Add real listing photos in MLS Hub first");
              return;
            }
            setBusy(true);
            try {
              const { generateVideo } = await import("@/lib/imagine-api");
              const prompt = buildImaginePrompt(property, "enhance");
              const res = await generateVideo({
                data: {
                  prompt: `${prompt}\nShort social motion, elegant, no text distortion.`,
                  imageUrl,
                  duration: 6,
                  aspectRatio: "9:16",
                },
              });
              if (!res.ok) {
                toast.message(res.error);
                return;
              }
              applyUrl(res.url, prompt, "video");
            } catch (e) {
              toast.message(e instanceof Error ? e.message : "Video generation failed");
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        <Sparkles className="h-4 w-4" />
        Generate Social Video
      </Button>
      {!hasPhoto && (
        <p className="text-[11px] text-[var(--color-fg-muted)]">
          Scan MLS Hub / website for real photos first. We never invent property imagery.
        </p>
      )}
    </div>
  );
}
