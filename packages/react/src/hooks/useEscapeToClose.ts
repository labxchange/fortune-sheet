import React, { useEffect, useRef } from "react";
import { isWithinPopup, isWithinPopupContent } from "../utils/containment";
import { focusAfterCommit } from "../utils/keyboardActivation";

const DEFAULT_FOCUSABLE_SELECTOR =
  '[role="button"]:not([aria-disabled="true"]), [tabindex="0"]:not([aria-disabled="true"])';

// Anything a mousedown can legitimately move focus to inside a popup: native
// focusables, plus the ARIA widgets this package builds out of divs
// (role="button" menu rows, role="checkbox" colour swatches). `[tabindex="-1"]`
// is excluded on purpose — it is click-focusable but, where it matters, it is
// *inside* the popup (the one-colour tip), so it never triggers the escape the
// focus-out guard protects against; treating it as a real control would wrongly
// leave the default alone on an embedder's own `tabIndex={-1}` wrapper.
//
// A `disabled` native control is the one hole this cannot close: Chrome fires no
// `mousedown` on it at all, so the press never reaches the guard and focus still
// escapes to the wrapper. Use `aria-disabled` inside a `closeOnFocusOut` popup.
const CLICK_FOCUSABLE_SELECTOR =
  'input, button, select, textarea, a[href], [contenteditable="true"], [role="button"], [role="checkbox"], [tabindex]:not([tabindex="-1"])';

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
   * Where focus belongs after a `closeOnFocusOut` dismissal — overriding the
   * destination the user's Tab was heading for.
   *
   * **Omit it and the Tab stands**, which is right for a popup that lives in
   * the tab sequence: you arrived by tabbing, so tabbing onward is the sequence
   * working. The two popups that set it are anchored to a grid cell instead —
   * opened by right-click or from a column-header funnel, by a gesture the tab
   * order knows nothing about — so the element "after" them is an accident of
   * DOM order (the next funnel, the sheet-tab strip, the zoom control, the
   * embedding page) and leaving the user there strands them outside the grid
   * with no way back but traversing the whole chrome. WCAG 2.4.3.
   *
   * Resolved twice, and deferred, for the same reasons `focusAfterCommit`
   * exists: the close this hook has just triggered rebuilds the grid, so an
   * element captured now can be detached by the time focus is placed.
   *
   * Skipped entirely when focus has *already* reached the returned element (or
   * inside it), which is not just an optimisation — it is what keeps this from
   * fighting the app's own deliberate handoffs. `ContextMenu`'s Sort, Insert
   * image and Link rows call `focusGridBeforeHandoff` to put focus on the cell
   * synchronously *before* opening a dialog, and that focus move is itself the
   * focusout that lands here. Re-aiming at the cell a task later would pull
   * focus straight back out of the dialog that had just claimed it.
   */
  focusOutTarget?: () => HTMLElement | null | undefined;
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
 * the popup survives focus leaving it, by either a Tab out (focus-out) or a
 * pointer press on its own non-focusable chrome (the mousedown guard). Those
 * belong together because they are one question, "is focus still in this popup",
 * asked at five moments; the nested-popup rule in particular has to be answered
 * identically by Escape and by focus-out, and `openInstanceStack` above already
 * exists to answer it once.
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
  focusOutTarget,
  withinRefs,
}: UseEscapeToCloseOptions): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const focusOutTargetRef = useRef(focusOutTarget);
  focusOutTargetRef.current = focusOutTarget;
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
      // Recorded before closing, so the cleanup's restore cannot depend on
      // whether `focusin` for the new target has been dispatched yet. It
      // normally has — Chrome fires `focusout` and `focusin` in the same task
      // and only reaches a microtask checkpoint after both, so React's batched
      // close (and this effect's cleanup) always run with
      // `focusInsideContainer` already false. Verified in Chrome rather than
      // assumed; saying so here makes the outcome independent of that ordering.
      //
      // What it suppresses is the cleanup's restore, which aims at whatever was
      // focused before opening — the trigger. That destination is wrong on this
      // route whichever way the caller wants it: either the user's Tab should
      // stand, or `focusOutTarget` names somewhere else. Never the trigger.
      focusInsideContainer = false;
      onCloseRef.current();

      const target = focusOutTargetRef.current?.();
      // Already there (or inside it): the app moved focus itself, and this is
      // the focusout it produced. See `focusOutTarget`'s docs.
      if (!target || target === next || target.contains(next)) return;
      focusAfterCommit(() => focusOutTargetRef.current?.());
    };
    /**
     * Keep focus inside on a pointer press, the other half of `closeOnFocusOut`.
     *
     * Same root cause as `menuButtonToggleHandlers`' `onMouseDown`, one layer in.
     * A press on the popup's own non-focusable chrome — a filter value's text,
     * the count beside it, a divider, the padding between rows — has no focusable
     * target, so the browser's mousedown default walks up to the nearest
     * focusable ancestor. In this package's own Storybook that is nothing, focus
     * goes nowhere, and `handleFocusOut` returns early on the null
     * `relatedTarget`; inside an embedder that wraps the workbook in a
     * `tabIndex={-1}` container (LabXchange's spreadsheet sim) it is that wrapper,
     * *outside* the popup, and `closeOnFocusOut` dismisses the popup out from
     * under the press. So it reproduced only in the embedder, and only by pointer.
     *
     * Cancelling the default drops that focus move, so focus stays on whatever
     * inside the popup already held it (`autoFocus` put it on the first control).
     * A press whose nearest focusable ancestor is itself inside the popup — a
     * checkbox, the search box, a button, a colour row — keeps its default, so it
     * focuses and a caret lands as usual. `click` still fires either way.
     *
     * Bound here rather than per container because the hazard belongs to
     * `closeOnFocusOut`, not to any one popup: every opt-in with the same chrome,
     * in the same wrapper, needs it. `isWithinPopupContent` (not `isWithinPopup`)
     * so the trigger's own press keeps its default, and so a sibling submenu
     * named in `withinRefs` is covered by the same listener.
     */
    const keepFocusInside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!isWithinPopupContent(target, containerRef, withinRefsRef.current)) {
        return;
      }
      const focusable =
        target.nodeType === 1
          ? (target as Element).closest<HTMLElement>(CLICK_FOCUSABLE_SELECTOR)
          : null;
      if (
        !focusable ||
        !isWithinPopupContent(focusable, containerRef, withinRefsRef.current)
      ) {
        e.preventDefault();
      }
    };
    if (closeOnFocusOut) {
      document.addEventListener("focusout", handleFocusOut);
      // Capture: run before any element's own mousedown (DropdownList stops its
      // propagation), and before the browser applies the default focus move.
      document.addEventListener("mousedown", keepFocusInside, true);
    }

    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("focusout", handleFocusOut);
      document.removeEventListener("mousedown", keepFocusInside, true);
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
