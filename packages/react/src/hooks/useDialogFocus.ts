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
 *
 * `fallbackFocusRef` is where focus goes when the opener is no longer in the
 * document — a dialog opened from a control that the dialog's own work then
 * removed. Without it that case lands on <body>, which is the same lost-focus
 * failure the restore exists to prevent, just reached by a different route.
 */
export function useDialogFocus(
  dialogRef: RefObject<HTMLElement | null>,
  initialFocusRef?: RefObject<HTMLElement | null>,
  fallbackFocusRef?: RefObject<HTMLElement | null>
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
      // The dialog sits inside the workbook container, whose own keydown
      // handler treats Tab as a grid move: it advances the selection and pulls
      // focus onto the cell input, which defeats the trap from the other side
      // — every element below is still reachable, they are simply reached by
      // moving the grid instead of the dialog. Stopping here keeps Tab a
      // dialog gesture. Not preventDefault: a Tab in the middle of the dialog
      // must still move to the next control.
      e.stopPropagation();
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
      // this restore exists to prevent — so a vanished opener is not focused
      // but handed on to the fallback instead.
      if (previousActiveElement?.isConnected) {
        previousActiveElement.focus();
      } else if (fallbackFocusRef?.current?.isConnected) {
        // Read at close time, not captured when the dialog opened: the node
        // this points at is owned by the workbook and can be replaced while
        // the dialog is up, and a captured one would by then be the detached
        // node whose focus() lands on <body> — exactly what this branch is
        // here to avoid.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        fallbackFocusRef.current.focus();
      }
    };
  }, [dialogRef, initialFocusRef, fallbackFocusRef]);
}
