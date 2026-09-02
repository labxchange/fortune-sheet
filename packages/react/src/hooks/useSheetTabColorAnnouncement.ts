import { useEffect, useRef, useState } from "react";
import { Context, locale, replaceHtml } from "@fortune-sheet/core";
import { markAsRepeat } from "../utils/liveRegion";

type LocaleInfo = ReturnType<typeof locale>["info"];

/**
 * Announce a sheet tab's colour after it's applied or reset from the options
 * menu. The swatch/confirm/reset controls only ever repaint the tab's colour
 * bar — a purely visual change a screen-reader user has no other way to
 * learn about (WCAG 4.1.3).
 *
 * Driven by `sheetTabColorChangeCount`, bumped in `ChangeColor` at the one
 * place that writes `sheet.color`. That effect runs on mount too (re-writing
 * the sheet's existing colour), so the counter — not `sheet.color` itself —
 * is what tells a real change from the mount no-op.
 */
export function useSheetTabColorAnnouncement(
  context: Context,
  info: LocaleInfo
): string {
  const [announcement, setAnnouncement] = useState("");
  const previousCount = useRef<number | undefined>(undefined);
  const announceCount = useRef(0);

  const colorChangeCount = context.sheetTabColorChangeCount ?? 0;
  const { currentSheetId, luckysheetfile } = context;

  useEffect(() => {
    const previous = previousCount.current;
    previousCount.current = colorChangeCount;

    if (previous === undefined || colorChangeCount === previous) return;

    const sheet = luckysheetfile.find((s) => s.id === currentSheetId);
    if (!sheet) return;
    const name = sheet.name ?? "";

    const colorNames = info.colorNames as Record<string, string> | undefined;
    const text = sheet.color
      ? replaceHtml(info.sheetColorChangedAnnouncement, {
          name,
          color: colorNames?.[sheet.color] ?? sheet.color,
        })
      : replaceHtml(info.sheetColorResetAnnouncement, { name });

    announceCount.current += 1;
    setAnnouncement(
      announceCount.current % 2 === 0 ? markAsRepeat(text) : text
    );
  }, [
    colorChangeCount,
    currentSheetId,
    luckysheetfile,
    info.sheetColorChangedAnnouncement,
    info.sheetColorResetAnnouncement,
    info.colorNames,
  ]);

  return announcement;
}
