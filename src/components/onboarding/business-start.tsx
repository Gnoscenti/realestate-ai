import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Megaphone, Radar, Settings2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppStore } from "@/lib/store";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { OnboardingWizard } from "./onboarding-wizard";

function publicLink(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** First-use value comes from the shared identity, without creating CRM data. */
export function BusinessStart() {
  const { user } = useCurrentUserState();
  return (
    <BusinessStartForUser
      key={user?.id || "anonymous"}
      name={user?.displayName}
      email={user?.primaryEmail}
    />
  );
}

function BusinessStartForUser({ name, email }: { name?: string | null; email?: string | null }) {
  const profile = useAppStore((state) => state.agentProfile);
  const [skipped, setSkipped] = useState(false);
  const [coach, setCoach] = useState(true);
  const coachRef = useRef<HTMLDivElement>(null);
  const restartRef = useRef<HTMLButtonElement>(null);
  const [showDraft, setShowDraft] = useState(false);
  const dismissCoach = () => {
    setCoach(false);
    restartRef.current?.focus();
  };
  if (!profile && !skipped) {
    return (
      <div data-testid="fresh-workspace-guide">
        <OnboardingWizard
          embedded
          preferredName={name}
          preferredEmail={email}
          onCancel={() => setSkipped(true)}
        />
      </div>
    );
  }
  const pages = [
    { label: "Website source", href: publicLink(profile?.website) },
    { label: "Brokerage biography source", href: publicLink(profile?.brokerageBioUrl) },
  ].filter((page) => page.href);
  const introduction = profile
    ? [
        `I'm ${profile.name}${profile.title ? `, ${profile.title}` : ""}${profile.brokerage ? ` with ${profile.brokerage}` : ""}.`,
        profile.areaOfOperations ? `I work in ${profile.areaOfOperations}.` : "",
        profile.email
          ? `Contact me at ${profile.email}.`
          : profile.phone
            ? `Reach me at ${profile.phone}.`
            : "",
      ]
        .filter(Boolean)
        .join(" ")
    : "";
  return (
    <Card data-testid="fresh-workspace-guide">
      <CardHeader>
        <CardTitle>{profile ? "Your business overview" : "Choose your first outcome"}</CardTitle>
        {profile && (
          <div className="flex items-start gap-4 pt-2">
            {publicLink(profile.photoUrl) && (
              <img
                src={profile.photoUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="h-16 w-16 rounded-full object-cover"
              />
            )}
            <div className="min-w-0 space-y-1">
              <p className="text-lg font-semibold">{profile.name}</p>
              <p className="text-sm text-[var(--color-fg-muted)]">
                {[profile.title, profile.brokerage, profile.areaOfOperations]
                  .filter(Boolean)
                  .join(" · ") || "Add more details whenever you need them."}
              </p>
              <p className="break-words text-sm">
                {[profile.email, profile.phone].filter(Boolean).join(" · ")}
              </p>
              <div className="flex flex-wrap gap-3 text-xs">
                {pages.map((page) => (
                  <a
                    key={page.label}
                    href={page.href}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    {page.label}
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3" data-tour="business-outcomes">
          <Button
            variant="outline"
            className="min-h-14 whitespace-normal"
            onClick={() => setShowDraft(true)}
            disabled={!profile}
          >
            <Megaphone className="h-4 w-4" />
            Prepare marketing
          </Button>
          <Button asChild variant="outline" className="min-h-14 whitespace-normal">
            <Link to="/aieo">
              <Radar className="h-4 w-4" />
              Inspect visibility
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-14 whitespace-normal">
            <Link to="/outreach">
              <Zap className="h-4 w-4" />
              Try a sample inquiry
            </Link>
          </Button>
        </div>
        {showDraft && profile && (
          <section
            aria-label="Marketing starter"
            className="space-y-3 rounded-lg border border-[var(--color-border)] p-4"
          >
            <h3 className="font-semibold">Your introduction draft</h3>
            <p className="whitespace-pre-wrap text-sm">{introduction}</p>
            <p className="text-xs text-[var(--color-fg-muted)]">
              Built from your confirmed profile. Review the wording before using it.
            </p>
            <Button asChild variant="secondary">
              <Link to="/marketing">Continue in Social Desk</Link>
            </Button>
          </section>
        )}
        {coach && (
          <div
            ref={coachRef}
            tabIndex={-1}
            aria-label="Workspace coach"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                dismissCoach();
              }
            }}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--color-primary-soft)] p-3 text-sm outline-offset-4"
          >
            <p className="max-w-xl">
              Choose an outcome above. Marketing uses your profile, visibility shows source
              findings, and the sample inquiry stays synthetic and unsent.
            </p>
            <Button variant="ghost" onClick={dismissCoach}>
              Dismiss tip
            </Button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setSkipped(false);
              window.dispatchEvent(new Event("realestate-ai:open-profile-setup"));
            }}
          >
            <Settings2 className="h-4 w-4" />
            {profile ? "Review profile and sources" : "Set up from my pages"}
          </Button>
          <Button
            ref={restartRef}
            variant="ghost"
            onClick={() => {
              setCoach(true);
              requestAnimationFrame(() => coachRef.current?.focus());
            }}
          >
            Restart workspace tip
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
