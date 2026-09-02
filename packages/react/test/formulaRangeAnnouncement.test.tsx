import { renderHook } from "@testing-library/react";
import { Context, FormulaCache, locale } from "@fortune-sheet/core";
import { useFormulaRangeAnnouncement } from "../src/hooks/useFormulaRangeAnnouncement";

const { info } = locale({ lang: "en" } as unknown as Context);

// Picking a cell reference during formula entry is drawn as an overlay
// rectangle and written into a contenteditable. Neither reaches a screen
// reader, so the announcement is the only thing that tells a non-sighted user
// which cell the arrows are on.
describe("formula range announcement", () => {
  const buildContext = (
    rangestart: boolean,
    range: { row: number[]; column: number[] } | null
  ) => {
    const formulaCache = new FormulaCache();
    formulaCache.rangestart = rangestart;
    if (range) {
      formulaCache.func_selectedrange = {
        ...range,
        row_focus: range.row[0],
        column_focus: range.column[0],
      };
    }
    return {
      lang: "en",
      currentSheetId: "s1",
      luckysheetfile: [{ id: "s1", name: "Sheet1", data: [[null]] }],
      formulaCache,
      // The tracked field: reassigned by the same call that moves the phantom
      // selection, and the only part of a pick React can see.
      formulaRangeSelect: range
        ? { rangeIndex: 0, left: 0, top: 0, width: 10, height: 10 }
        : undefined,
    } as unknown as Context;
  };

  const expected = (ref: string) =>
    info.formulaReferenceSelected.replace("${range}", ref);

  test("announces the picked reference, spelled for a screen reader", () => {
    const { result } = renderHook(() =>
      useFormulaRangeAnnouncement(
        buildContext(true, { row: [1, 1], column: [2, 2] })
      )
    );

    // "C. 2", not "C2" -- the latter is read as a word.
    expect(result.current).toBe(expected("C. 2"));
  });

  test("announces a merged reference as the whole range", () => {
    const { result } = renderHook(() =>
      useFormulaRangeAnnouncement(
        buildContext(true, { row: [1, 2], column: [1, 1] })
      )
    );

    expect(result.current).toBe(expected("B. 2:B. 3"));
  });

  test("says nothing when point mode is not running", () => {
    const { result } = renderHook(() =>
      useFormulaRangeAnnouncement(
        buildContext(false, { row: [1, 1], column: [2, 2] })
      )
    );

    expect(result.current).toBe("");
  });

  test("each step is announced", () => {
    const { result, rerender } = renderHook(
      (ctx: Context) => useFormulaRangeAnnouncement(ctx),
      { initialProps: buildContext(true, { row: [1, 1], column: [2, 2] }) }
    );
    expect(result.current).toBe(expected("C. 2"));

    rerender(buildContext(true, { row: [0, 0], column: [2, 2] }));
    expect(result.current).toBe(expected("C. 1"));

    rerender(buildContext(true, { row: [1, 1], column: [2, 2] }));
    expect(result.current).toBe(expected("C. 2"));
  });

  test("leaving point mode clears the region", () => {
    const { result, rerender } = renderHook(
      (ctx: Context) => useFormulaRangeAnnouncement(ctx),
      { initialProps: buildContext(true, { row: [1, 1], column: [2, 2] }) }
    );
    expect(result.current).toBe(expected("C. 2"));

    rerender(buildContext(false, null));

    expect(result.current).toBe("");
  });
});
