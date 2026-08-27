import { useEffect, RefObject } from "react";

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Modal focus behaviour for a dialog: trap Tab inside it, land focus somewhere
 * sensible on open, and give focus back to whatever opened it on close.
 *
 * Extracted from `Dialog`, which is not reusable by every dialog in the
 * package: `SearchReplace` is draggable and absolutely positioned and renders
 * its own close button, so it can only borrow the behaviour, not the chrome.
 * Sharing the hook rather than copying the effect keeps the two from drifting —
 * the restore-on-close half in particular is easy to omit, and omitting it
 * drops focus to <body>.
 *
 * `getFocusable` is read at keydown rather than closed over, because a dialog's
 * focusable set changes while it is open — `SearchReplace` grows a Replace
 * input and two more buttons when its Replace tab is selected, and a stale
 * first/last pair traps against elements that are no longer the edges.
 */
export function useDialogFocus(
  dialogRef: RefObject<HTMLElement | null>,
  initialFocusRef?: RefObject<HTMLElement | null>
): void {
  useEffect(() => {
    const previousActiveElement = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const focusableNow = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute("disabled")
      );

    const trapFocus = (e: KeyboardEvent) => {
      // Escape is not handled here: dialogs route it through useEscapeToClose,
      // so they join the same open-instance stack every popup uses.
      if (e.key !== "Tab") return;
      const focusable = focusableNow();
      if (focusable.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement as HTMLElement | null;
      if (e.shiftKey && current === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const focusable = focusableNow();
    if (initialFocusRef?.current) {
      initialFocusRef.current.focus();
    } else if (focusable.length > 0) {
      focusable[0].focus();
    } else {
      dialog.focus();
    }

    dialog.addEventListener("keydown", trapFocus);
    return () => {
      dialog.removeEventListener("keydown", trapFocus);
      // Focusing a detached node silently moves focus to <body> — the failure
      // this restore exists to prevent — so a vanished opener is left alone.
      if (previousActiveElement?.isConnected) {
        previousActiveElement.focus();
      }
    };
  }, [dialogRef, initialFocusRef]);
}
