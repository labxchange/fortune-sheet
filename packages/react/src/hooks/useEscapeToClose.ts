import React, { useEffect, useRef } from "react";
import { isWithinPopup, isWithinPopupContent } from "../utils/containment";

const DEFAULT_FOCUSABLE_SELECTOR =
  '[role="button"]:not([aria-disabled="true"]), [tabindex="0"]:not([aria-disabled="true"])';

// Shared across every useEscapeToClose instance: when popups are nested
// (e.g. a color submenu open inside a toolbar combo), each has its own
// document-level listener, and stopPropagation() on one does not stop a
// sibling listener already attached to the same document target from also
// firing. Tracking open instances in a stack lets each one check whether
// it's the innermost (topmost) before reacting, so Escape only closes one
// popup layer at a time instead of unwinding all of them at once.
const openInstanceStack: symbol[] = [];

export type UseEscapeToCloseOptions = {
  /** Set to false to skip attaching listeners (e.g. while a popup is closed). Default true. */
  open?: boolean;
  onClose: () => void;
  containerRef: React.RefObject<HTMLElement | null>;
  /** Focus the first focusable item inside containerRef when it opens. Default true. */
  autoFocus?: boolean;
  autoFocusSelector?: string;
  /** Restore focus to whatever was focused before opening. Default true. */
  restoreFocus?: boolean;
  /**
   * Also close when focus moves out of the popup entirely (WCAG 2.4.11, and
   * the behaviour the APG menu pattern specifies for Tab).
   *
   * **Defaults to false.** Every popup in the app mounts this hook, so a
   * default-on dismissal would be an app-wide behaviour change; opting in per
   * call site also makes the diff say which popups were actually considered.
   */
  closeOnFocusOut?: boolean;
  /**
   * Elements that count as "inside" for `closeOnFocusOut` despite not being DOM
   * descendants of `containerRef` — a submenu rendered as a sibling rather than
   * a child. Without this, focus entering such a submenu reads as focus leaving
   * the popup and closes the very thing the user is reaching for.
   *
   * Read at event time, not at mount, so a conditionally-rendered submenu whose
   * ref is still null when the popup opens is handled correctly.
   */
  withinRefs?: React.RefObject<HTMLElement | null>[];
};

/**
 * Popup dismissal, in one place.
 *
 * The name is now narrower than the job: this owns Escape, the autofocus on
 * open and the focus-restore on close, and — behind `closeOnFocusOut` — whether
 * the popup survives focus leaving it. Those belong together because they are
 * one question, "is focus still in this popup", asked at four moments; the
 * nested-popup rule in particular has to be answered identically by Escape and
 * by focus-out, and `openInstanceStack` above already exists to answer it once.
 *
 * One deliberate exception to that "identically": `focusInsideContainer` below,
 * which gates the restore-on-close, asks the narrow `containerRef.contains()`
 * version rather than `isWithinPopupContent`. That is the behaviour the
 * satellite submenus need, not a gap in them — a popup closed from *inside* a
 * satellite is always closed by a handler that owns where focus goes next, and
 * a restore here would undo it. `FilterMenu`'s Filter-by-colour Confirm is the
 * live case: it closes both layers from a button in the submenu and calls
 * `restoreFocusToGrid` itself, so the parent instance must decline. Widening
 * the check would pull focus back to the funnel instead
 * (`filterByColorSubmenu.test.tsx`, "lands focus on the grid after Confirm").
 *
 * It is not renamed because all eight call sites would churn for no behaviour
 * change, on a diff whose main risk is review size. Folding `useOutsideClick`
 * in as well — making this the single `useDismissablePopup` the codebase is
 * clearly converging on — is the honest next step, and deliberately not taken
 * here.
 */
export function useEscapeToClose({
  open = true,
  onClose,
  containerRef,
  autoFocus = true,
  autoFocusSelector = DEFAULT_FOCUSABLE_SELECTOR,
  restoreFocus = true,
  closeOnFocusOut = false,
  withinRefs,
}: UseEscapeToCloseOptions): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Tracked through a ref for the same reason as onClose: the effect keys on
  // `open` alone, and callers pass this array inline, so a fresh identity every
  // render must not mean a stale list inside the handler.
  const withinRefsRef = useRef(withinRefs);
  withinRefsRef.current = withinRefs;
  const instanceIdRef = useRef<symbol | undefined>(undefined);
  if (!instanceIdRef.current) instanceIdRef.current = Symbol("escapeToClose");

  useEffect(() => {
    if (!open) return undefined;
    const instanceId = instanceIdRef.current!;
    openInstanceStack.push(instanceId);
    const previousActiveElement = document.activeElement as HTMLElement | null;

    if (autoFocus) {
      const first =
        containerRef.current?.querySelector<HTMLElement>(autoFocusSelector);
      first?.focus();
    }

    // Tracked continuously (rather than queried from containerRef at
    // cleanup time) because several call sites conditionally unmount their
    // container on close: React nulls that ref during the mutation phase,
    // which runs before this passive effect's cleanup does.
    let focusInsideContainer = !!containerRef.current?.contains(
      document.activeElement
    );
    // Sticky: whether focus has been inside at any point, which is what
    // `closeOnFocusOut` arms on. See the focusout handler.
    let focusHasBeenInside = isWithinPopupContent(
      document.activeElement,
      containerRef,
      withinRefs
    );
    const handleFocusIn = (e: FocusEvent) => {
      focusInsideContainer = !!containerRef.current?.contains(e.target as Node);
      // Counts a satellite submenu too — focus reaching the colour list is
      // focus inside the widget, even though it is not inside the container.
      if (
        isWithinPopupContent(
          e.target as Node,
          containerRef,
          withinRefsRef.current
        )
      ) {
        focusHasBeenInside = true;
      }
    };
    document.addEventListener("focusin", handleFocusIn);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // only the innermost open instance (topmost of the stack) should
      // close on Escape; an outer popup's listener no-ops instead
      if (openInstanceStack[openInstanceStack.length - 1] !== instanceId) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      onCloseRef.current();
    };
    // capture phase: fires regardless of which nested element (a native
    // input, a submenu item, ...) currently has focus
    document.addEventListener("keydown", handleKeyDown, true);

    /**
     * Close when focus genuinely leaves the popup (WCAG 2.4.11): these are
     * absolutely-positioned overlays, so one left open behind the newly focused
     * element obscures it.
     *
     * Bound on `document` rather than on the container, because a satellite
     * submenu is not always a descendant — a focusout inside one would never
     * bubble through `containerRef` at all, and the popup would survive being
     * tabbed out of. Reading both ends of the move off the event handles either
     * topology with one rule.
     *
     * `relatedTarget == null` must never close, and is the load-bearing case:
     * it is what a re-render that unmounts the focused row produces, and also
     * an OS colour picker opening, and the window losing focus. Treating "focus
     * went nowhere" as "focus went outside" is how this becomes a popup that
     * closes while the user is still in it. A genuine click on non-focusable
     * chrome also lands here, and is `useOutsideClick`'s job rather than this
     * one's.
     */
    const isInside = (node: Node | null) =>
      isWithinPopup(node, containerRef, withinRefsRef.current);
    /**
     * You cannot leave somewhere you were never in.
     *
     * `isInside` counts the trigger as part of the widget, which is right for
     * deciding that pressing the trigger again should not first dismiss the
     * menu — but it also meant a popup opened by *pointer*, with focus still
     * sitting on its trigger, was dismissed by the very first forward move the
     * user made. For the sheet-tab menu that was fatal: it renders after the
     * whole tab strip in DOM order, so moving forward from the trigger lands on
     * the tab scroll buttons rather than on the menu, and a VoiceOver user
     * could never reach Rename at all.
     *
     * Arming only once focus has genuinely been inside the container keeps the
     * behaviour this exists for — Tab out of a menu you are in closes it — and
     * drops the case where "out" was never "in".
     */
    const handleFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget as Node | null;
      if (next == null) return;
      if (!isInside(e.target as Node)) return;
      if (isInside(next)) return;
      if (!focusHasBeenInside) return;
      onCloseRef.current();
    };
    if (closeOnFocusOut) {
      document.addEventListener("focusout", handleFocusOut);
    }

    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("focusout", handleFocusOut);
      const index = openInstanceStack.indexOf(instanceId);
      if (index !== -1) openInstanceStack.splice(index, 1);
      // Only rescue focus if the user hasn't already deliberately moved it
      // elsewhere (e.g. clicking a grid cell, which closes the popup via
      // useOutsideClick). Restoring unconditionally would drag focus back
      // to the trigger even after such a deliberate click.
      if (
        restoreFocus &&
        focusInsideContainer &&
        previousActiveElement?.isConnected
      ) {
        previousActiveElement.focus();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, closeOnFocusOut]);
}
