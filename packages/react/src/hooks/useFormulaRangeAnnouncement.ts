import { useEffect, useState } from "react";
import {
  Context,
  formatRefForSr,
  getRangetxt,
  locale,
  replaceHtml,
} from "@fortune-sheet/core";

/**
 * Announce the cell reference being picked during formula entry.
 *
 * Point mode draws the picked cell as an overlay rectangle and writes its A1
 * text into the formula. Both are purely visual: the formula text lives in a
 * contenteditable the screen reader is not re-reading on every keystroke, and
 * the rectangle is a positioned div with no accessible name at all. So a user
 * arrowing from C4 to C3 to C2 heard nothing about where they were (WCAG
 * 4.1.3) — which would have opened a new failure on a ticket meant to close
 * one.
 *
 * Driven by `formulaRangeSelect` rather than by `func_selectedrange` directly.
 * The latter hangs off `formulaCache`, which is a class instance precisely so
 * immer will not track it — mutating it re-renders nothing. `formulaRangeSelect`
 * is an ordinary context field, reassigned by the same call that moves the
 * phantom selection, so it is the part of the pick React can actually see.
 *
 * Polite, for the reason `#sr-filterRegion` gives: `#sr-selection` is an alert,
 * and an assertive message here would cut off whatever it is saying.
 */
export function useFormulaRangeAnnouncement(context: Context): string {
  const { info } = locale(context);
  const [announcement, setAnnouncement] = useState("");

  const { formulaRangeSelect } = context;
  const picked = context.formulaCache?.func_selectedrange;
  const active =
    !!context.formulaCache?.rangestart && !!formulaRangeSelect && !!picked;

  // A whole-row or whole-column reference carries nulls on the other axis, and
  // getRangetxt renders those as "A:C" / "2:4" — still a reference worth
  // speaking, so it is passed through rather than filtered out.
  const rangeText =
    active && picked
      ? getRangetxt(
          context,
          context.currentSheetId,
          { row: picked.row, column: picked.column },
          context.currentSheetId
        )
      : "";

  // No markAsRepeat here, unlike the other announcement hooks. They exist for
  // actions whose phrase is identical every time, where a live region would
  // swallow the second one. A reference that has not moved produces the same
  // rangeText, so this effect does not re-run at all — and that is right: the
  // pick did not change, so there is nothing to say.
  useEffect(() => {
    if (!rangeText) {
      // Point mode ended. Clearing rather than leaving the last reference in
      // place keeps the region from re-speaking it if point mode restarts on
      // the very same cell.
      setAnnouncement("");
      return;
    }

    setAnnouncement(
      replaceHtml(info.formulaReferenceSelected, {
        range: formatRefForSr(rangeText),
      })
    );
  }, [rangeText, info.formulaReferenceSelected]);

  return announcement;
}
