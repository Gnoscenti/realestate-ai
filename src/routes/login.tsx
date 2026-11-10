import React, { useEffect, useState, useSyncExternalStore } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Check,
  Loader2,
  Megaphone,
  Radar,
  Smartphone,
  Sparkles,
  Shield,
  ArrowRight,
  LogOut,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { authClient } from "@/lib/auth/client";
import { useCurrentUserState, type AppUser } from "@/lib/auth/use-current-user";
import { useSignOut } from "@/lib/auth/use-sign-out";
import { endDemoSession, startDemoSession } from "@/lib/demo-mode";
import { restartDemoWorkspace } from "@/lib/demo-workspace";
import { emailAndPasswordEnabled } from "@/lib/auth/email-password";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

// Each point adds something the headline does not already say.
const HIGHLIGHTS = [
  {
    icon: Radar,
    title: "See how AI search describes you",
    body: "Match your real expertise to the questions clients ask AI, and get specific improvements for your public pages.",
  },
  {
    icon: Megaphone,
    title: "Social posts you can stand behind",
    body: "Draft from facts, approve the exact wording, then publish through your own connected accounts.",
  },
  {
    icon: Smartphone,
    title: "Works on your phone and your desktop",
    body: "Use the beta on either device. For now, profile and listings stay in each browser.",
  },
] as const;

// Set when this tab has just signed in or created an account. The workspace can
// briefly bounce back here while the new session propagates; within this window
// /login continues automatically instead of showing the "already signed in" choice.
const JUST_SIGNED_IN_KEY = "realestate-ai.just-signed-in";
const JUST_SIGNED_IN_WINDOW_MS = 60_000;
function markJustSignedIn() {
  try { window.sessionStorage.setItem(JUST_SIGNED_IN_KEY, String(Date.now())); } catch { /* storage unavailable */ }
}
function recentlySignedIn(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const at = Number(window.sessionStorage.getItem(JUST_SIGNED_IN_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < JUST_SIGNED_IN_WINDOW_MS;
  } catch { return false; }
}

function initialMode(): "signin" | "signup" {
  if (typeof window === "undefined") return "signin";
  try {
    return new URLSearchParams(window.location.search).get("signup") === "1" ? "signup" : "signin";
  } catch {
    return "signin";
  }
}

const noopSubscribe = () => () => {};
/** False during SSR and hydration, true afterwards: keeps the first client render identical to the server's. */
function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

function LoginPage() {
  const navigate = useNavigate();
  const hydrated = useHydrated();
  const { user: currentUser, isPending } = useCurrentUserState();
  // The guest demo is not a sign-in: show the normal form to demo visitors.
  const user = currentUser && !currentUser.isDemo ? currentUser : null;
  const [busy, setBusy] = useState<string | null>(null);
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const autoContinue = Boolean(user) && recentlySignedIn();

  // Right after signing in, keep going to the workspace (the session may still be propagating).
  useEffect(() => {
    if (!isPending && user && recentlySignedIn()) void navigate({ to: "/" });
  }, [user, isPending, navigate]);

  const onEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailAndPasswordEnabled) {
      setFormError("Sign-in is temporarily unavailable. Please try again shortly.");
      return;
    }
    const trimmed = email.trim();
    // One problem at a time, named, and shown next to the form.
    if (!trimmed) {
      setFormError("Enter your email address.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) {
      setFormError("Enter a full email address, like you@brokerage.com.");
      return;
    }
    if (password.length < 8) {
      setFormError(
        mode === "signup"
          ? "Choose a password with at least 8 characters."
          : "Enter your password. Passwords are at least 8 characters.",
      );
      return;
    }
    setFormError(null);
    setBusy("email");
    try {
      if (mode === "signup") {
        const { error } = await authClient.signUp.email({
          email: trimmed,
          password,
          name: name.trim() || trimmed.split("@")[0] || "Agent",
        });
        if (error) throw new Error(error.message ?? "");
        endDemoSession();
        markJustSignedIn();
        toast.success("Account created. Welcome!");
      } else {
        const { error } = await authClient.signIn.email({
          email: trimmed,
          password,
        });
        if (error) throw new Error(error.message ?? "");
        endDemoSession();
        markJustSignedIn();
      }
      void navigate({ to: "/" });
    } catch (err) {
      const detail = err instanceof Error ? err.message.trim() : "";
      setFormError(
        detail ||
          (mode === "signup"
            ? "We couldn't create your account. Try again in a moment."
            : "We couldn't sign you in. Check your email and password, then try again."),
      );
    } finally {
      setBusy(null);
    }
  };

  const openDemo = () => {
    startDemoSession();
    // Back from the demo and in again: start over instead of keeping edits.
    restartDemoWorkspace();
    void navigate({ to: "/" });
  };

  // The server always renders "Checking session…". If the session resolves before
  // this route's code finishes loading, rendering the form during hydration would
  // mismatch the server HTML, so wait until hydration has finished.
  if (!hydrated || isPending || (user && (busy || autoContinue))) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-transparent text-sm text-[var(--color-fg-muted)]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {hydrated && user ? "Opening your workspace…" : "Checking session…"}
      </div>
    );
  }

  // Already signed in from an earlier visit: say who, and let a shared device
  // switch accounts instead of silently bouncing into the previous workspace.
  if (user) {
    return <SignedInChooser user={user} onContinue={() => void navigate({ to: "/" })} />;
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
            <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
            RealEstate AI · Private beta
          </div>

          <div>
            <h1 className="font-display text-4xl font-semibold tracking-tight text-[var(--color-fg)] sm:text-5xl lg:text-[3.25rem] lg:leading-[1.1]">
              Get discovered for the work you do best.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-[var(--color-fg-muted)] sm:text-lg">
              CiteLock shows, with evidence, where AI answers overlook you. It
              drafts the improvements and sends them to your Social Desk, then
              tracks what you publish and what AI answers say next.
            </p>
          </div>

          <ul className="space-y-4">
            {HIGHLIGHTS.map((h) => {
              const Icon = h.icon;
              return (
                <li key={h.title} className="flex gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                    <Icon aria-hidden="true" className="h-4 w-4" />
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
            <Shield aria-hidden="true" className="h-3.5 w-3.5" />
            Pay once for workspace access. Nothing renews on its own.
          </div>
        </div>

        {/* Auth card */}
        <div className="glass-panel surface-shine mx-auto w-full max-w-md p-6 sm:p-8">
          <div className="mb-6">
            <h2 className="font-display text-xl font-semibold tracking-tight text-[var(--color-fg)]">
              {mode === "signup" ? "Create your account" : "Sign in to your workspace"}
            </h2>
            <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
              {mode === "signup"
                ? "It takes about a minute. You can set up your profile later."
                : "Welcome back. Your workspace opens as soon as you sign in."}
            </p>
          </div>

          {emailAndPasswordEnabled ? (
            <form className="space-y-4" noValidate onSubmit={(e) => void onEmailSubmit(e)}>
              <div
                role="group"
                aria-label="Sign in or create an account"
                className="flex gap-2 rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] p-1"
              >
                {(["signin", "signup"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={mode === m}
                    className={cn(
                      "min-h-[44px] flex-1 rounded-[var(--radius-sm)] py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]",
                      mode === m
                        ? "bg-[var(--color-surface)] text-[var(--color-fg)] shadow-sm"
                        : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
                    )}
                    onClick={() => {
                      setMode(m);
                      setFormError(null);
                    }}
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
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setFormError(null);
                  }}
                  placeholder="you@brokerage.com"
                  autoComplete="email"
                  autoFocus
                  required
                />
              </div>

              <div>
                <Label htmlFor="login-password">Password</Label>
                <PasswordInput
                  id="login-password"
                  containerClassName="mt-1.5"
                  className="h-11"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setFormError(null);
                  }}
                  placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
                  autoComplete={
                    mode === "signup" ? "new-password" : "current-password"
                  }
                  minLength={8}
                  required
                />
              </div>

              {formError && (
                <p
                  role="alert"
                  className="rounded-[var(--radius-sm)] border border-[color-mix(in_oklab,var(--color-danger)_35%,transparent)] bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-fg)]"
                >
                  {formError}
                </p>
              )}

              <Button
                type="submit"
                className="min-h-[48px] w-full text-base"
                disabled={Boolean(busy)}
              >
                {busy === "email" ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                ) : (
                  <Check aria-hidden="true" className="h-4 w-4" />
                )}
                {mode === "signup"
                  ? "Create account with email"
                  : "Sign in with email"}
              </Button>

              <p className="text-center text-xs leading-relaxed text-[var(--color-fg-muted)]">
                First time here? Choose Create account above.
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

          <button
            type="button"
            onClick={openDemo}
            data-testid="open-demo"
            className="group mt-5 flex min-h-[52px] w-full items-center gap-3 rounded-[var(--radius-md)] border-2 border-[var(--color-primary)] bg-[var(--color-primary-soft)] px-4 py-3 text-left transition-colors hover:bg-[color-mix(in_oklab,var(--color-primary)_22%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2"
          >
            <Eye className="h-5 w-5 shrink-0 text-[var(--color-primary)]" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-[var(--color-fg)]">
                Just looking?{" "}
                <span className="text-[var(--color-primary)] underline underline-offset-4">
                  Explore the demo workspace
                </span>
              </span>
              <span className="mt-0.5 block text-xs text-[var(--color-fg-muted)]">
                No account needed. Sample data only, and nothing is saved.
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-[var(--color-primary)] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </button>

        </div>
      </div>
    </div>
  );
}

function SignedInChooser({ user, onContinue }: { user: AppUser; onContinue: () => void }) {
  const { signingOut, signOut } = useSignOut();
  const label = user.displayName?.trim() || user.primaryEmail || "your account";
  return (
    <div className="gradient-mesh flex min-h-dvh items-center justify-center p-4">
      <div className="surface-card w-full max-w-md space-y-5 p-6 shadow-[var(--shadow-lg)] sm:p-8" data-testid="signed-in-chooser">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-fg)]">You're already signed in</h1>
          <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
            Signed in as <span className="font-medium text-[var(--color-fg)]">{label}</span>
            {user.primaryEmail && user.displayName ? <> ({user.primaryEmail})</> : null}.
          </p>
        </div>
        <div className="space-y-2">
          <Button className="min-h-[44px] w-full" onClick={onContinue} disabled={signingOut}>
            Continue to workspace
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" className="min-h-[44px] w-full" onClick={() => void signOut()} disabled={signingOut}>
            {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            {signingOut ? "Signing out…" : "Sign out and use another account"}
          </Button>
        </div>
        <p className="text-xs text-[var(--color-fg-muted)]">
          On a shared phone or computer, sign out when you're done so the next person can create their own account.
        </p>
      </div>
    </div>
  );
}
