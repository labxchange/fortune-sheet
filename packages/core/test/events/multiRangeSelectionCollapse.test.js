import { contextFactory } from "../factories/context";
import { handleArrowKey, handleGlobalKeyDown } from "../../src/events/keyboard";
import { GRID_ROOT_CLASS } from "../../src/constants";

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

  const keydownInGrid = (key, init = {}) => {
    const grid = document.createElement("div");
    grid.className = GRID_ROOT_CLASS;
    document.body.appendChild(grid);
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
});
