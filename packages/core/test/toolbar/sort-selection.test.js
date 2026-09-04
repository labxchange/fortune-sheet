import { contextFactory, selectionFactory } from "../factories/context";
import { getFlowdata } from "../../src/context";
import { sortSelection } from "../../src/modules/sort";

// sortSelection used to return void, and every one of its refusals is silent —
// each alert was commented out long ago. A caller that reports the outcome (the
// toolbar announces the sort to a screen reader) therefore had no way to tell a
// sort that happened from one that was declined, and reporting the request
// instead would claim sorts the sheet never performed. These pin the answer it
// now gives, one case per refusal.
//
// The answer is a `SortOutcome`, not a boolean: the right-click menu and the
// custom-sort dialog show *why* a sort was declined, so each refusal carries a
// typed `reason`. Asserting the whole object rather than `outcome.sorted` is
// deliberate — the reason is the part a caller renders, and a wrong one is a
// wrong message rather than a silent one.

describe("sortSelection reports whether it sorted", () => {
  const getContext = (overrides = {}) =>
    contextFactory({
      luckysheet_select_save: selectionFactory([0, 2], [0, 0], 0, 0),
      luckysheetfile: [
        {
          id: "id_1",
          data: [
            [{ v: "3", ct: { t: "n" } }],
            [{ v: "1", ct: { t: "n" } }],
            [{ v: "2", ct: { t: "n" } }],
          ],
        },
      ],
      ...overrides,
    });

  it("reports a sort that happened, and reorders the range", () => {
    const ctx = getContext();

    expect(sortSelection(ctx, true)).toEqual({ sorted: true });
    expect(getFlowdata(ctx).map((row) => row[0].v)).toEqual(["1", "2", "3"]);
  });

  it("still reports sorted for a range that was already in order", () => {
    // The sort ran and the range is in the requested order; that nothing moved
    // is not a refusal, and a caller must not have to treat it as one.
    const ctx = getContext();
    sortSelection(ctx, true);

    expect(sortSelection(ctx, true)).toEqual({ sorted: true });
    expect(getFlowdata(ctx).map((row) => row[0].v)).toEqual(["1", "2", "3"]);
  });

  it("refuses a read-only sheet, saying so", () => {
    const ctx = getContext({ allowEdit: false });

    expect(sortSelection(ctx, true)).toEqual({
      sorted: false,
      reason: "readOnly",
    });
    expect(getFlowdata(ctx).map((row) => row[0].v)).toEqual(["3", "1", "2"]);
  });

  it("refuses with no selection to sort", () => {
    const ctx = getContext({ luckysheet_select_save: null });

    expect(sortSelection(ctx, true)).toEqual({
      sorted: false,
      reason: "noSelection",
    });
  });

  it("refuses a multi-range selection", () => {
    const ctx = getContext({
      luckysheet_select_save: [
        { row: [0, 1], column: [0, 0], row_focus: 0, column_focus: 0 },
        { row: [2, 2], column: [0, 0], row_focus: 2, column_focus: 0 },
      ],
    });

    expect(sortSelection(ctx, true)).toEqual({
      sorted: false,
      reason: "multiRange",
    });
    expect(getFlowdata(ctx).map((row) => row[0].v)).toEqual(["3", "1", "2"]);
  });

  it("refuses a range holding a merged cell", () => {
    const ctx = getContext({
      luckysheetfile: [
        {
          id: "id_1",
          data: [
            [{ v: "3", ct: { t: "n" } }],
            [{ v: "1", ct: { t: "n" }, mc: { r: 1, c: 0, rs: 2, cs: 1 } }],
            [{ v: "2", ct: { t: "n" } }],
          ],
        },
      ],
    });

    expect(sortSelection(ctx, true)).toEqual({
      sorted: false,
      reason: "mergedCells",
    });
  });

  it("refuses a column with nothing to sort", () => {
    const ctx = getContext({
      luckysheetfile: [{ id: "id_1", data: [[null], [null], [null]] }],
    });

    expect(sortSelection(ctx, true)).toEqual({
      sorted: false,
      reason: "noData",
    });
  });
});
