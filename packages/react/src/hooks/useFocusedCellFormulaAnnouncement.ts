import { Context, getSheetIndex, locale } from "@fortune-sheet/core";
import { useMemo } from "react";
import _ from "lodash";

type LocaleInfo = ReturnType<typeof locale>["info"];

/**
 * Says the focused cell holds a formula, as a segment to append to whatever is
 * already describing that cell.
 *
 * A computed cell announces its *result* and nothing else, so "16.13" sounds
 * exactly like a number somebody typed. A sighted user has the formula bar and
 * the sheet's own visual cues; a screen-reader user has neither, and cannot tell
 * a derived value from a literal one before deciding whether to overwrite it
 * (WCAG 1.3.1, 4.1.2).
 *
 * Read from the cell's `f`, not its `v` or `m`: `f` is the formula source, and
 * `v`/`m` are the result it produced. A cell filled by another cell's spill has
 * no `f` of its own and is deliberately not marked — it holds a value, not a
 * formula.
 *
 * Any `f` counts, rather than one `isFormula` accepts. `isFormula` additionally
 * requires a leading `=`, and the two places that decide whether the *editor*
 * opens on a formula do not — `InputBox.tsx` and `FxEditor/index.tsx` both test
 * `cell.f` bare. A stored `f` without the `=`, which `celldata` and the public
 * API can both produce, was therefore edited as a formula and not announced as
 * one: precisely the gap this hook exists to close. Matching those two keeps
 * what is said about a cell and what happens when you open it in agreement.
 *
 * Returns the leading-space form the neighbouring `filterCellAnnouncement` and
 * `clampAnnouncement` segments use, so it concatenates the same way, and the
 * empty string when there is nothing to say.
 */
export function useFocusedCellFormulaAnnouncement(
  context: Context,
  info: LocaleInfo
): string {
  return useMemo(() => {
    const lastSelection = _.last(context.luckysheet_select_save);
    const rf = lastSelection?.row_focus;
    const cf = lastSelection?.column_focus;
    if (rf == null || cf == null) return "";
    const sheetIndex = getSheetIndex(context, context.currentSheetId);
    if (sheetIndex == null) return "";
    const cell = context.luckysheetfile[sheetIndex]?.data?.[rf]?.[cf];
    return cell?.f ? ` ${info.cellHasFormula}` : "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    context.luckysheetfile,
    context.currentSheetId,
    context.luckysheet_select_save,
    info.cellHasFormula,
  ]);
}

export default useFocusedCellFormulaAnnouncement;
