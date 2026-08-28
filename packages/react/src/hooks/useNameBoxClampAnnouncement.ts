import { useEffect, useRef, useState } from "react";
import { Context, locale } from "@fortune-sheet/core";
import { markAsRepeat } from "../utils/liveRegion";

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
 * Appended the way `filterCellAnnouncement` is — but the resemblance stops at
 * the mechanism, and reading it as a full analogy is what hid the repeat bug
 * below. That one is a *property of the focused cell*: it cannot change unless
 * `rangeText` changes with it, so it can never need a repeat marker. A clamp is
 * an *event*, and an event can fire again while the cell holds perfectly still
 * — `A99999` then `A50` on a ten-row sheet both land on A10 and compose byte
 * -identical text. A live region is silent on an unchanged write, so the second
 * one — which is exactly what someone types when they did not catch the first —
 * said nothing at all. Hence `markAsRepeat`, for the same reason select-all
 * needs it: the value is identical on a repeat, and the repeat still matters.
 */
export function useNameBoxClampAnnouncement(
  context: Context,
  info: LocaleInfo
): string {
  const [notice, setNotice] = useState("");
  const previousCount = useRef<number | undefined>(undefined);
  const announceCount = useRef(0);

  const clampCount = context.nameBoxClampCount ?? 0;
  const selection = context.luckysheet_select_save;

  useEffect(() => {
    const previous = previousCount.current;
    previousCount.current = clampCount;
    if (previous === undefined) return;
    // Set when the name box clamped, cleared by the next selection change —
    // so the notice rides exactly one cell announcement and is not still
    // attached the next time the user arrows somewhere.
    if (clampCount === previous) {
      setNotice("");
      return;
    }
    announceCount.current += 1;
    const message =
      announceCount.current % 2 === 0
        ? markAsRepeat(info.nameBoxReferenceClamped)
        : info.nameBoxReferenceClamped;
    setNotice(` ${message}`);
  }, [clampCount, selection, info.nameBoxReferenceClamped]);

  return notice;
}
