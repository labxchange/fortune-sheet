import { useEffect, useRef, useState } from "react";

import { markAsRepeat } from "../utils/liveRegion";

/**
 * Announce the cell a toolbar command returned focus to.
 *
 * `withFocusReturn` moves focus back to the cell a toolbar command changed
 * (WCAG 2.4.3), but the move itself is silent to a screen reader: `#sr-
 * selection` is built from the *selection*, which a formatting command does
 * not touch — it edits the cell in place, it does not navigate — so the same
 * text simply repeats and nothing re-announces. A sighted user sees focus
 * land back on the cell; a screen-reader user hears "Bold button" and then
 * silence, discovering where they are only on the next arrow key.
 *
 * Driven by `toolbarFocusReturnCount`, which `withFocusReturn` bumps exactly
 * when it decides to return focus — not by the cell text itself, which can
 * legitimately repeat (the same cell, formatted the same way, twice running)
 * and would then leave the DOM node's text unchanged between announcements.
 * Alternating a trailing zero-width space every other bump (`markAsRepeat`)
 * guarantees the two are always distinguishable regardless, the same
 * technique `useSelectAllAnnouncement` uses for the identical problem.
 *
 * `cellText` is passed in rather than computed here: `SheetOverlay` already
 * builds the same `rangeText` + value string for `#sr-selection`, and this
 * region is meant to say the same thing that region would have, had it fired.
 */
/**
 * The sentence `#sr-toolbarFocusReturn` speaks: where focus landed, then how to
 * move from there.
 *
 * The gesture hint is repeated on **every** toolbar return, not just on the
 * first arrival the way `#sr-selection`'s own `sheetSrIntro` is. `hasMovedRef`
 * in `SheetOverlay` latches for the whole workbook, so a user who tabs to the
 * toolbar and comes back had heard the hint once, at load, and never again —
 * which is precisely the moment they need it, because focus has just been
 * somewhere else.
 *
 * **This cannot double-announce with `#sr-selection`, and the reason is a
 * gate, not luck.** `withFocusReturn` only calls `onReturn` — the bump this
 * region watches — when `readAnnounceStamp` reads the same before and after,
 * i.e. only when the command touched neither the selection nor the displayed
 * value. That is exactly the case where `#sr-selection`'s text is unchanged
 * and a live region, which announces on mutation, stays silent. A command that
 * *did* change either one re-announces through `#sr-selection` and never
 * reaches here.
 *
 * `cellValue` is empty for an empty cell, so it is joined conditionally rather
 * than interpolated — `"B. 5 . Use the arrow keys…"` puts a bare full stop
 * after a space, which some readers voice as punctuation.
 */
export function buildFocusReturnText(
  rangeText: string,
  cellValue: string,
  intro: string
): string {
  const cell = cellValue ? `${rangeText} ${cellValue}` : rangeText;
  // A cell whose displayed value already ends in a full stop ("etc.") would
  // otherwise read as "etc.. Use the arrow keys".
  const separator = cell.endsWith(".") ? " " : ". ";
  return `${cell}${separator}${intro}`;
}

export function useToolbarFocusReturnAnnouncement(
  toolbarFocusReturnCount: number | undefined,
  cellText: string
): string {
  const [announcement, setAnnouncement] = useState("");
  const announceCount = useRef(0);
  const previousCount = useRef<number | undefined>(undefined);

  const returnCount = toolbarFocusReturnCount ?? 0;

  useEffect(() => {
    const previous = previousCount.current;
    previousCount.current = returnCount;

    // Silent on the first observation, so a workbook restored mid-session
    // with a non-zero count does not announce on paint.
    if (previous === undefined || returnCount === previous) return;

    announceCount.current += 1;
    setAnnouncement(
      announceCount.current % 2 === 0 ? markAsRepeat(cellText) : cellText
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnCount]);

  return announcement;
}
