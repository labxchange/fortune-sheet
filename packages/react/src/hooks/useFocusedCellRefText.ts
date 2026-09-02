import { Context, getRangetxt, formatRefForSr } from "@fortune-sheet/core";
import { useMemo } from "react";
import _ from "lodash";

/**
 * The reference of the single focused cell, spelled for a screen reader.
 *
 * Deliberately not the selected *range*, which is what `#sr-selection` reads.
 * The cell input this names sits over one cell — the focus cell — so a range is
 * both wrong and, at rest on a freshly mounted sheet, unusable: the default
 * selection carries only a start, so the range text comes out as "A1:NaN".
 * `#sr-selection` sidesteps that with a NaN check and an intro string; building
 * the reference from `row_focus`/`column_focus` means the question never arises.
 */
export default function useFocusedCellRefText(context: Context): string {
  return useMemo(() => {
    const lastSelection = _.last(context.luckysheet_select_save);
    const rf = lastSelection?.row_focus;
    const cf = lastSelection?.column_focus;
    if (rf == null || cf == null) return "";
    return formatRefForSr(
      getRangetxt(context, context.currentSheetId, {
        row: [rf, rf],
        column: [cf, cf],
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.currentSheetId, context.luckysheet_select_save]);
}
