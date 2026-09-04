import React from "react";

export function isActivationKey(key: string): boolean {
  // "Spacebar" is the legacy name older engines report for the space key; the
  // select-all corner handled it in its own inline handler, so it lives here
  // now rather than being lost when that moved to the shared helper.
  return key === "Enter" || key === " " || key === "Spacebar";
}

/**
 * Whether this keydown should activate the control the handler is attached to.
 *
 * The `e.target !== e.currentTarget` half is the part that is easy to miss:
 * without it, a keypress on anything *inside* the control bubbles up and
 * re-triggers the control — so Enter in a nested text input both types and
 * activates the parent button. Several call sites hand-rolled this guard;
 * keeping it here means the ~40 that use the helpers directly get it too,
 * rather than being safe only where their subtree happens to be inert or to
 * stopPropagation on its own.
 *
 * Note: per the ARIA authoring practices a role="button" should activate on
 * Enter keydown but on Space *keyup*, so that holding Space and moving off
 * does not fire. Firing both on keydown is a deliberate simplification here,
 * with the `e.repeat` guards below covering the worst of it — don't "fix" it
 * without checking every call site.
 */
function shouldActivate<T extends HTMLElement>(
  e: React.KeyboardEvent<T>
): boolean {
  if (!isActivationKey(e.key)) return false;
  return e.target === e.currentTarget;
}

/** Forwards Enter/Space to a native click, reusing whatever onClick is
 * already attached to the element instead of duplicating its logic.
 * Stops propagation so activating a control doesn't also trigger unrelated
 * global keyboard shortcuts (e.g. the grid's own Enter/Space handling). */
export function activateOnEnterOrSpace<T extends HTMLElement = HTMLElement>(
  e: React.KeyboardEvent<T>
): void {
  if (!shouldActivate(e)) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.repeat) return;
  e.currentTarget.click();
}

/**
 * As activateOnEnterOrSpace, but runs `action` instead of forwarding to a
 * native click — for controls whose activation is not a click (opening a
 * submenu, toggling a popup). Replaces the guard/key-check/preventDefault
 * preamble that several submenu triggers each hand-rolled.
 */
export function onActivate<T extends HTMLElement = HTMLElement>(
  action: (e: React.KeyboardEvent<T>) => void
): (e: React.KeyboardEvent<T>) => void {
  return (e) => {
    if (!shouldActivate(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return;
    action(e);
  };
}

/** As activateOnEnterOrSpace, but for a control that can be aria-disabled.
 * A disabled control still *consumes* Enter/Space rather than ignoring them:
 * the grid's own keyboard handler is bound on .fortune-container, which wraps
 * the toolbar, so an unstopped Enter would bubble into handleGlobalEnter and
 * move the selection — making a disabled button do more than an enabled one. */
export function onActivationKeyDown<T extends HTMLElement = HTMLElement>(
  disabled?: boolean
): (e: React.KeyboardEvent<T>) => void {
  return (e) => {
    if (!shouldActivate(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (disabled || e.repeat) return;
    e.currentTarget.click();
  };
}

/**
 * Focus a target chosen by the caller, once the commit that the current
 * interaction triggers has settled.
 *
 * For an action that both closes a popup and rearranges the grid, focus cannot
 * be set inline. Two other things run after the handler and would win:
 * useEscapeToClose's cleanup restores focus to whatever was focused before the
 * popup opened, and effects such as FilterOption's schedule a further commit
 * that can rebuild the very element being aimed at. Deferring by a task puts
 * this last — the same tactic SheetOverlay's mousedown handler already uses to
 * focus the cell input after its own setContext.
 *
 * `getTarget` is called inside the timeout, never before, so it resolves
 * against the settled DOM; that is also where a caller puts its fallback
 * (`funnel ?? cellInput`), since which elements still exist is only knowable
 * then. A target that is gone is left alone rather than focused, because
 * focusing a detached node silently moves focus to <body> — the failure this
 * helper exists to prevent.
 *
 * `preventScroll` because every caller here aims at something already on
 * screen: nine restore focus to where the user was, and the tenth
 * (`SheetItem`'s rename field) puts it on a control inside the tab they just
 * acted on. Nothing should move. Without it the browser scrolls the nearest
 * scrollable ancestor to reveal the target — and the target is usually the
 * cell input, which `InputBox` parks at `left: -10000` whenever there is no
 * selection for it to sit on. An embedder that puts the grid in a scroll pane
 * (LabXchange's sims lay their pages out in one) then has its own layout
 * dragged sideways by a focus call, which is not this helper's business to do.
 *
 * The constraint that buys, stated for whoever calls this next: the target has
 * to be visible already. Sending focus somewhere the user would need to be
 * scrolled to see leaves it focused off-screen with nothing to indicate it
 * (WCAG 2.4.7) — such a caller wants a plain `focus()`, or an opt-out added
 * here.
 */
export function focusAfterCommit(
  getTarget: () => HTMLElement | null | undefined
): void {
  setTimeout(() => {
    const target = getTarget();
    if (target?.isConnected) target.focus({ preventScroll: true });
  });
}

/**
 * For a trigger that toggles a popup closed by useOutsideClick (which
 * listens on mousedown): runs the toggle on mousedown, with
 * stopPropagation, so a press on this same trigger never reaches
 * useOutsideClick's listener — there is no "outside click closes it,
 * then click reopens it" race, because there's no second update at all.
 * click becomes a no-op (stopPropagation only); Enter/Space runs the
 * toggle directly rather than forwarding to .click(), since click no
 * longer does the toggling.
 *
 * Takes `disabled` so an aria-disabled trigger can use this rather than
 * hand-rolling the keydown preamble and losing shouldActivate's
 * target === currentTarget guard.
 */
export function mouseDownToggleHandlers<T extends HTMLElement = HTMLElement>(
  onToggle: () => void,
  disabled?: boolean
): {
  onMouseDown: (e: React.MouseEvent<T>) => void;
  onClick: (e: React.MouseEvent<T>) => void;
  onKeyDown: (e: React.KeyboardEvent<T>) => void;
} {
  return {
    // Bails before stopPropagation, not after: a disabled trigger must stay
    // out of the way entirely, including letting the mousedown through to
    // whatever outside-click listener is waiting to close another popup.
    onMouseDown: (e) => {
      if (disabled) return;
      e.stopPropagation();
      onToggle();
    },
    onClick: (e) => e.stopPropagation(),
    // Unlike mousedown, the key is consumed even when disabled — see
    // onActivationKeyDown above: an unstopped Enter reaches
    // handleGlobalEnter and moves the selection, so a disabled button
    // would do more than an enabled one.
    onKeyDown: onActivate<T>(() => {
      if (!disabled) onToggle();
    }),
  };
}

/**
 * Hand keyboard focus back to the cell after an edit ends in the formula bar.
 *
 * The target is the cell input, not the grid root. The sheet is painted on a
 * canvas, so no cell is focusable in its own right — but the cell input is
 * positioned over the focused cell by `InputBox` and carries that cell's
 * accessible name, so it is the closest thing the DOM has to "the cell". The
 * grid root would be a landmark-level target and announce as the whole sheet.
 *
 * It is also where `handleGlobalKeyDown` parks focus at the end of every
 * keystroke (`core/events/keyboard.ts`), so aiming here works with the grid's
 * existing focus model rather than being undone by it a keypress later.
 *
 * Deferred because the commit re-renders and `InputBox` schedules its own
 * caret fixup in a timeout; `focusAfterCommit` also declines a detached target.
 */
export function returnFocusToCell(
  cellInput: HTMLElement | null | undefined
): void {
  focusAfterCommit(() => cellInput);
}
