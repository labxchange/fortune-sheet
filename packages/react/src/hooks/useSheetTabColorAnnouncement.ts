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
 * Driven by `sheetTabColorChangeCount`, bumped in `ChangeColor`'s `applyColor`
 * — the one place that writes `sheet.color`, and reached only from a swatch,
 * the reset row or Confirm. The counter rather than `sheet.color` itself
 * because a colour re-applied is still an action the user took and is owed an
 * answer, and two identical writes are indistinguishable by value.
 *
 * `applyColor` is imperative, so there is no mount run to discount: it was an
 * effect on `selectColor`, and Confirm closes the submenu in the same commit
 * that sets it, so the effect never ran and Confirm applied nothing at all.
 * A previous-value ref used to separate that mount no-op from a real pick;
 * with the write moved to the request there is no no-op left to separate.
 *
 * A consequence worth stating: re-picking the colour a tab already carries
 * *does* announce, through `markAsRepeat`, exactly as `useSelectAllAnnouncement`
 * speaks a repeat activation. The user pressed a swatch; the alternative is a
 * press that answers with nothing. Only a write that never happens is silent —
 * `applyColor` bails before the bump when `allowEdit === false`.
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
