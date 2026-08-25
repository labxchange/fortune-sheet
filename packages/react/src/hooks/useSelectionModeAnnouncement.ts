import { useEffect, useRef, useState } from "react";
import { Context, locale } from "@fortune-sheet/core";

/** Ignored by screen readers, but makes the text node differ so a repeat of the
 * same phrase is spoken. Same trick as `useFilterAnnouncements`. */
const ZERO_WIDTH_SPACE = "​";

/**
 * Announce entering Shift+F8 selection mode.
 *
 * The mode is otherwise completely silent, and invisible too: `addSelectionRange`
 * anchors a clone of the range already in focus, so the selection looks
 * identical and `#sr-selection` — built from the last range — produces the very
 * same string it just said. A user enters a mode that changes what the next
 * arrow, Ctrl+Space or Shift+Space does, with no feedback of any kind, and only
 * discovers it two keystrokes later (WCAG 4.1.3).
 *
 * Announced politely rather than assertively, for the reason the filter region
 * gives: the grid's own cell announcement is what the user navigated to hear,
 * and an assertive region cuts it off mid-word.
 */
export function useSelectionModeAnnouncement(context: Context): string {
  const { info } = locale(context);
  const [announcement, setAnnouncement] = useState("");
  const announceCount = useRef(0);
  const prevRangeCount = useRef<number | undefined>(undefined);

  const active = !!context.selectionModeActive;
  const rangeCount = context.luckysheet_select_save?.length ?? 0;

  useEffect(() => {
    const previous = prevRangeCount.current;
    prevRangeCount.current = rangeCount;

    if (!active) {
      setAnnouncement("");
      return;
    }
    // Only a growth in ranges is a new anchor. Moving the anchored range keeps
    // the count level and must stay silent, or every arrow press would repeat.
    if (previous === undefined || rangeCount <= previous) return;

    announceCount.current += 1;
    setAnnouncement(
      announceCount.current % 2 === 0
        ? `${info.addedSelectionRange}${ZERO_WIDTH_SPACE}`
        : info.addedSelectionRange
    );
  }, [active, rangeCount, info.addedSelectionRange]);

  return announcement;
}
