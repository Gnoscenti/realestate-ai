import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Loader2, LogOut, Settings2 } from "lucide-react";
import { authEnabled } from "@/lib/auth/client";
import { useSignOut } from "@/lib/auth/use-sign-out";
import { initials } from "@/lib/utils";

type AccountMenuProps = {
  name: string | null;
  email: string | null;
  hasProfile: boolean;
  onEditProfile: () => void;
};

/**
 * Header account control: who is signed in, profile access and Sign out.
 * Shown at every screen width so a shared device can always switch accounts.
 */
export function AccountMenu({ name, email, hasProfile, onEditProfile }: AccountMenuProps) {
  const { signingOut, signOut: runSignOut } = useSignOut();
  const label = name?.trim() || email || "Account";
  const firstName = label.split(/[\s@]/)[0] || "Account";
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={`Account menu for ${label}`}
        data-testid="account-menu"
        className="flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] py-1 pl-1 pr-1 text-sm font-medium text-[var(--color-fg)] transition-colors hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] sm:pr-3"
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--color-primary-soft)] text-xs font-semibold text-[var(--color-primary)]">
          {initials(label) || "?"}
        </span>
        <span className="hidden max-w-[10rem] truncate sm:inline">{firstName}</span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-[15rem] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 text-sm text-[var(--color-fg)] shadow-[var(--shadow-lg)]"
        >
          <div className="px-2.5 py-2">
            <div className="text-xs text-[var(--color-fg-muted)]">Signed in as</div>
            <div className="truncate font-medium">{name?.trim() || "Your account"}</div>
            {email && <div className="truncate text-xs text-[var(--color-fg-muted)]">{email}</div>}
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-[var(--color-border)]" />
          <DropdownMenu.Item
            onSelect={onEditProfile}
            className="flex min-h-[40px] cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2.5 outline-none data-[highlighted]:bg-[var(--color-surface-2)]"
          >
            <Settings2 className="h-4 w-4" />
            {hasProfile ? "Edit profile" : "Set up profile"}
          </DropdownMenu.Item>
          {authEnabled && (
            <DropdownMenu.Item
              disabled={signingOut}
              onSelect={(event) => {
                event.preventDefault();
                void runSignOut();
              }}
              className="flex min-h-[40px] cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2.5 text-[var(--color-danger)] outline-none data-[disabled]:opacity-60 data-[highlighted]:bg-[var(--color-surface-2)]"
            >
              {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              {signingOut ? "Signing out…" : "Sign out"}
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Compact "Signed in as … · Sign out" line for full-screen gates such as the paywall. */
export function SignedInAs({ label }: { label: string }) {
  const { signingOut, signOut: runSignOut } = useSignOut();
  if (!authEnabled) return null;
  return (
    <p className="mt-4 text-center text-xs text-[var(--color-fg-muted)]">
      Signed in as <span className="font-medium text-[var(--color-fg)]">{label}</span> ·{" "}
      <button
        type="button"
        onClick={() => void runSignOut()}
        disabled={signingOut}
        className="font-medium text-[var(--color-primary)] underline-offset-4 hover:underline disabled:opacity-60"
      >
        {signingOut ? "Signing out…" : "Not you? Sign out"}
      </button>
    </p>
  );
}
