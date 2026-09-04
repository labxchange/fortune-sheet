import { contextFactory } from "../factories/context";
import { handleArrowKey, handleGlobalKeyDown } from "../../src/events/keyboard";
import { GRID_ROOT_CLASS } from "../../src/constants";
import {
  endSelectionModeOnFocusLeave,
  moveHighlightCell,
} from "../../src/modules/selection";

/**
 * Moving the highlight cell is how a keyboard user says "I am somewhere else
 * now", so it has to leave one cell selected. It used to collapse only the last
 * range of `luckysheet_select_save`, which stranded every earlier range of a
 * multi-range selection on the sheet with no key that could clear it.
 */
describe("multi-range selection collapses when the highlight cell moves", () => {
  // Two whole columns, as ctrl-clicking two column headers produces.
  const twoRanges = () => [
    { row: [0, 3], column: [0, 0], row_focus: 0, column_focus: 0 },
    { row: [0, 3], column: [2, 2], row_focus: 0, column_focus: 2 },
  ];

  const getContext = (selection) =>
    contextFactory({
      luckysheetCellUpdate: [],
      luckysheet_select_save: selection,
    });

  // `handleGlobalKeyDown` filters on the target carrying the grid class, so
  // each event needs a stub that does. Torn down after every test rather than
  // left in the shared document, where they would pile up across the file.
  const grids = [];

  afterEach(() => {
    while (grids.length) grids.pop().remove();
  });

  const keydownInGrid = (key, init = {}) => {
    const grid = document.createElement("div");
    grid.className = GRID_ROOT_CLASS;
    document.body.appendChild(grid);
    grids.push(grid);
    const event = new KeyboardEvent("keydown", { key, ...init });
    Object.defineProperty(event, "target", { value: grid });
    return event;
  };

  test("an arrow key leaves only the cell it moved to selected", () => {
    const ctx = getContext(twoRanges());

    handleArrowKey(ctx, new KeyboardEvent("keydown", { key: "ArrowDown" }));

    expect(ctx.luckysheet_select_save).toHaveLength(1);
    expect(ctx.luckysheet_select_save[0].row).toEqual([1, 1]);
    expect(ctx.luckysheet_select_save[0].column).toEqual([2, 2]);
  });

  test("Tab leaves only the cell it moved to selected", () => {
    const ctx = getContext(twoRanges());

    handleGlobalKeyDown(
      ctx,
      document.createElement("div"),
      null,
      keydownInGrid("Tab"),
      undefined,
      () => {},
      () => {}
    );

    expect(ctx.luckysheet_select_save).toHaveLength(1);
    expect(ctx.luckysheet_select_save[0].column).toEqual([3, 3]);
  });

  test("a single range still collapses to the cell it moved to", () => {
    const ctx = getContext([
      { row: [0, 3], column: [1, 1], row_focus: 0, column_focus: 1 },
    ]);

    handleArrowKey(ctx, new KeyboardEvent("keydown", { key: "ArrowDown" }));

    expect(ctx.luckysheet_select_save).toHaveLength(1);
    expect(ctx.luckysheet_select_save[0].row).toEqual([1, 1]);
  });

  test("Shift+F8 selection mode is exempt: it exists to move the new range", () => {
    const ctx = getContext(twoRanges());
    ctx.selectionModeActive = true;

    handleArrowKey(ctx, new KeyboardEvent("keydown", { key: "ArrowDown" }));

    expect(ctx.luckysheet_select_save).toHaveLength(2);
    expect(ctx.luckysheet_select_save[0].row).toEqual([0, 3]);
    expect(ctx.luckysheet_select_save[1].row).toEqual([1, 1]);
  });

  // The Escape-out-of-an-edit paths land back on the cell the edit started
  // from and say so with `keepSelection`: Escape abandons the typing, it does
  // not rearrange what was selected before the typing started. Asserted on
  // `moveHighlightCell` itself because that is where the decision lives — the
  // two callers that reach it are `FxEditor`'s and `InputBox`'s own Escape
  // handlers (`handleGlobalKeyDown`'s copy is unreachable: its own
  // `luckysheetCellUpdate.length > 0` filter returns on Escape first).
  test("keepSelection keeps every range", () => {
    const ctx = getContext(twoRanges());

    moveHighlightCell(ctx, "down", 0, "rangeOfSelect", true);

    expect(ctx.luckysheet_select_save).toHaveLength(2);
    expect(ctx.luckysheet_select_save[0].column).toEqual([0, 0]);
    expect(ctx.luckysheet_select_save[1].column).toEqual([2, 2]);
    // And the highlight really did stay put.
    expect(ctx.luckysheet_select_save[1].row).toEqual([0, 0]);
  });

  // The exemption is the caller's intent, not the distance travelled, and
  // these two guard the difference. A zero index is no synonym for "nothing
  // moved": Ctrl+Arrow computes its own as `selectedLimit - curr`, which is
  // exactly 0 once the focus cell already sits on the sheet's last row or
  // column.
  test("a zero index without keepSelection still collapses", () => {
    const ctx = getContext(twoRanges());

    moveHighlightCell(ctx, "down", 0, "rangeOfSelect");

    expect(ctx.luckysheet_select_save).toHaveLength(1);
    expect(ctx.luckysheet_select_save[0].column).toEqual([2, 2]);
  });

  // And the other direction: an arrow into the edge of the grid passes a
  // non-zero index that clamps straight back onto the cell it started from.
  // Still an ordinary keypress, so it still has to clear the selection —
  // otherwise the key stops working at precisely the four edges.
  test("an arrow that clamps at the edge of the grid still collapses", () => {
    const ctx = getContext([
      { row: [0, 3], column: [0, 0], row_focus: 0, column_focus: 0 },
      { row: [0, 0], column: [2, 2], row_focus: 0, column_focus: 2 },
    ]);

    handleArrowKey(ctx, new KeyboardEvent("keydown", { key: "ArrowUp" }));

    expect(ctx.luckysheet_select_save).toHaveLength(1);
    expect(ctx.luckysheet_select_save[0].row).toEqual([0, 0]);
  });

  test("Shift+Arrow extends instead of moving, so it keeps every range", () => {
    const ctx = getContext(twoRanges());

    handleGlobalKeyDown(
      ctx,
      document.createElement("div"),
      null,
      keydownInGrid("ArrowDown", { shiftKey: true }),
      undefined,
      () => {},
      () => {}
    );

    expect(ctx.luckysheet_select_save).toHaveLength(2);
  });

  /**
   * The reported flow, and the reason the Shift+F8 exemption above needed an
   * end as well as a start. A keyboard user builds the selection with Shift+F8,
   * graphs it, removes the graph, and comes back: the flag was still set, the
   * exemption still applied, and the ranges the graph left behind could not be
   * cleared by any key.
   */
  describe("after focus has left the grid and come back", () => {
    test("the ranges survive the trip but the next move clears them", () => {
      const ctx = getContext(twoRanges());
      ctx.selectionModeActive = true;

      // Focus goes to the graph card, then the card is removed and focus
      // returns to the sheet.
      endSelectionModeOnFocusLeave(ctx);

      // Preserved on arrival — the graph was built from them, and the ticket
      // asks for them to still be there.
      expect(ctx.luckysheet_select_save).toHaveLength(2);

      handleArrowKey(ctx, new KeyboardEvent("keydown", { key: "ArrowDown" }));

      expect(ctx.luckysheet_select_save).toHaveLength(1);
      expect(ctx.luckysheet_select_save[0].column).toEqual([2, 2]);
    });

    test("Tab clears them too", () => {
      const ctx = getContext(twoRanges());
      ctx.selectionModeActive = true;

      endSelectionModeOnFocusLeave(ctx);
      handleGlobalKeyDown(
        ctx,
        document.createElement("div"),
        null,
        keydownInGrid("Tab"),
        undefined,
        () => {},
        () => {}
      );

      expect(ctx.luckysheet_select_save).toHaveLength(1);
    });

    test("it ends the mode without collapsing, unlike Escape", () => {
      const ctx = getContext(twoRanges());
      ctx.selectionModeActive = true;

      endSelectionModeOnFocusLeave(ctx);

      expect(ctx.selectionModeActive).toBe(false);
      // exitSelectionMode would have left one range here.
      expect(ctx.luckysheet_select_save).toHaveLength(2);
    });
  });
});
