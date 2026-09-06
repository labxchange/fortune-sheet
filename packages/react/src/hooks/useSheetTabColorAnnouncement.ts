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
 *
 * Two deliberate silences, both a consequence of driving this from the write:
 *
 * Re-picking the colour a tab already has says nothing, and neither does
 * resetting a tab that has no colour. React bails out of the identical
 * `selectColor` state write, so `ChangeColor`'s effect never runs and the
 * counter never moves. That differs from `useSelectAllAnnouncement`, which
 * speaks a repeat activation through `markAsRepeat` even though the resulting
 * state is identical — but select-all is an action the user invoked and got
 * no other feedback for, whereas a swatch that is already applied has the
 * visible checkmark next to it, and the alternative here is a counter bumped
 * on every submenu open, which would announce colours nobody chose.
 *
 * A custom colour announces its hex ("#ff5733"), since `colorNames` only
 * covers the palette swatches. Read out digit by digit it is poor, but it
 * does identify the colour, and the user picked the value being read back.
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
