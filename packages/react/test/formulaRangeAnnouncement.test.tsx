import { renderHook } from "@testing-library/react";
import { Context, FormulaCache, locale } from "@fortune-sheet/core";
import { useFormulaRangeAnnouncement } from "../src/hooks/useFormulaRangeAnnouncement";

const { info } = locale({ lang: "en" } as unknown as Context);

// Picking a cell reference during formula entry is drawn as an overlay
// rectangle and written into a contenteditable. Neither reaches a screen
// reader, so the announcement is the only thing that tells a non-sighted user
// which cell the arrows are on.
describe("formula range announcement", () => {
  /**
   * @param rangeText what rangeSetValue actually wrote into the formula
   * @param picked    the phantom selection, which does not always agree
   */
  const buildContext = (
    rangestart: boolean,
    rangeText: string | undefined,
    picked?: { row: number[]; column: number[] }
  ) => {
    const formulaCache = new FormulaCache();
    formulaCache.rangestart = rangestart;
    formulaCache.rangeText = rangeText;
    if (picked) {
      formulaCache.func_selectedrange = {
        ...picked,
        row_focus: picked.row[0],
        column_focus: picked.column[0],
      };
    }
    return {
      lang: "en",
      currentSheetId: "s1",
      luckysheetfile: [{ id: "s1", name: "Sheet1", data: [[null]] }],
      formulaCache,
      // The tracked field: reassigned by the same call that moves the phantom
      // selection, and the only part of a pick React can see.
      formulaRangeSelect: rangeText
        ? { rangeIndex: 0, left: 0, top: 0, width: 10, height: 10 }
        : undefined,
    } as unknown as Context;
  };

  const expected = (ref: string) =>
    info.formulaReferenceSelected.replace("${range}", ref);

  test("announces the picked reference, spelled for a screen reader", () => {
    const { result } = renderHook(() =>
      useFormulaRangeAnnouncement(
        buildContext(true, "C2", { row: [1, 1], column: [2, 2] })
      )
    );

    // "C. 2", not "C2" -- the latter is read as a word.
    expect(result.current).toBe(expected("C. 2"));
  });

  test("quotes the formula, not the phantom selection, on a merged cell", () => {
    // rangeSetValue collapses a merged reference to the merge's anchor, so the
    // formula reads =SUM(B2 while func_selectedrange still spans B2:B3.
    // Announcing the span would name a range that is not in the user's formula.
    const { result } = renderHook(() =>
      useFormulaRangeAnnouncement(
        buildContext(true, "B2", { row: [1, 2], column: [1, 1] })
      )
    );

    expect(result.current).toBe(expected("B. 2"));
  });

  test("announces the range AutoSum inserted, not the cell it was invoked on", () => {
    // activeFormulaInput is a fourth writer of point-mode state: it seeds
    // func_selectedrange with the cell being edited (D6) but writes the
    // detected sum range (D1:D5).
    const { result } = renderHook(() =>
      useFormulaRangeAnnouncement(
        buildContext(true, "D1:D5", { row: [5, 5], column: [3, 3] })
      )
    );

    expect(result.current).toBe(expected("D. 1:D. 5"));
  });

  test("says nothing when point mode is not running", () => {
    const { result } = renderHook(() =>
      useFormulaRangeAnnouncement(
        buildContext(false, "C2", { row: [1, 1], column: [2, 2] })
      )
    );

    expect(result.current).toBe("");
  });

  test("each step is announced", () => {
    const { result, rerender } = renderHook(
      (ctx: Context) => useFormulaRangeAnnouncement(ctx),
      {
        initialProps: buildContext(true, "C2", { row: [1, 1], column: [2, 2] }),
      }
    );
    expect(result.current).toBe(expected("C. 2"));

    rerender(buildContext(true, "C1", { row: [0, 0], column: [2, 2] }));
    expect(result.current).toBe(expected("C. 1"));

    rerender(buildContext(true, "C2", { row: [1, 1], column: [2, 2] }));
    expect(result.current).toBe(expected("C. 2"));
  });

  test("leaving point mode clears the region", () => {
    const { result, rerender } = renderHook(
      (ctx: Context) => useFormulaRangeAnnouncement(ctx),
      {
        initialProps: buildContext(true, "C2", { row: [1, 1], column: [2, 2] }),
      }
    );
    expect(result.current).toBe(expected("C. 2"));

    rerender(buildContext(false, undefined));

    expect(result.current).toBe("");
  });
});
