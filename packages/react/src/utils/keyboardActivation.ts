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
 * Wrap a command so that focus returns to the cells it acted on.
 *
 * After an editing command run from the toolbar, focus belongs in the user's
 * working context rather than on the control that ran it (WCAG 2.4.3): select
 * B5, bold it, and the next arrow key should move from B5, not along the
 * toolbar. `getTarget` names where that is — the cell input, which is where a
 * mouse click already leaves focus and the only place the grid's own key
 * handling runs.
 *
 * A command that declined to act must not relocate anyone, which is what
 * `readStamp` is for: it samples some value that changes if and only if the
 * command wrote something, before and after. In the workbook that is
 * `luckysheetfile` — immer rebuilds the references along the path to whatever a
 * command wrote, up to and including that array, and preserves them for a
 * subtree nothing touched. So a command that changed no cell, format, merge or
 * freeze leaves it identical and focus stays where the user put it. This
 * generalises the rule `filterUnchanged` states for the two filter items.
 *
 * Both `readStamp` and `getTarget` are called late — after the commit — for the
 * reasons `focusAfterCommit` documents; a caller holding a React ref must read
 * through it rather than closing over a value from render.
 *
 * `onReturn`, if given, fires exactly once per actual return — the same branch
 * that resolves `getTarget()`, never the declined one. It exists so a caller
 * can announce the return to a screen reader for the common case: a
 * formatting command that touches neither the selection nor the cell's
 * displayed value, so `#sr-selection` stays silent (it only re-announces on
 * its own text changing) and would otherwise leave the return unannounced.
 *
 * `readAnnounceStamp`, if given, gates that call: `onReturn` only fires when
 * this reads the same before and after, same as `readStamp` gates the return
 * itself. Without it, a command that *did* move the selection or the cell
 * value (a merge, an undo that restores content) would fire `onReturn` too —
 * `#sr-selection` has already re-announced that on its own by then, so the
 * user hears the same cell spoken twice. Omit it for a caller with nothing
 * meaningful to compare; `onReturn` then fires on every actual return, as
 * before.
 */
export function withFocusReturn<A extends unknown[]>(
  run: (...args: A) => void,
  readStamp: () => unknown,
  getTarget: () => HTMLElement | null | undefined,
  onReturn?: () => void,
  readAnnounceStamp?: () => unknown
): (...args: A) => void {
  return (...args: A) => {
    const before = readStamp();
    const beforeAnnounce = readAnnounceStamp?.();
    run(...args);
    focusAfterCommit(() => {
      if (readStamp() === before) return null;
      if (!readAnnounceStamp || readAnnounceStamp() === beforeAnnounce) {
        onReturn?.();
      }
      return getTarget();
    });
  };
}

const stampIds = new WeakMap<object, number>();
let nextStampId = 1;

/**
 * Turn one `readStamp` sample into something joinable: primitives pass
 * through unchanged, and an object/array gets a stable id from a WeakMap
 * rather than being stringified (which would make two structurally-equal
 * but distinct writes compare equal, and a large `luckysheetfile` slow to
 * serialise on every command). Immer hands out a fresh top-level reference
 * for anything a producer actually wrote, so a changed id here means
 * exactly "this field changed" -- the same property `readStamp`'s own
 * single-field callers already rely on, just made composable.
 */
function stampId(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  let id = stampIds.get(value);
  if (id === undefined) {
    id = nextStampId;
    nextStampId += 1;
    stampIds.set(value, id);
  }
  return id;
}

/**
 * Combine several `readStamp`-shaped samples into one `===`-comparable
 * stamp, for a command whose write doesn't reach the single field a caller
 * is already tracking. Format Painter, for instance, arms itself by writing
 * `luckysheet_copy_save` and `luckysheetPaintModelOn` -- both top-level
 * siblings of `luckysheetfile` in the workbook context, so `luckysheetfile`
 * identity alone never sees it change. `combineStamps(a, b, c)` used as
 * `readStamp` catches a change to any one of them without weakening the
 * single-field check for every other command sharing the same wrapper: a
 * command that touches none of the combined fields still reads identical
 * before and after, exactly as a single-field stamp would.
 */
export function combineStamps(...parts: unknown[]): string {
  return parts.map(stampId).join("|");
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

/**
 * As mouseDownToggleHandlers, for a trigger that advertises a popup.
 *
 * A trigger carrying `aria-haspopup` promises the APG menu-button contract,
 * and Down Arrow opening the popup is part of that contract — it is the
 * gesture a screen reader trains its user to reach for, and the one a
 * keyboard user tries after Enter. Four triggers here made the promise and
 * implemented only Enter/Space, so the documented key did nothing at all.
 *
 * Claiming the key matters as much as acting on it. The grid's own
 * `handleGlobalKeyDown` is bound on `.fortune-container`, which wraps both
 * the toolbar and the sheet tabs, so an unclaimed arrow bubbles out of the
 * trigger and moves the grid selection instead: the user presses the
 * documented "open this menu" key and the sheet scrolls under them.
 *
 * `isOpen` rather than a bare toggle, because these keys only ever *open*.
 * Down Arrow on an already-open menu must not close it — by then focus is
 * inside the popup anyway, put there by `useEscapeToClose`'s `autoFocus`,
 * and this handler no longer sees the key.
 *
 * Deviation, stated rather than hidden: APG gives Up Arrow the same open with
 * focus on the *last* item. Every caller here opens through that same
 * `autoFocus`, which takes the first, so Up opens on the first item too. That
 * is a far smaller gap than the key doing nothing, and closing it properly
 * belongs with a wider fix to these popups' semantics — they are lists of
 * `role="button"` inside an unlabelled div, not `role="menu"` with
 * `menuitem`s, so the pattern is only half-adopted regardless.
 */
export function menuButtonToggleHandlers<T extends HTMLElement = HTMLElement>(
  onToggle: () => void,
  isOpen: boolean,
  disabled?: boolean
): {
  onMouseDown: (e: React.MouseEvent<T>) => void;
  onClick: (e: React.MouseEvent<T>) => void;
  onKeyDown: (e: React.KeyboardEvent<T>) => void;
} {
  const base = mouseDownToggleHandlers<T>(onToggle, disabled);
  return {
    ...base,
    onKeyDown: (e) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") {
        base.onKeyDown(e);
        return;
      }
      // The same guard shouldActivate applies: a key raised on something
      // inside the trigger belongs to that thing, not to the trigger.
      if (e.target !== e.currentTarget) return;
      e.preventDefault();
      e.stopPropagation();
      if (disabled || e.repeat || isOpen) return;
      onToggle();
    },
  };
}
