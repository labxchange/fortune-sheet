import { useEffect, useRef, useState } from "react";
import { Context, locale, replaceHtml } from "@fortune-sheet/core";
import { markAsRepeat } from "../utils/liveRegion";

type LocaleInfo = ReturnType<typeof locale>["info"];

/**
 * Announce which sheet is active after it changes, and whether that happened
 * because a sheet was added.
 *
 * `currentSheetId` changing is otherwise silent for a screen-reader user
 * whenever the switch doesn't also move DOM focus onto the new tab — the
 * all-sheets dropdown switches sheets from a list item that stays put, and
 * the Alt+Arrow shortcut switches sheets while focus stays in the grid. A
 * plain tab click does move focus, but tabindex="-1" elements don't reliably
 * take focus from a mouse click across browsers either, so this announces
 * every switch rather than trying to guess which routes already got there
 * for free (WCAG 4.1.3).
 *
 * Sheet ids are tracked (not just the array length) so the newly added sheet
 * can be named even when adding doesn't also select it — `copySheet` places
 * the copy without switching to it, so `currentSheetId` alone would miss it.
 * That same case is why the "added" text branches on whether the new sheet
 * is actually the current one: saying "added and selected" for a copy that
 * left the original sheet active would tell a screen-reader user they're on
 * the copy when they're not.
 */
export function useSheetSwitchAnnouncement(
  context: Context,
  info: LocaleInfo
): string {
  const [announcement, setAnnouncement] = useState("");
  const previousIds = useRef<Set<string> | undefined>(undefined);
  const previousSheetId = useRef<string | undefined>(undefined);
  const announceCount = useRef(0);

  const { luckysheetfile, currentSheetId } = context;

  useEffect(() => {
    const currentIds = new Set(
      luckysheetfile.map((sheet) => sheet.id as string)
    );
    const prevIds = previousIds.current;
    const prevSheetId = previousSheetId.current;
    previousIds.current = currentIds;
    previousSheetId.current = currentSheetId;

    // Silent on the first observation, so a workbook that mounts with sheets
    // already present doesn't announce on paint.
    if (prevIds === undefined) return;

    const addedId = luckysheetfile.find(
      (sheet) => sheet.id != null && !prevIds.has(sheet.id)
    )?.id;

    let text: string | undefined;
    if (addedId != null) {
      const addedSheet = luckysheetfile.find((sheet) => sheet.id === addedId);
      if (addedSheet) {
        const template =
          addedId === currentSheetId
            ? info.sheetAddedAnnouncement
            : info.sheetAddedNotSelectedAnnouncement;
        text = replaceHtml(template, { name: addedSheet.name ?? "" });
      }
    } else if (currentSheetId !== prevSheetId) {
      const activeSheet = luckysheetfile.find(
        (sheet) => sheet.id === currentSheetId
      );
      if (activeSheet) {
        text = replaceHtml(info.sheetSelectedAnnouncement, {
          name: activeSheet.name ?? "",
        });
      }
    }

    if (text === undefined) return;
    announceCount.current += 1;
    setAnnouncement(
      announceCount.current % 2 === 0 ? markAsRepeat(text) : text
    );
  }, [
    luckysheetfile,
    currentSheetId,
    info.sheetAddedAnnouncement,
    info.sheetAddedNotSelectedAnnouncement,
    info.sheetSelectedAnnouncement,
  ]);

  return announcement;
}
