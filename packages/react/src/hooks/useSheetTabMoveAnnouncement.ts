import _ from "lodash";
import { useEffect, useRef, useState } from "react";
import { Context, locale, replaceHtml } from "@fortune-sheet/core";
import { markAsRepeat } from "../utils/liveRegion";

type LocaleInfo = ReturnType<typeof locale>["info"];

/**
 * Announce a sheet's new position after Move left/right in the sheet-tab
 * options menu. That reorders `luckysheetfile` and nothing else — no focus
 * change, no visible text change on the tab itself beyond where it sits in
 * the strip — so a screen-reader user got no confirmation the move (or which
 * direction, or where it landed) actually happened (WCAG 4.1.3).
 *
 * Driven by `sheetTabMoveCount` rather than by the sheet order itself: the
 * options menu only ever opens for the current sheet, so the counter just
 * needs to say "a move happened" and this hook re-reads the resulting
 * position off `currentSheetId`. Position is counted over visible sheets
 * only, matching the order the tab strip and Alt+Arrow shortcut use.
 *
 * The counter only bumps when that visible position really changed, so there
 * is nothing to re-check here: `moveSheet` compares the position either side
 * of the reorder, which is the only point both states exist. Recomputing it
 * from a previous value held in this hook would be strictly worse — the ref
 * would go stale on every sheet switch, hide/unhide and drag-reorder that
 * happens between two moves.
 *
 * Note the two sides count differently on purpose and can disagree:
 * `moveSheet` shifts order by ±1.5 over *all* sheets, so a hop whose
 * neighbour is hidden changes the stored order without moving the tab in the
 * strip. That is a no-op as far as this announcement is concerned and stays
 * silent — the underlying move-over-hidden-sheets behaviour is pre-existing
 * and unchanged.
 */
export function useSheetTabMoveAnnouncement(
  context: Context,
  info: LocaleInfo
): string {
  const [announcement, setAnnouncement] = useState("");
  const previousCount = useRef<number | undefined>(undefined);
  const announceCount = useRef(0);

  const moveCount = context.sheetTabMoveCount ?? 0;

  useEffect(() => {
    const previous = previousCount.current;
    previousCount.current = moveCount;

    if (previous === undefined || moveCount === previous) return;

    const visibleSheets = _.sortBy(
      context.luckysheetfile.filter((sheet) => sheet.hide !== 1),
      (sheet) => Number(sheet.order)
    );
    const position = visibleSheets.findIndex(
      (sheet) => sheet.id === context.currentSheetId
    );
    if (position === -1) return;

    const text = replaceHtml(info.sheetMovedAnnouncement, {
      name: visibleSheets[position].name ?? "",
      position: String(position + 1),
      total: String(visibleSheets.length),
    });

    announceCount.current += 1;
    setAnnouncement(
      announceCount.current % 2 === 0 ? markAsRepeat(text) : text
    );
  }, [
    moveCount,
    context.luckysheetfile,
    context.currentSheetId,
    info.sheetMovedAnnouncement,
  ]);

  return announcement;
}
