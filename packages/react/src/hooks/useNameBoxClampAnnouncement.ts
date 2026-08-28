import { useEffect, useRef, useState } from "react";
import { Context, locale } from "@fortune-sheet/core";

type LocaleInfo = ReturnType<typeof locale>["info"];

/**
 * Report that the name box landed somewhere other than the reference typed.
 *
 * Appended to the grid's own cell announcement rather than written to a region
 * of its own. A clamp changes the selection, and `#sr-selection` is an alert
 * that carries the new cell in the very same commit — a second, polite region
 * firing alongside it loses the race, and the user hears the cell they did not
 * ask for with no hint that it is not where they went. One announcement saying
 * "A10. Reference is outside the sheet." is both truthful and unmissable.
 *
 * Same shape as `filterCellAnnouncement`, which is appended to that region for
 * the same reason.
 */
export function useNameBoxClampAnnouncement(
  context: Context,
  info: LocaleInfo
): string {
  const [notice, setNotice] = useState("");
  const previousCount = useRef<number | undefined>(undefined);

  const clampCount = context.nameBoxClampCount ?? 0;
  const selection = context.luckysheet_select_save;

  useEffect(() => {
    const previous = previousCount.current;
    previousCount.current = clampCount;
    if (previous === undefined) return;
    // Set when the name box clamped, cleared by the next selection change —
    // so the notice rides exactly one cell announcement and is not still
    // attached the next time the user arrows somewhere.
    setNotice(
      clampCount !== previous ? ` ${info.nameBoxReferenceClamped}` : ""
    );
  }, [clampCount, selection, info.nameBoxReferenceClamped]);

  return notice;
}
