import { useEffect, RefObject } from "react";
import { focusAfterCommit } from "../utils/keyboardActivation";

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/* Both spellings of disabled, because this package uses both: native controls
   carry the attribute, and the `<div role="button">` controls almost every
   piece of chrome is built from can only say `aria-disabled`. The other three
   focusable-selector definitions here — useEscapeToClose, useRovingFocus and
   Workbook's — already exclude `aria-disabled`; this one is shared behaviour
   now, so it excludes what they exclude. Nothing `aria-disabled` renders
   inside a dialog today, so this is a guard rather than a fix: the failure it
   forecloses is initial focus landing on a control that announces "dimmed"
   and does nothing, and jsdom would not see it. */
const DISABLED = '[disabled], [aria-disabled="true"]';

/**
 * Focus behaviour for a dialog: cycle Tab inside it, land focus somewhere
 * sensible on open, and give focus back to whatever opened it on close.
 *
 * The Tab cycle is not a claim of modality, and a caller must not read it as
 * licence to set `aria-modal`. It keeps Tab a dialog gesture instead of a grid
 * move; whether the rest of the page is genuinely inert is the caller's
 * question, answered differently by the two callers here — `Dialog` is
 * task-blocking and sets `aria-modal`, `SearchReplace` sits over a live grid
 * and deliberately does not.
 *
 * A caller taking the cycle owes WCAG 2.1.2 an exit by standard keys. `Dialog`
 * has Escape; `SearchReplace` does not, and argues its exits at its own call
 * site rather than here, because what counts as an exit is the caller's
 * inventory of controls and not the hook's.
 *
 * Extracted from `Dialog`, which is not reusable by every dialog in the
 * package: `SearchReplace` is draggable and absolutely positioned and renders
 * its own close button, so it can only borrow the behaviour, not the chrome.
 * Sharing the hook rather than copying the effect keeps the two from drifting —
 * the restore-on-close half in particular is easy to omit, and omitting it
 * drops focus to <body>.
 *
 * The focusable set is read at keydown rather than closed over, because it
 * changes while a dialog is open — `SearchReplace` grows a Replace
 * input and two more buttons when its Replace tab is selected, and a stale
 * first/last pair traps against elements that are no longer the edges.
 *
 * `fallbackFocusRef` is where focus goes when the opener is no longer in the
 * document — a dialog opened from a control that the dialog's own work then
 * removed. Without it that case lands on <body>, which is the same lost-focus
 * failure the restore exists to prevent, just reached by a different route.
 *
 * `deferRestore` decides *when* the restore runs, and only `Dialog` needs it —
 * see the cleanup for the full reasoning. It defaults to the synchronous
 * restore this hook was extracted with, so `SearchReplace`, which has no
 * announcement riding the focus utterance, keeps exactly the behaviour it had.
 */
export function useDialogFocus(
  dialogRef: RefObject<HTMLElement | null>,
  initialFocusRef?: RefObject<HTMLElement | null>,
  fallbackFocusRef?: RefObject<HTMLElement | null>,
  deferRestore = false
): void {
  useEffect(() => {
    const previousActiveElement = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const focusableNow = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.matches(DISABLED)
      );

    const trapFocus = (e: KeyboardEvent) => {
      // Escape is not handled here, and the two callers do not agree on where
      // it goes: `Dialog` routes it through useEscapeToClose, joining the
      // open-instance stack every popup uses; `SearchReplace` does not handle
      // Escape at all. That asymmetry is why the hook stays out of it — see
      // the 2.1.2 note at SearchReplace's role="dialog" for why a Tab cycle
      // with no Escape is still escapable there.
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
      /*
       * Focusing a detached node does nothing at all — focus is left exactly
       * where it is, which as this dialog unmounts means it goes to <body>
       * along with the element being removed. That is the failure this restore
       * exists to prevent, so a vanished opener is not focused and quietly
       * relied on; it is handed to the fallback instead.
       *
       * `fallbackFocusRef` is read at close time, not captured when the dialog
       * opened: the node it points at is owned by the workbook and can be
       * replaced while the dialog is up, and a captured one would by then be
       * detached.
       */
      const restore = () => {
        if (previousActiveElement?.isConnected) return previousActiveElement;
        // eslint-disable-next-line react-hooks/exhaustive-deps
        return fallbackFocusRef?.current ?? null;
      };

      if (!deferRestore) {
        const target = restore();
        if (target?.isConnected) target.focus();
        return;
      }

      /*
       * `Dialog` only. The restore is a focus change, and focus changes have to
       * go last (the reasoning `focusAfterCommit` documents at length).
       *
       * An action that closes a dialog usually also commits something, and the
       * status of what it committed reaches a screen reader through the focus
       * utterance of the element focus lands on — `useContextMenuAnnouncements`
       * writes the text and points the cell input's `aria-describedby` at it,
       * rather than racing a live region the focus change would discard. That
       * write happens in a passive *mount* effect, and React runs passive
       * unmount cleanups first, so restoring focus from here inline beat the
       * announcement into the DOM every time: the Sort modal's Sort button
       * composed "text entry area, blank, main" and never mentioned the sort.
       *
       * `focusAfterCommit` re-checks `isConnected` inside the timeout, so an
       * opener that goes away in the meantime is left alone rather than
       * focused as a detached node — and because `restore` runs in there too,
       * the fallback is chosen against the DOM as it stands then.
       */
      focusAfterCommit(restore);
    };
  }, [dialogRef, initialFocusRef, fallbackFocusRef, deferRestore]);
}
