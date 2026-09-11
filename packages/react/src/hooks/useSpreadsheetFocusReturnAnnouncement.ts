import { useEffect, useRef, useState } from "react";

import { markAsRepeat } from "../utils/liveRegion";

/**
 * Announce where focus has arrived when it returns to the grid.
 *
 * A jump back to the grid (WCAG 2.4.1) moves focus without moving the
 * selection, and `#sr-selection` is built from the selection — so it renders
 * the same text it already held and never fires. A sighted learner sees the
 * grid take focus; a screen-reader user heard the region's landmark name and
 * nothing about which cell they had arrived at, discovering it only on the next
 * arrow key. This is the same defect `useToolbarFocusReturnAnnouncement`
 * exists for, one region over, and it is solved the same way.
 *
 * Driven by `spreadsheetFocusReturnCount`, which `focusSpreadsheet` bumps
 * exactly when it decides a return happened — not by the cell text, which can
 * legitimately repeat (leave and come back twice without moving) and would then
 * leave the DOM node's text unchanged between announcements. Alternating a
 * trailing zero-width space every other bump (`markAsRepeat`) guarantees the
 * two are always distinguishable regardless.
 *
 * `cellText` is passed in rather than computed here, for the same reason the
 * toolbar hook takes it: `SheetOverlay` already builds the `rangeText` + value
 * string for `#sr-selection`, and this region is meant to say exactly what that
 * region would have said, had arriving been something it fired on. Reusing that
 * string is also why this introduces no new translatable text — one location is
 * described one way however the learner reached it.
 */
export function useSpreadsheetFocusReturnAnnouncement(
  spreadsheetFocusReturnCount: number | undefined,
  cellText: string
): string {
  const [announcement, setAnnouncement] = useState("");
  const announceCount = useRef(0);
  const previousCount = useRef<number | undefined>(undefined);

  const returnCount = spreadsheetFocusReturnCount ?? 0;

  useEffect(() => {
    const previous = previousCount.current;
    previousCount.current = returnCount;

    // Silent on the first observation, so a workbook restored mid-session with
    // a non-zero count does not announce on paint.
    if (previous === undefined || returnCount === previous) return;

    announceCount.current += 1;
    setAnnouncement(
      announceCount.current % 2 === 0 ? markAsRepeat(cellText) : cellText
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnCount]);

  return announcement;
}
