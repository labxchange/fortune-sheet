import React from "react";

/**
 * Whether the node is (or sits inside) the control that opens this popup.
 *
 * A popup and the button that discloses it are one widget, so focus reaching
 * the trigger has not left the popup. Getting this wrong is not cosmetic: the
 * trigger becomes unable to close its own menu from the keyboard, because
 * arriving on it dismisses the menu and the press that follows reopens it.
 *
 * Matched through `aria-controls`/`aria-owns` rather than a `triggerRef`
 * because these triggers live in a *different component* from the popup they
 * open — the sheet-tab caret, the filter funnel, the all-sheets button, the
 * zoom readout and the toolbar's More button all sit outside the menus they
 * own, with no shared ref to pass. Declaring the relationship for screen
 * readers is what makes the dismissal logic able to agree with it.
 *
 * Which means the match is only as good as the wiring, and the wiring is not
 * optional: `popupId` is `containerRef.current?.id`, so a popup whose
 * container has no id — or a trigger with no `aria-controls` — can never be
 * recognised, and with `closeOnFocusOut` on it gets exactly the loop described
 * above. Three of the eight opt-ins were in that state: the sheet list, the
 * zoom menu and the toolbar's More container. All three now carry a module id
 * constant on the container plus `aria-controls` on the trigger, matching what
 * the sheet-tab menu and the filter menu already did. Anything opting in later
 * needs both, and `popupFocusOutDismissal.test.tsx` asserts it for each.
 */
function controlsPopup(node: Node, popupId?: string): boolean {
  if (!popupId) return false;
  const el =
    node.nodeType === 1 ? (node as Element) : (node as Node).parentElement;
  // Quoted, not escaped: these ids include React `useId` values like ":r4v:",
  // which are invalid bare in a selector but fine as a quoted attribute value.
  const value = JSON.stringify(popupId);
  return !!el?.closest(`[aria-controls~=${value}], [aria-owns~=${value}]`);
}

/**
 * The popup's own content — its container and any satellite submenus, but *not*
 * the trigger that discloses it.
 *
 * Separate from `isWithinPopup` because the trigger is "part of the widget" for
 * deciding whether a press or a focus move counts as leaving, and *not* part of
 * it for deciding whether focus was ever inside. Conflating the two dismissed a
 * pointer-opened menu on the user's first forward move, while focus still sat
 * on the trigger.
 */
export function isWithinPopupContent(
  node: Node | null | undefined,
  containerRef: React.RefObject<HTMLElement | null>,
  withinRefs?: React.RefObject<HTMLElement | null>[]
): boolean {
  if (!node) return false;
  if (containerRef.current?.contains(node)) return true;
  return !!withinRefs?.some((ref) => ref.current?.contains(node));
}

/**
 * Whether a node belongs to a popup — counting the satellites that are not DOM
 * descendants of it.
 *
 * Two popups here render a submenu as a *sibling* of the menu container rather
 * than a child (`FilterMenu`'s Filter-by-color group), while others nest it
 * normally (`SheetTab`'s Change-color menu). A plain `container.contains(node)`
 * is therefore wrong for half of them, in the same way for both dismissal
 * routes: by pointer it makes a press on a colour row read as a click outside
 * and unmounts the whole popup, and by keyboard it makes focus entering the
 * submenu read as focus leaving.
 *
 * Both routes ask the same question, so they ask it here. Refs are read at call
 * time, never captured, because a conditionally-rendered submenu's ref is still
 * null while the popup is open and the submenu is not.
 */
export function isWithinPopup(
  node: Node | null | undefined,
  containerRef: React.RefObject<HTMLElement | null>,
  withinRefs?: React.RefObject<HTMLElement | null>[]
): boolean {
  if (isWithinPopupContent(node, containerRef, withinRefs)) return true;
  if (!node) return false;
  return controlsPopup(node, containerRef.current?.id);
}

export default isWithinPopup;
