import React from "react";
import { render, renderHook } from "@testing-library/react";
import { Context, FormulaCache, locale } from "@fortune-sheet/core";
import Workbook from "../src/components/Workbook";
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

  // The hook only produces the string. Whether that string is *spoken in time*
  // is a property of the region it lands in, and the region is where the
  // WCAG 4.1.2 half of this ticket actually lives -- a polite region is
  // dropped rather than queued while other speech is in progress, so the
  // reference was arriving only after the placeholder noise had drained.
  //
  // Asserted on the rendered tree rather than by reading the source, because
  // the attributes are the contract with the screen reader and a source regex
  // would still pass if the region stopped being rendered at all.
  describe("the region the announcement lands in", () => {
    const renderSheet = () =>
      render(
        <Workbook
          lang="en"
          data={[
            { name: "Sheet1", id: "s1", celldata: [], row: 10, column: 6 },
          ]}
        />
      );

    it("is assertive, so it can pre-empt speech already in progress", () => {
      renderSheet();

      const region = document.getElementById("sr-formulaRange");

      expect(region).not.toBeNull();
      // One assertion, because one attribute carries both properties:
      // `role="alert"` implies aria-live="assertive" and aria-atomic="true".
      // The atomicity matters here specifically -- read incrementally, a
      // reference changing C1 -> C10 is announced as a diff rather than whole
      // -- and it comes from the role, not from a spelled-out aria-atomic,
      // which `srLiveRegionSpelling.test.tsx` now rules out repo-wide.
      expect(region!.getAttribute("role")).toBe("alert");
    });

    // The counter-path, and the reason it is here: the neighbouring regions
    // were left polite on purpose. Each of them fires *after* a selection move,
    // where assertive would cut off the cell announcement the user navigated to
    // hear -- the reasoning the formula region shipped with and no longer
    // shares, because during point mode the real selection never moves. A
    // blanket sweep to assertive would pass the case above and break those.
    it("leaves its polite neighbours polite", () => {
      renderSheet();

      expect(
        document.getElementById("sr-selectionMode")!.getAttribute("role")
      ).toBe("status");
      expect(
        document.getElementById("sr-selectAll")!.getAttribute("role")
      ).toBe("status");
      expect(
        document.getElementById("sr-filterRegion")!.getAttribute("role")
      ).toBe("status");
    });
  });
});
