import React, { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  Check,
  Loader2,
  Sparkles,
  Zap,
  Calendar,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { emailAndPasswordEnabled } from "@/lib/auth/email-password";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

const HIGHLIGHTS = [
  {
    icon: Zap,
    title: "Speed-to-lead in under 5 minutes",
    body: "Ranked Action Desk with reply packs ready before the lead goes cold.",
  },
  {
    icon: BarChart3,
    title: "CMAs that sound like you",
    body: "Comps, narrative, and pricing stories pulled from your book — not generic filler.",
  },
  {
    icon: Calendar,
    title: "One focused workspace, phone or desktop",
    body: "Use the beta app on either device. For now, profile and listings stay in each browser.",
  },
] as const;

function LoginPage() {
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const [busy, setBusy] = useState<string | null>(null);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  // Already signed in → home (shell opens access/workspace; setup is optional)
  useEffect(() => {
    if (!isPending && user) {
      void navigate({ to: "/" });
    }
  }, [user, isPending, navigate]);

  const onEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailAndPasswordEnabled) {
      toast.message("Email/password is not enabled");
      return;
    }
    const trimmed = email.trim();
    if (!trimmed || password.length < 8) {
      toast.error("Use a valid email and a password of at least 8 characters");
      return;
    }
    setBusy("email");
    try {
      if (mode === "signup") {
        const { error } = await authClient.signUp.email({
          email: trimmed,
          password,
          name: name.trim() || trimmed.split("@")[0] || "Agent",
        });
        if (error) throw new Error(error.message ?? "Sign-up failed");
        toast.success("Account created — welcome in");
      } else {
        const { error } = await authClient.signIn.email({
          email: trimmed,
          password,
        });
        if (error) throw new Error(error.message ?? "Sign-in failed");
      }
      void navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(null);
    }
  };

  if (isPending || user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-transparent text-sm text-[var(--color-fg-muted)]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {user ? "Opening your workspace…" : "Checking session…"}
      </div>
    );
  }

  return (
    <div className="gradient-mesh relative min-h-dvh overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 15% 0%, color-mix(in oklab, var(--color-primary) 22%, transparent), transparent 55%), radial-gradient(ellipse 50% 45% at 95% 90%, color-mix(in oklab, var(--color-accent) 16%, transparent), transparent 50%)",
        }}
      />

      <div className="relative mx-auto grid min-h-dvh max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-16">
        {/* Dazzle copy */}
        <div className="space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--color-primary)_35%,var(--color-border))] bg-[var(--color-primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--color-primary)]">
            <Sparkles className="h-3.5 w-3.5" />
            RealEstate AI · Private beta
          </div>

          <div>
            <h1 className="font-display text-4xl font-semibold tracking-tight text-[var(--color-fg)] sm:text-5xl lg:text-[3.25rem] lg:leading-[1.1]">
              Your AI command center for every listing, lead, and closing.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-[var(--color-fg-muted)] sm:text-lg">
              Ranked daily work, instant response packs, CMAs, and content that
              sounds like you — on iPhone or desktop with one login.
            </p>
          </div>

          <ul className="space-y-4">
            {HIGHLIGHTS.map((h) => {
              const Icon = h.icon;
              return (
                <li key={h.title} className="flex gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[var(--color-fg)]">
                      {h.title}
                    </div>
                    <p className="mt-0.5 text-sm text-[var(--color-fg-muted)]">
                      {h.body}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-fg-subtle)]">
            <Shield className="h-3.5 w-3.5" />
            One-time access · No monthly subscription · Your data stays yours
          </div>
        </div>

        {/* Auth card */}
        <div className="glass-panel surface-shine mx-auto w-full max-w-md p-6 sm:p-8">
          <div className="mb-6">
            <h2 className="font-display text-xl font-semibold tracking-tight text-[var(--color-fg)]">
              Get started
            </h2>
            <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
              Sign in to open your workspace. Profile setup can wait until you’re ready.
            </p>
          </div>

          {emailAndPasswordEnabled ? (
            <form className="space-y-4" onSubmit={(e) => void onEmailSubmit(e)}>
              <div className="flex gap-2 rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] p-1">
                {(["signin", "signup"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={cn(
                      "flex-1 rounded-[var(--radius-sm)] py-2.5 text-sm font-medium transition-colors",
                      mode === m
                        ? "bg-[var(--color-surface)] text-[var(--color-fg)] shadow-sm"
                        : "text-[var(--color-fg-muted)]",
                    )}
                    onClick={() => setMode(m)}
                  >
                    {m === "signin" ? "Sign in" : "Create account"}
                  </button>
                ))}
              </div>

              {mode === "signup" && (
                <div>
                  <Label htmlFor="login-name">Name</Label>
                  <Input
                    id="login-name"
                    className="mt-1.5 h-11"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Alex Rivera"
                    autoComplete="name"
                  />
                </div>
              )}

              <div>
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  className="mt-1.5 h-11"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@brokerage.com"
                  autoComplete="email"
                  autoFocus
                  required
                />
              </div>

              <div>
                <Label htmlFor="login-password">Password</Label>
                <Input
                  id="login-password"
                  type="password"
                  className="mt-1.5 h-11"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete={
                    mode === "signup" ? "new-password" : "current-password"
                  }
                  minLength={8}
                  required
                />
              </div>

              <Button
                type="submit"
                className="min-h-[48px] w-full text-base"
                disabled={Boolean(busy)}
              >
                {busy === "email" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {mode === "signup"
                  ? "Create account with email"
                  : "Sign in with email"}
              </Button>

              <p className="text-center text-xs leading-relaxed text-[var(--color-fg-muted)]">
                First time here? Choose Create account above. No profile or MLS
                setup is required to enter the workspace.
              </p>
            </form>
          ) : (
            <div
              role="status"
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 text-sm text-[var(--color-fg-muted)]"
            >
              Sign-in is temporarily unavailable. Please try again shortly.
            </div>
          )}

          {/* Broker OAuth buttons stay hidden until the server exposes a
              same-origin capability confirming that federation is configured. */}

          <p className="mt-6 text-center text-[11px] leading-relaxed text-[var(--color-fg-subtle)]">
            Open the workspace first. Add your profile, MLS, or website later
            from inside the app.
          </p>
        </div>
      </div>
    </div>
  );
}
