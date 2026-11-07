import { useState } from "react";
import { toast } from "sonner";
import { signOut } from "./client";

/** Signs out of this app's session and returns to the sign-in page. */
export function useSignOut() {
  const [signingOut, setSigningOut] = useState(false);
  const run = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      // Forget a recent sign-in so /login shows the sign-in form, not an auto-continue.
      try { window.sessionStorage.removeItem("realestate-ai.just-signed-in"); } catch { /* storage unavailable */ }
      // `signOut` navigates with a full page load, which also clears in-memory
      // workspace state from the previous account.
      await signOut("/login");
    } catch {
      setSigningOut(false);
      toast.error("We couldn't sign you out. Check your connection and try again.");
    }
  };
  return { signingOut, signOut: run };
}
