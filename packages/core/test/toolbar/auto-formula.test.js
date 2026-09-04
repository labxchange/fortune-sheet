/* eslint-disable jest/expect-expect */
import { contextFactory, selectionFactory } from "../factories/context";
import { getFlowdata } from "../../src/context";
import { autoSelectionFormula } from "../../src/modules/toolbar";
import { locale } from "../../src/locale";

function expectValuesInPositions(flowdata, expectValues, expectPositions) {
  if (expectPositions.length !== expectValues.length) {
    console.error(
      "The number of expectPositions does not equal to the number of expectValues"
    );
    return;
  }
  for (let i = 0; i < expectPositions.length; i += 1) {
    const x = expectPositions[i][0];
    const y = expectPositions[i][1];
    expect(flowdata[x][y].v).toBe(expectValues[i]);
  }
}
describe("auto formula", () => {
  const getContext = () =>
    contextFactory({
      luckysheet_select_save: selectionFactory([0, 1], [0, 1], 0, 0),
      luckysheetfile: [
        {
          id: "id_1",
          data: [
            [{ v: "30", ct: { t: "n" } }, { v: "40", ct: { t: "n" } }, null],
            [{ v: "30", ct: { t: "n" } }, { v: "50", ct: { t: "n" } }, null],
            [null, null, null],
          ],
        },
      ],
    });
  const expectPositions = [
    [0, 2],
    [1, 2],
    [2, 0],
    [2, 1],
  ];

  test("sum", async () => {
    const cellInput = document.createElement("div");
    const ctx = getContext();
    autoSelectionFormula(ctx, cellInput, null, "SUM");
    expectValuesInPositions(
      getFlowdata(ctx),
      [70, 80, 60, 90],
      expectPositions
    );
  });

  test("min", async () => {
    const cellInput = document.createElement("div");
    const ctx = getContext();
    autoSelectionFormula(ctx, cellInput, null, "MIN");
    expectValuesInPositions(
      getFlowdata(ctx),
      [30, 30, 30, 40],
      expectPositions
    );
  });

  test("max", async () => {
    const cellInput = document.createElement("div");
    const ctx = getContext();
    autoSelectionFormula(ctx, cellInput, null, "max");
    expectValuesInPositions(
      getFlowdata(ctx),
      [40, 50, 30, 50],
      expectPositions
    );
  });

  test("average", async () => {
    const cellInput = document.createElement("div");
    const ctx = getContext();
    autoSelectionFormula(ctx, cellInput, null, "AVERAGE");
    expectValuesInPositions(
      getFlowdata(ctx),
      [35, 40, 30, 45],
      expectPositions
    );
  });

  test("count", async () => {
    const cellInput = document.createElement("div");
    const ctx = getContext();
    autoSelectionFormula(ctx, cellInput, null, "COUNT");
    expectValuesInPositions(getFlowdata(ctx), [2, 2, 2, 2], expectPositions);
  });

  // Asana 1217814380695668 — applying an auto formula to a range that mixes
  // text and numbers crashed the sheet. Both halves of the ticket are pinned
  // here: it must not throw, and it must produce a useful number rather than
  // giving up because one cell in the range holds letters.
  describe("mixed text and numeric content", () => {
    // A column of numbers under a text header, which is the shape every column
    // in the EDA sim has, and the shape that made this reachable: with a header
    // row there is no all-numeric block to select, so users select the whole
    // column — header included, and down to the last row.
    const getEdgeContext = () =>
      contextFactory({
        luckysheet_select_save: selectionFactory([0, 2], [0, 1], 0, 0),
        luckysheetfile: [
          {
            id: "id_1",
            data: [
              [
                { v: "Height", ct: { t: "s" }, m: "Height" },
                { v: "Weight", ct: { t: "s" }, m: "Weight" },
              ],
              [
                { v: "30", ct: { t: "n" }, m: "30" },
                { v: "40", ct: { t: "n" }, m: "40" },
              ],
              [
                { v: "30", ct: { t: "n" }, m: "30" },
                { v: "n/a", ct: { t: "s" }, m: "n/a" },
              ],
            ],
          },
        ],
      });

    // The crash itself. The selection reaches the last row, so the column pass
    // reads d[ed_m + 1][fix] — d[3] on a three-row matrix — and dereferences
    // undefined. Nothing about this is recoverable from the UI: it takes the
    // whole sheet down.
    test.each(["SUM", "AVERAGE", "COUNT", "MAX", "MIN"])(
      "%s does not throw when the selection reaches the last row",
      (formula) => {
        const cellInput = document.createElement("div");
        const ctx = getEdgeContext();
        expect(() =>
          autoSelectionFormula(ctx, cellInput, null, formula)
        ).not.toThrow();
      }
    );

    // The same selection one column short of the right edge, so the row pass
    // has somewhere to write. Separates the out-of-bounds crash from the
    // question of what a formula over mixed content should compute.
    const getInteriorContext = () =>
      contextFactory({
        luckysheet_select_save: selectionFactory([0, 1], [0, 1], 0, 0),
        luckysheetfile: [
          {
            id: "id_1",
            data: [
              [
                { v: "abc", ct: { t: "s" }, m: "abc" },
                { v: "40", ct: { t: "n" }, m: "40" },
                null,
              ],
              [
                { v: "30", ct: { t: "n" }, m: "30" },
                { v: "50", ct: { t: "n" }, m: "50" },
                null,
              ],
              [null, null, null],
            ],
          },
        ],
      });

    // Excel and Sheets both skip text in SUM/AVERAGE rather than refusing the
    // whole range. Row 0 is ["abc", 40] -> 40; row 1 is [30, 50] -> 80;
    // column 0 is ["abc", 30] -> 30; column 1 is [40, 50] -> 90.
    test("SUM ignores the text cells instead of failing the range", () => {
      const cellInput = document.createElement("div");
      const ctx = getInteriorContext();
      autoSelectionFormula(ctx, cellInput, null, "SUM");
      expectValuesInPositions(
        getFlowdata(ctx),
        [40, 80, 30, 90],
        expectPositions
      );
    });

    // AVERAGE divides by the count of *numeric* cells, so the "abc" row
    // averages to 40 and not to 20.
    test("AVERAGE divides by the numeric count only", () => {
      const cellInput = document.createElement("div");
      const ctx = getInteriorContext();
      autoSelectionFormula(ctx, cellInput, null, "AVERAGE");
      expectValuesInPositions(
        getFlowdata(ctx),
        [40, 40, 30, 45],
        expectPositions
      );
    });

    // The guard is per direction, not a blanket bail-out: running out of room
    // below must not cost the totals there is still room for to the right.
    test("still writes row totals when only the column totals have no room", () => {
      const cellInput = document.createElement("div");
      const ctx = contextFactory({
        luckysheet_select_save: selectionFactory([0, 2], [0, 1], 0, 0),
        luckysheetfile: [
          {
            id: "id_1",
            data: [
              [
                { v: "Height", ct: { t: "s" }, m: "Height" },
                { v: "Weight", ct: { t: "s" }, m: "Weight" },
                null,
              ],
              [
                { v: "30", ct: { t: "n" }, m: "30" },
                { v: "40", ct: { t: "n" }, m: "40" },
                null,
              ],
              [
                { v: "30", ct: { t: "n" }, m: "30" },
                { v: "n/a", ct: { t: "s" }, m: "n/a" },
                null,
              ],
            ],
          },
        ],
      });
      autoSelectionFormula(ctx, cellInput, null, "SUM");
      const flowdata = getFlowdata(ctx);

      // room to the right, so the numeric rows are totalled — and the "n/a"
      // is skipped rather than failing its row
      expect(flowdata[1][2].v).toBe(70);
      expect(flowdata[2][2].v).toBe(30);
      // the all-text header row has nothing to total, so it stays empty
      expect(flowdata[0][2]).toBeNull();
      // no room below, so no column totals and, crucially, no fourth row
      expect(flowdata).toHaveLength(3);
    });

    // The mirror image: no room to the right, room below. Along a row the bad
    // read returned undefined rather than throwing, so the damage would have
    // been a silent write into a column that does not exist.
    test("still writes column totals when only the row totals have no room", () => {
      const cellInput = document.createElement("div");
      const ctx = contextFactory({
        luckysheet_select_save: selectionFactory([0, 1], [0, 1], 0, 0),
        luckysheetfile: [
          {
            id: "id_1",
            data: [
              [
                { v: "Height", ct: { t: "s" }, m: "Height" },
                { v: "Weight", ct: { t: "s" }, m: "Weight" },
              ],
              [
                { v: "30", ct: { t: "n" }, m: "30" },
                { v: "40", ct: { t: "n" }, m: "40" },
              ],
              [null, null],
            ],
          },
        ],
      });
      autoSelectionFormula(ctx, cellInput, null, "SUM");
      const flowdata = getFlowdata(ctx);

      expect(flowdata[0][2]).toBeUndefined();
      expect(flowdata[1][2]).toBeUndefined();
      // every row keeps the width it started with
      flowdata.forEach((row) => expect(row).toHaveLength(2));
      // and the column totals below are still written
      expect(flowdata[2][0].v).toBe(30);
      expect(flowdata[2][1].v).toBe(40);
    });

    // The ticket allows either ignoring the unusable cells or explaining the
    // refusal. Both apply: the maths already ignores text, and running out of
    // room is now explained rather than silently doing nothing.
    describe("the explanation when there is no room", () => {
      const noRoomMessage = () => locale({}).generalDialog.noRoomForResultError;

      // Only a column filled right down to the final row has genuinely nowhere
      // to put the result. The far more common whole-column selection, with
      // blank rows under the data, is handled below and must not warn.
      test("explains itself when the column is filled to the very last row", () => {
        const cellInput = document.createElement("div");
        const ctx = contextFactory({
          luckysheet_select_save: selectionFactory([0, 2], [0, 0], 0, 0),
          luckysheetfile: [
            {
              id: "id_1",
              data: [
                [{ v: "Height", ct: { t: "s" }, m: "Height" }],
                [{ v: "30", ct: { t: "n" }, m: "30" }],
                [{ v: "30", ct: { t: "n" }, m: "30" }],
              ],
            },
          ],
        });
        autoSelectionFormula(ctx, cellInput, null, "SUM");
        expect(ctx.warnDialog).toBe(noRoomMessage());
      });

      // A 2D selection runs two independent passes. One of them being full is
      // not worth a dialog if the other one delivered.
      test("stays quiet when the other direction found room", () => {
        const cellInput = document.createElement("div");
        const ctx = contextFactory({
          luckysheet_select_save: selectionFactory([0, 2], [0, 1], 0, 0),
          luckysheetfile: [
            {
              id: "id_1",
              data: [
                [
                  { v: "Height", ct: { t: "s" }, m: "Height" },
                  { v: "Weight", ct: { t: "s" }, m: "Weight" },
                  null,
                ],
                [
                  { v: "30", ct: { t: "n" }, m: "30" },
                  { v: "40", ct: { t: "n" }, m: "40" },
                  null,
                ],
                [
                  { v: "30", ct: { t: "n" }, m: "30" },
                  { v: "n/a", ct: { t: "s" }, m: "n/a" },
                  null,
                ],
              ],
            },
          ],
        });
        autoSelectionFormula(ctx, cellInput, null, "SUM");
        expect(getFlowdata(ctx)[1][2].v).toBe(70);
        expect(ctx.warnDialog).toBeUndefined();
      });

      test("says nothing at all on an ordinary selection", () => {
        const cellInput = document.createElement("div");
        const ctx = getInteriorContext();
        autoSelectionFormula(ctx, cellInput, null, "SUM");
        expect(ctx.warnDialog).toBeUndefined();
      });

      // The cell past the range is the first place the result is offered, but
      // not the only one: if it is occupied the engine climbs looking for a
      // free cell. That walk can run out of sheet just as the first step can,
      // and used to do it in silence.
      test("explains itself when the walk past an occupied cell runs out of sheet", () => {
        const cellInput = document.createElement("div");
        const ctx = contextFactory({
          luckysheet_select_save: selectionFactory([0, 1], [0, 0], 0, 0),
          luckysheetfile: [
            {
              id: "id_1",
              data: [
                [{ v: "30", ct: { t: "n" }, m: "30" }],
                [{ v: "30", ct: { t: "n" }, m: "30" }],
                [{ v: "occupied", ct: { t: "s" }, m: "occupied" }],
              ],
            },
          ],
        });
        autoSelectionFormula(ctx, cellInput, null, "SUM");
        expect(getFlowdata(ctx)[2][0].v).toBe("occupied");
        expect(ctx.warnDialog).toBe(noRoomMessage());
      });

      // Two ranges picked out with ctrl-click are not two passes over one
      // range: they are two separate requests, and one of them succeeding is
      // no reason to swallow the other one's refusal.
      test("still explains a refused range when a different range succeeded", () => {
        const cellInput = document.createElement("div");
        const ctx = contextFactory({
          luckysheet_select_save: [
            { row: [0, 1], column: [0, 0], row_focus: 0, column_focus: 0 },
            { row: [0, 2], column: [2, 2], row_focus: 0, column_focus: 2 },
          ],
          luckysheetfile: [
            {
              id: "id_1",
              data: [
                [
                  { v: "30", ct: { t: "n" }, m: "30" },
                  null,
                  { v: "30", ct: { t: "n" }, m: "30" },
                ],
                [
                  { v: "30", ct: { t: "n" }, m: "30" },
                  null,
                  { v: "40", ct: { t: "n" }, m: "40" },
                ],
                [null, null, { v: "50", ct: { t: "n" }, m: "50" }],
              ],
            },
          ],
        });
        autoSelectionFormula(ctx, cellInput, null, "SUM");
        // The first range had room and was totalled ...
        expect(getFlowdata(ctx)[2][0].v).toBe(60);
        // ... the second reached the last row, and still says so.
        expect(ctx.warnDialog).toBe(noRoomMessage());
      });
    });

    // Clicking a column header selects every row to the last one, which is an
    // ordinary thing to do and the very thing that ran the range off the end.
    // There is no real shortage of room in that case — the range is mostly the
    // blank cells below the data — so the result goes immediately after the
    // data, where a spreadsheet is expected to put it, and nothing is said.
    describe("a whole column with blank rows under the data", () => {
      const getWholeColumnContext = () =>
        contextFactory({
          luckysheet_select_save: selectionFactory([0, 5], [0, 0], 0, 0),
          luckysheetfile: [
            {
              id: "id_1",
              data: [
                [{ v: "Height", ct: { t: "s" }, m: "Height" }],
                [{ v: "30", ct: { t: "n" }, m: "30" }],
                [{ v: "40", ct: { t: "n" }, m: "40" }],
                [null],
                [null],
                [null],
              ],
            },
          ],
        });

      test("puts the total in the first blank cell under the data", () => {
        const cellInput = document.createElement("div");
        const ctx = getWholeColumnContext();
        autoSelectionFormula(ctx, cellInput, null, "SUM");
        const flowdata = getFlowdata(ctx);

        // immediately after the data, not at the foot of the selection
        expect(flowdata[3][0].v).toBe(70);
        expect(flowdata[5][0]).toBeNull();
      });

      // The range is trimmed to the data, so the formula reads A1:A3 and not
      // A1:A6 — it must not reach across the blanks it is being written into.
      test("totals the data rather than the whole selection", () => {
        const cellInput = document.createElement("div");
        const ctx = getWholeColumnContext();
        autoSelectionFormula(ctx, cellInput, null, "SUM");
        expect(getFlowdata(ctx)[3][0].f).toBe("=SUM(A1:A3)");
      });

      test("has nothing to explain, so says nothing", () => {
        const cellInput = document.createElement("div");
        const ctx = getWholeColumnContext();
        autoSelectionFormula(ctx, cellInput, null, "SUM");
        expect(ctx.warnDialog).toBeUndefined();
      });

      test("averages over the data only, ignoring the blanks", () => {
        const cellInput = document.createElement("div");
        const ctx = getWholeColumnContext();
        autoSelectionFormula(ctx, cellInput, null, "AVERAGE");
        expect(getFlowdata(ctx)[3][0].v).toBe(35);
      });
    });

    // A 2D selection is two independent passes over the same cells: rows
    // first, then columns. The trim above is per line, so on rows of unequal
    // length reaching the last column it placed each row's total at that row's
    // own last filled column — inside the selection — and the column pass then
    // read those totals as data. A row-header click and Ctrl+A both produce
    // exactly this selection.
    describe("a 2D selection whose rows have unequal extents", () => {
      const n = (v) => ({ v: `${v}`, ct: { t: "n" }, m: `${v}` });
      const getRaggedContext = () =>
        contextFactory({
          luckysheet_select_save: selectionFactory([0, 1], [0, 3], 0, 0),
          luckysheetfile: [
            {
              id: "id_1",
              data: [
                [n(1), n(2), n(3), null],
                [n(4), n(5), null, null],
                [null, null, null, null],
              ],
            },
          ],
        });

      test("writes no total inside the selected range", () => {
        const cellInput = document.createElement("div");
        const ctx = getRaggedContext();
        autoSelectionFormula(ctx, cellInput, null, "SUM");
        const flowdata = getFlowdata(ctx);

        // the selection is rows 0-1, columns 0-3; every cell of it that held
        // nothing must still hold nothing
        expect(flowdata[0][3]).toBeNull();
        expect(flowdata[1][2]).toBeNull();
        expect(flowdata[1][3]).toBeNull();
      });

      test("totals each column from the data alone", () => {
        const cellInput = document.createElement("div");
        const ctx = getRaggedContext();
        autoSelectionFormula(ctx, cellInput, null, "SUM");
        const flowdata = getFlowdata(ctx);

        expect(flowdata[2][0].v).toBe(5);
        expect(flowdata[2][1].v).toBe(7);
        // 3, not 12: the row totals are not in this column to be counted twice
        expect(flowdata[2][2].v).toBe(3);
        expect(flowdata[2][2].f).toBe("=SUM(C1:C2)");
        // and a column that held nothing gets no "total" of its own
        expect(flowdata[2][3]).toBeNull();
      });

      // The row pass genuinely had no room, but the column pass delivered, so
      // the usual withdrawal applies and the user is not told about a half
      // they did not ask for separately.
      test("stays quiet, because the column pass delivered", () => {
        const cellInput = document.createElement("div");
        const ctx = getRaggedContext();
        autoSelectionFormula(ctx, cellInput, null, "SUM");
        expect(ctx.warnDialog).toBeUndefined();
      });

      // The counter-path: the same 2D shape one column short of the edge has
      // room for both passes, and the row totals land outside the selection
      // where the column pass cannot see them.
      test("still totals both directions when there is room to the right", () => {
        const cellInput = document.createElement("div");
        const ctx = contextFactory({
          luckysheet_select_save: selectionFactory([0, 1], [0, 2], 0, 0),
          luckysheetfile: [
            {
              id: "id_1",
              data: [
                [n(1), n(2), n(3), null],
                [n(4), n(5), null, null],
                [null, null, null, null],
              ],
            },
          ],
        });
        autoSelectionFormula(ctx, cellInput, null, "SUM");
        const flowdata = getFlowdata(ctx);

        expect(flowdata[0][3].v).toBe(6);
        expect(flowdata[1][3].v).toBe(9);
        expect(flowdata[2][0].v).toBe(5);
        expect(flowdata[2][1].v).toBe(7);
        expect(flowdata[2][2].v).toBe(3);
      });
    });

    // A column of labels fits neither branch of singleFormulaInput, so it used
    // to fall straight out — no total, no message, nothing to tell the button
    // apart from a broken one.
    describe("a column with no numbers in it at all", () => {
      const getTextOnlyContext = () =>
        contextFactory({
          luckysheet_select_save: selectionFactory([0, 3], [0, 0], 0, 0),
          luckysheetfile: [
            {
              id: "id_1",
              data: [
                [{ v: "Name", ct: { t: "s" }, m: "Name" }],
                [{ v: "Ada", ct: { t: "s" }, m: "Ada" }],
                [{ v: "Grace", ct: { t: "s" }, m: "Grace" }],
                [null],
              ],
            },
          ],
        });

      test("says there is nothing to total rather than doing nothing", () => {
        const cellInput = document.createElement("div");
        const ctx = getTextOnlyContext();
        autoSelectionFormula(ctx, cellInput, null, "SUM");
        expect(ctx.warnDialog).toBe(
          locale({}).generalDialog.noNumericDataError
        );
      });

      test("writes no formula", () => {
        const cellInput = document.createElement("div");
        const ctx = getTextOnlyContext();
        autoSelectionFormula(ctx, cellInput, null, "SUM");
        expect(getFlowdata(ctx)[3][0]).toBeNull();
      });

      // One label column beside a numeric one must not nag: the user got the
      // total they asked for from the column that had numbers.
      test("stays quiet when a neighbouring column did have numbers", () => {
        const cellInput = document.createElement("div");
        const ctx = contextFactory({
          luckysheet_select_save: selectionFactory([0, 1], [0, 1], 0, 0),
          luckysheetfile: [
            {
              id: "id_1",
              data: [
                [
                  { v: "Ada", ct: { t: "s" }, m: "Ada" },
                  { v: "30", ct: { t: "n" }, m: "30" },
                  null,
                ],
                [
                  { v: "Grace", ct: { t: "s" }, m: "Grace" },
                  { v: "40", ct: { t: "n" }, m: "40" },
                  null,
                ],
                [null, null, null],
              ],
            },
          ],
        });
        autoSelectionFormula(ctx, cellInput, null, "SUM");
        expect(getFlowdata(ctx)[2][1].v).toBe(70);
        expect(ctx.warnDialog).toBeUndefined();
      });
    });
  });
});
