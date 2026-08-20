import React from "react";

export function isActivationKey(key: string): boolean {
  return key === "Enter" || key === " ";
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
 * For a trigger that toggles a popup closed by useOutsideClick (which
 * listens on mousedown): runs the toggle on mousedown, with
 * stopPropagation, so a press on this same trigger never reaches
 * useOutsideClick's listener — there is no "outside click closes it,
 * then click reopens it" race, because there's no second update at all.
 * click becomes a no-op (stopPropagation only); Enter/Space runs the
 * toggle directly rather than forwarding to .click(), since click no
 * longer does the toggling.
 */
export function mouseDownToggleHandlers<T extends HTMLElement = HTMLElement>(
  onToggle: () => void
): {
  onMouseDown: (e: React.MouseEvent<T>) => void;
  onClick: (e: React.MouseEvent<T>) => void;
  onKeyDown: (e: React.KeyboardEvent<T>) => void;
} {
  return {
    onMouseDown: (e) => {
      e.stopPropagation();
      onToggle();
    },
    onClick: (e) => e.stopPropagation(),
    onKeyDown: onActivate<T>(onToggle),
  };
}
