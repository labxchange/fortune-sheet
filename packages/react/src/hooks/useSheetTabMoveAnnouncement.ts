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
