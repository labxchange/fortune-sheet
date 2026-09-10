import { contextFactory, selectionFactory } from "../factories/context";
import { handleGlobalKeyDown } from "../../src/events/keyboard";
import { GRID_ROOT_CLASS } from "../../src/constants";

// Keyboard auto-fill (Ctrl/Cmd+R, Ctrl/Cmd+D) has to offset formula references
// the same way dragging the fill handle does, because for a keyboard-only user
// it is the only fill available. These tests pin the reference rewriting: which
// parts move, which parts are anchored by `$`, and that columns advance in
// base-26 rather than by character code (the Z -> AA boundary).
describe("keyboard auto-fill formula references", () => {
  // The dispatcher only lets keys through when the event target resolves inside
  // the grid root, so the tests need that much real DOM.
  const buildDom = () => {
    const container = document.createElement("div");
    container.className = "fortune-container";
    const overlay = document.createElement("div");
    overlay.className = GRID_ROOT_CLASS;
    overlay.tabIndex = -1;
    const cellInput = document.createElement("div");
    cellInput.className = "luckysheet-cell-input";
    cellInput.tabIndex = 0;
    overlay.appendChild(cellInput);
    container.appendChild(overlay);
    document.body.appendChild(container);
    return { cellInput };
  };

  const press = (ctx, cellInput, init) => {
    cellInput.focus();
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ...init,
    });
    cellInput.dispatchEvent(event);
    handleGlobalKeyDown(
      ctx,
      cellInput,
      document.createElement("div"),
      event,
      { undoList: [], redoList: [] },
      () => {},
      () => {}
    );
  };

  // Wide enough to cross the Z -> AA boundary (32 columns reaches AF, the last
  // column the reported sim task fills through).
  const COLUMNS = 32;
  const ROWS = 4;

  const emptyGrid = () =>
    Array.from({ length: ROWS }, () =>
      Array.from({ length: COLUMNS }, () => null)
    );

  /**
   * Seed `formula` into the cell at (row, column) and fill it rightwards across
   * `[column, lastColumn]`, returning the formulas the fill produced.
   */
  const fillRight = (formula, { row = 0, column = 1, lastColumn = 4 } = {}) => {
    const { cellInput } = buildDom();
    const data = emptyGrid();
    data[row][column] = { v: 0, f: formula };

    const ctx = contextFactory({
      luckysheetCellUpdate: [],
      luckysheet_select_save: selectionFactory(
        [row, row],
        [column, lastColumn],
        row,
        column
      ),
    });
    ctx.luckysheetfile[0].data = data;

    press(ctx, cellInput, { key: "r", code: "KeyR", ctrlKey: true });

    const filled = ctx.luckysheetfile[0].data[row];
    return filled.slice(column, lastColumn + 1).map((cell) => cell?.f);
  };

  /**
   * Seed `formula` into the cell at (row, column) and fill it downwards across
   * `[row, lastRow]`, returning the formulas the fill produced.
   */
  const fillDown = (formula, { row = 0, column = 1, lastRow = 3 } = {}) => {
    const { cellInput } = buildDom();
    const data = emptyGrid();
    data[row][column] = { v: 0, f: formula };

    const ctx = contextFactory({
      luckysheetCellUpdate: [],
      luckysheet_select_save: selectionFactory(
        [row, lastRow],
        [column, column],
        row,
        column
      ),
    });
    ctx.luckysheetfile[0].data = data;

    press(ctx, cellInput, { key: "d", code: "KeyD", ctrlKey: true });

    return ctx.luckysheetfile[0].data
      .slice(row, lastRow + 1)
      .map((cells) => cells[column]?.f);
  };

  /**
   * Seed one formula per row into `column` and fill the whole block rightwards
   * across `[column, lastColumn]`, returning a row-per-entry array of the
   * formulas the fill produced.
   */
  const fillRightBlock = (formulas, { column = 1, lastColumn = 4 } = {}) => {
    const { cellInput } = buildDom();
    const data = emptyGrid();
    formulas.forEach((formula, row) => {
      data[row][column] = { v: 0, f: formula };
    });

    const ctx = contextFactory({
      luckysheetCellUpdate: [],
      luckysheet_select_save: selectionFactory(
        [0, formulas.length - 1],
        [column, lastColumn],
        0,
        column
      ),
    });
    ctx.luckysheetfile[0].data = data;

    press(ctx, cellInput, { key: "r", code: "KeyR", ctrlKey: true });

    return ctx.luckysheetfile[0].data
      .slice(0, formulas.length)
      .map((cells) =>
        cells.slice(column, lastColumn + 1).map((cell) => cell?.f)
      );
  };

  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("fill right keeps a $-anchored column fixed while advancing the relative one", () => {
    expect(fillRight("=B2/$B2")).toEqual([
      "=B2/$B2",
      "=C2/$B2",
      "=D2/$B2",
      "=E2/$B2",
    ]);
  });

  // The reported sim task fills from B through AF, so the fill has to keep
  // counting past the single-letter columns. Character-code arithmetic yields
  // "[" here, which is the second symptom in the bug report.
  test("fill right carries the column past Z into AA and AB", () => {
    const filled = fillRight("=B2/$B2", { lastColumn: 27 });

    expect(filled.slice(-3)).toEqual(["=Z2/$B2", "=AA2/$B2", "=AB2/$B2"]);
  });

  // The reported sim task fills a multi-row block (B18:B32 -> AF18:AF32) rather
  // than a single row, and a block takes a different grouping route through
  // `getCopyData`. Each row has to offset from its own source formula instead of
  // the block being treated as one series.
  test("fill right offsets each row of a block from its own formula", () => {
    expect(
      fillRightBlock(["=A1*2", "=A2+1", "=A3-3"], { lastColumn: 3 })
    ).toEqual([
      ["=A1*2", "=B1*2", "=C1*2"],
      ["=A2+1", "=B2+1", "=C2+1"],
      ["=A3-3", "=B3-3", "=C3-3"],
    ]);
  });

  // A `$` on the row anchors the row, and says nothing about the column, so a
  // rightward fill must still advance the column of `C$2`.
  test("fill right advances the column of a row-anchored reference", () => {
    expect(fillRight("=C$2", { lastColumn: 3 })).toEqual([
      "=C$2",
      "=D$2",
      "=E$2",
    ]);
  });

  test("fill right leaves a fully anchored reference untouched", () => {
    expect(fillRight("=$B$2", { lastColumn: 3 })).toEqual([
      "=$B$2",
      "=$B$2",
      "=$B$2",
    ]);
  });

  // Fill down is not part of the reported bug; these pin its behaviour so the
  // shared reference-offsetting work cannot regress the direction that works.
  test("fill down advances the row and keeps a $-anchored column", () => {
    expect(fillDown("=B1/$B1")).toEqual([
      "=B1/$B1",
      "=B2/$B2",
      "=B3/$B3",
      "=B4/$B4",
    ]);
  });

  test("fill down leaves a row-anchored reference fixed", () => {
    expect(fillDown("=B$1", { lastRow: 2 })).toEqual(["=B$1", "=B$1", "=B$1"]);
  });

  // Sharing the fill handle's path means an empty source clears the range it
  // fills instead of leaving it alone, which is what Excel, Google Sheets and
  // dragging the handle all do, and undo recovers it. Pinned so the behaviour
  // is a decision rather than an accident.
  test("fill down from an empty source clears the cells below it", () => {
    const { cellInput } = buildDom();
    const data = emptyGrid();
    data[1][1] = { v: 1, m: "1", ct: { fa: "General", t: "n" } };
    data[2][1] = { v: 2, m: "2", ct: { fa: "General", t: "n" } };
    data[3][1] = { v: 3, m: "3", ct: { fa: "General", t: "n" } };

    const ctx = contextFactory({
      luckysheetCellUpdate: [],
      luckysheet_select_save: selectionFactory([0, 3], [1, 1], 0, 1),
    });
    ctx.luckysheetfile[0].data = data;

    press(ctx, cellInput, { key: "d", code: "KeyD", ctrlKey: true });

    expect(
      ctx.luckysheetfile[0].data.slice(0, 4).map((cells) => cells[1])
    ).toEqual([null, null, null, null]);
  });

  // Auto-fill also carries plain values, and a single seed cell must be copied
  // rather than extrapolated into a series — a lone `5` filled right is five
  // fives, not 5, 6, 7. Guarding it because this is the behaviour most at risk
  // from routing the shortcut through the fill handle's path.
  describe("plain values", () => {
    const fillRightValues = ({ lastColumn = 4 } = {}) => {
      const { cellInput } = buildDom();
      const data = emptyGrid();
      data[0][1] = { v: 5, m: "5", ct: { fa: "General", t: "n" } };

      const ctx = contextFactory({
        luckysheetCellUpdate: [],
        luckysheet_select_save: selectionFactory([0, 0], [1, lastColumn], 0, 1),
      });
      ctx.luckysheetfile[0].data = data;

      press(ctx, cellInput, { key: "r", code: "KeyR", ctrlKey: true });

      return ctx.luckysheetfile[0].data[0]
        .slice(1, lastColumn + 1)
        .map((cell) => cell?.v);
    };

    test("fill right copies a single seeded number across", () => {
      expect(fillRightValues()).toEqual([5, 5, 5, 5]);
    });
  });
});
