import { handleMerge } from "../../src/modules/toolbar";

describe("Cells", () => {
  const context = {
    config: {},
    luckysheetfile: [
      {
        id: "0",
        data: [
          [
            {
              v: "hello",
            },
            null,
          ],
          [null, null],
        ],
      },
    ],
    currentSheetId: "0",
    luckysheet_select_save: [
      {
        left: 0,
        width: 73,
        top: 0,
        height: 19,
        left_move: 0,
        width_move: 147,
        top_move: 0,
        height_move: 39,
        row: [0, 1],
        column: [0, 1],
        row_focus: 0,
        column_focus: 0,
      },
    ],
  };

  it("MergeAllCell", async () => {
    handleMerge(context, "merge-all");
    expect(context.luckysheetfile[0].data[0][0].v).toEqual("hello");
    expect(context.luckysheetfile[0].data[0][1].mc.r).toEqual(0);
    expect(context.luckysheetfile[0].data[0][1].mc.c).toEqual(0);
    handleMerge(context, "merge-cancel");
    handleMerge(context, "merge-vertical");
    expect(context.luckysheetfile[0].data[0][0].v).toEqual("hello");
    expect(context.luckysheetfile[0].data[0][1].mc.rs).toEqual(2);
    handleMerge(context, "merge-cancel");
    handleMerge(context, "merge-horizontal");
    expect(context.luckysheetfile[0].data[0][0].v).toEqual("hello");
    expect(context.luckysheetfile[0].data[1][0].mc.cs).toEqual(2);
  });
});

// handleMerge used to return void. Every ending below but the first two was
// silent, and the sheet mounts with a single cell selected — so the most
// likely press of the merge button moved nothing, repainted nothing and said
// nothing, which reads as a button that is neither clickable nor operable by
// keyboard. The toolbar announces the outcome to a screen reader now, so each
// ending has to be distinguishable. One case per ending.

describe("handleMerge reports what came of the press", () => {
  const sheetWith = (data, config = {}) => ({
    config,
    currentSheetId: "0",
    allowEdit: true,
    luckysheetfile: [{ id: "0", data }],
  });

  const twoByOne = () => [
    [{ v: "hello" }, null],
    [null, null],
  ];

  const selection = (row, column) => [
    { row, column, row_focus: row[0], column_focus: column[0] },
  ];

  it("reports a merge that happened", () => {
    const ctx = {
      ...sheetWith(twoByOne()),
      luckysheet_select_save: selection([0, 1], [0, 0]),
    };

    expect(handleMerge(ctx, "merge-all")).toEqual("changed");
    expect(ctx.luckysheetfile[0].data[1][0].mc).toEqual({ r: 0, c: 0 });
  });

  it("reports a single-cell selection, which it cannot merge", () => {
    const ctx = {
      ...sheetWith(twoByOne()),
      luckysheet_select_save: selection([0, 0], [0, 0]),
    };

    expect(handleMerge(ctx, "merge-all")).toEqual("singleCell");
    expect(ctx.luckysheetfile[0].data[0][0].mc).toBeUndefined();
  });

  it("reports a selection whose far edge is not resolved yet as a single cell", () => {
    // What a sheet mounts with: the extent is nil until a layout pass, and
    // `0 <= null` is false, so every loop over the range ran zero times.
    const ctx = {
      ...sheetWith(twoByOne()),
      luckysheet_select_save: [
        { row: [0, null], column: [0, null], row_focus: 0, column_focus: 0 },
      ],
    };

    expect(handleMerge(ctx, "merge-all")).toEqual("singleCell");
  });

  it("reports an unmerge over a range that holds no merged cell", () => {
    const ctx = {
      ...sheetWith(twoByOne()),
      luckysheet_select_save: selection([0, 1], [0, 0]),
    };

    expect(handleMerge(ctx, "merge-cancel")).toEqual("nothingMerged");
  });

  it("reports an unmerge that happened", () => {
    const ctx = {
      ...sheetWith(
        [
          [{ v: "hello", mc: { r: 0, c: 0, rs: 2, cs: 1 } }, null],
          [{ mc: { r: 0, c: 0 } }, null],
        ],
        { merge: { "0_0": { r: 0, c: 0, rs: 2, cs: 1 } } }
      ),
      luckysheet_select_save: selection([0, 1], [0, 0]),
    };

    expect(handleMerge(ctx, "merge-cancel")).toEqual("changed");
    expect(ctx.luckysheetfile[0].data[0][0].mc).toBeUndefined();
  });

  it("reports a selection that cuts through a merged cell", () => {
    // `merge.partiallyError` is the locale's own wording for this, and the
    // alert that used to carry it is still commented out in handleMerge.
    const ctx = {
      ...sheetWith(
        [
          [null, null],
          [{ v: "hello", mc: { r: 1, c: 0, rs: 2, cs: 2 } }, null],
          [null, null],
        ],
        { merge: { "1_0": { r: 1, c: 0, rs: 2, cs: 2 } } }
      ),
      luckysheet_select_save: selection([0, 1], [0, 1]),
    };

    expect(handleMerge(ctx, "merge-all")).toEqual("partMerge");
  });

  it("reports two ranges that overlap each other", () => {
    // Ctrl-drag a second range back across the first. `selectIsOverlap` runs
    // ahead of every other check in `handleMerge`, so this is the one ending
    // no other fixture here can reach.
    const ctx = {
      ...sheetWith(twoByOne()),
      luckysheet_select_save: [
        { row: [0, 1], column: [0, 0], row_focus: 0, column_focus: 0 },
        { row: [1, 1], column: [0, 0], row_focus: 1, column_focus: 0 },
      ],
    };

    expect(handleMerge(ctx, "merge-all")).toEqual("overlap");
    // `mergeCells` writes `{ mc }` into every cell of a merge, so the
    // fixture's empty cell still being null is the proof none ran.
    expect(ctx.luckysheetfile[0].data[1][0]).toBeNull();
  });

  it("reports a read-only sheet", () => {
    const ctx = {
      ...sheetWith(twoByOne()),
      allowEdit: false,
      luckysheet_select_save: selection([0, 1], [0, 0]),
    };

    expect(handleMerge(ctx, "merge-all")).toEqual("readOnly");
  });

  it("reports a selection that falls on a read-only row", () => {
    // How this was found: the Basic story marks rows 2-4 `rowReadOnly`, so a
    // selection dragged across them made the merge button do nothing at all,
    // with no message — indistinguishable from a broken control.
    const ctx = {
      ...sheetWith(twoByOne(), { rowReadOnly: { 0: 1 } }),
      luckysheet_select_save: selection([0, 1], [0, 0]),
    };

    expect(handleMerge(ctx, "merge-all")).toEqual("readOnly");
    // Untouched: `mergeCells` writes `{ mc }` into every cell of a merge, so
    // the fixture's empty cell still being null is the proof none ran.
    expect(ctx.luckysheetfile[0].data[1][0]).toBeNull();
  });

  it("stays unspoken with no selection at all", () => {
    // This used to throw rather than return: `selectIsOverlap` ran first and
    // read `.length` off the nil selection. A sheet whose data carries no
    // selection keeps `undefined` through mount, so the press was reachable.
    const ctx = { ...sheetWith(twoByOne()), luckysheet_select_save: null };

    expect(handleMerge(ctx, "merge-all")).toEqual("refused");
  });

  it("stays unspoken with an empty selection, rather than blaming one cell", () => {
    // `[]` is truthy and `[].every()` is vacuously true, so this answered
    // "singleCell" and the user was told they cannot merge a single cell while
    // nothing at all was selected.
    const ctx = { ...sheetWith(twoByOne()), luckysheet_select_save: [] };

    expect(handleMerge(ctx, "merge-all")).toEqual("refused");
  });

  it("declines rather than throwing when the selection is undefined", () => {
    const ctx = { ...sheetWith(twoByOne()) };
    delete ctx.luckysheet_select_save;

    expect(() => handleMerge(ctx, "merge-all")).not.toThrow();
    expect(handleMerge(ctx, "merge-all")).toEqual("refused");
  });
});
