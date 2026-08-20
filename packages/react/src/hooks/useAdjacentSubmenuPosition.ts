import React, { useEffect } from "react";

export type UseAdjacentSubmenuPositionOptions = {
  open: boolean;
  /** The row that opens the submenu. */
  triggerRef: React.RefObject<HTMLElement | null>;
  /** The submenu being positioned; must already be position: absolute. */
  menuRef: React.RefObject<HTMLElement | null>;
  /** Available viewport, used to decide whether to flip left/up. */
  boundaryRef: React.RefObject<HTMLElement | null>;
};

/**
 * Positions a submenu flush against its trigger row — to the right of it,
 * flipping to the left if there's no room, and top-aligned with it,
 * flipping to open upward if there's no room below.
 *
 * The submenu is rendered as a DOM sibling of the trigger, not a
 * descendant (so screen readers can reach it — role="button" on the
 * trigger would otherwise flatten a nested submenu out of the
 * accessibility tree). That means its CSS containing block is whatever
 * positioned ancestor it happens to land under structurally, which is
 * rarely the trigger itself. A fixed CSS offset (e.g. `top: -8px`) only
 * looks right by coincidence — it silently breaks for any row that isn't
 * positioned the same as whichever row it was tuned against. Measuring
 * both the trigger and the submenu's own offsetParent directly avoids
 * that.
 */
export function useAdjacentSubmenuPosition({
  open,
  triggerRef,
  menuRef,
  boundaryRef,
}: UseAdjacentSubmenuPositionOptions): void {
  useEffect(() => {
    const triggerEl = triggerRef.current;
    const menuEl = menuRef.current;
    const boundaryEl = boundaryRef.current;
    if (!open || !triggerEl || !menuEl || !boundaryEl) return;

    const triggerRect = triggerEl.getBoundingClientRect();
    const boundaryRect = boundaryEl.getBoundingClientRect();
    // Read before top/left are (re)applied below — a position: absolute
    // box's size depends on its content and explicit width, not on where
    // it's currently placed, so this reflects the real rendered size.
    const menuRect = menuEl.getBoundingClientRect();
    const offsetParentRect = (
      menuEl.offsetParent ?? document.body
    ).getBoundingClientRect();

    const fitsBelow = boundaryRect.bottom - triggerRect.top >= menuRect.height;
    menuEl.style.top = fitsBelow
      ? `${triggerRect.top - offsetParentRect.top}px`
      : `${triggerRect.bottom - offsetParentRect.top - menuRect.height}px`;

    const fitsRight = boundaryRect.right - triggerRect.right >= menuRect.width;
    menuEl.style.left = fitsRight
      ? `${triggerRect.right - offsetParentRect.left}px`
      : `${triggerRect.left - offsetParentRect.left - menuRect.width}px`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
