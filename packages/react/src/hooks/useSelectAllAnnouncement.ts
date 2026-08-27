import { useEffect, useRef, useState } from "react";
import { Context, locale } from "@fortune-sheet/core";
import { markAsRepeat } from "../utils/liveRegion";

/**
 * Announce that select-all took effect.
 *
 * The corner control has a role, a name and Enter/Space activation, but the
 * thing it does is entirely silent: the whole sheet becomes selected and
 * `#sr-selection` — built from the range in focus, whose focus cell stays at
 * A1 — says exactly what it said before. A sighted user sees the sheet turn
 * blue; a screen-reader user gets nothing (WCAG 4.1.3).
 *
 * Driven by `selectAll`'s own counter rather than by the corner's click
 * handler, or by the selection. A click callback fires before `setContext`
 * commits, so it would announce the intention rather than the outcome, and it
 * would miss Ctrl+A, which reaches `selectAll` through the keyboard handler and
 * is just as silent. The selection cannot serve either, from either direction:
 * its *value* is identical on a repeat activation, which the spec requires be
 * spoken twice; and its *identity* changes on updates that are nothing to do
 * with the user — `normalizeSelection` reassigns the `row`/`column` arrays on
 * every call, so a cell edit or a resize produced a spurious second
 * announcement. The counter moves once per actual activation and at no other
 * time.
 *
 * Polite, for the reason `#sr-filterRegion` gives: `#sr-selection` is an alert
 * and an assertive message here would cut the cell description off mid-word.
 */
export function useSelectAllAnnouncement(context: Context): string {
  const { info } = locale(context);
  const [announcement, setAnnouncement] = useState("");
  const announceCount = useRef(0);
  const previousCount = useRef<number | undefined>(undefined);

  const selectAllCount = context.selectAllCount ?? 0;

  useEffect(() => {
    const previous = previousCount.current;
    previousCount.current = selectAllCount;

    // Silent on the first observation, so a workbook restored mid-session with
    // a non-zero count does not announce on paint.
    if (previous === undefined || selectAllCount === previous) return;

    announceCount.current += 1;
    setAnnouncement(
      announceCount.current % 2 === 0
        ? markAsRepeat(info.allCellsSelected)
        : info.allCellsSelected
    );
  }, [selectAllCount, info.allCellsSelected]);

  return announcement;
}
