import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PasswordInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** Classes for the positioning wrapper (margins, width). `className` still styles the input. */
  containerClassName?: string;
  /**
   * What the field holds, used in the toggle's accessible name ("Show password",
   * "Show API key"). Defaults to "password".
   */
  secretLabel?: string;
};

/**
 * Masked text field with an eye toggle that reveals what was typed.
 *
 * - The toggle is `type="button"`, so it never submits the surrounding form.
 * - The field re-masks whenever its form submits, so a secret is not left on
 *   screen after sign-in/sign-up and password managers see a password field.
 * - Spell-check, autocorrect and auto-capitalize stay off: once the value is
 *   shown as plain text, some browsers would otherwise send it to cloud
 *   spelling services or "correct" it.
 * - Edge's built-in reveal button is hidden so there is only one eye.
 */
export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, containerClassName, secretLabel = "password", id, disabled, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const pendingSelection = React.useRef<[number, number] | null>(null);
    const generatedId = React.useId();
    const inputId = id ?? generatedId;

    const setRefs = React.useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      },
      [ref],
    );

    React.useEffect(() => {
      const form = inputRef.current?.form;
      if (!form) return;
      const mask = () => setVisible(false);
      form.addEventListener("submit", mask);
      return () => form.removeEventListener("submit", mask);
    }, []);

    // Switching the input type moves the caret; put it back where the user left it.
    //
    // Chromium rebuilds the field's editor at the next layout after a type change
    // and drops the caret to the start when it does. Restoring before that layout
    // is undone by it, and restoring on a later frame races with typing: keys
    // pressed before the frame land at the start, and the late restore then moves
    // the caret again mid-word. So force the layout here, synchronously, and
    // restore once. Nothing moves the caret after this effect returns.
    React.useLayoutEffect(() => {
      const selection = pendingSelection.current;
      const input = inputRef.current;
      pendingSelection.current = null;
      if (!selection || !input || document.activeElement !== input) return;
      input.getBoundingClientRect();
      input.setSelectionRange(...selection);
    }, [visible]);

    const toggle = () => {
      const input = inputRef.current;
      if (
        input &&
        document.activeElement === input &&
        input.selectionStart !== null &&
        input.selectionEnd !== null
      ) {
        pendingSelection.current = [input.selectionStart, input.selectionEnd];
      }
      setVisible((current) => !current);
    };

    const toggleLabel = `${visible ? "Hide" : "Show"} ${secretLabel}`;
    const Icon = visible ? EyeOff : Eye;

    return (
      <div className={cn("relative", containerClassName)}>
        <Input
          {...props}
          id={inputId}
          ref={setRefs}
          type={visible ? "text" : "password"}
          disabled={disabled}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className={cn("pr-11 [&::-ms-clear]:hidden [&::-ms-reveal]:hidden", className)}
        />
        <button
          type="button"
          aria-label={toggleLabel}
          aria-controls={inputId}
          title={toggleLabel}
          disabled={disabled}
          // Keep focus (and the caret) in the field when the eye is clicked.
          onMouseDown={(event) => event.preventDefault()}
          onClick={toggle}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-[var(--radius-sm)] text-[var(--color-fg-subtle)] transition-colors hover:text-[var(--color-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";
