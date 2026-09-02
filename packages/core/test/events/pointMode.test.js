import { contextFactory, selectionFactory } from "../factories/context";
import { handleCellAreaMouseDown } from "../../src/events/mouse";
import { handleGlobalKeyDown } from "../../src/events/keyboard";
import { functionHTMLGenerate } from "../../src/modules/formula";
import { GRID_ROOT_CLASS } from "../../src/constants";

// Characterization tests for "point mode": picking a cell reference while a
// formula is being edited, instead of typing it. They pin the behaviour of the
// mouse driver so the shared entry point extracted for the keyboard driver can
// be shown not to change it.
describe("formula point mode", () => {
  const container = document.createElement("div");
  container.getBoundingClientRect = () => ({
    width: 1000,
    height: 400,
    left: 0,
    top: 0,
  });
  const cache = { editingCommentBoxEle: { dataset: { r: 0, c: 0 } } };

  let cellInput;
  let fxInput;

  const getContext = () =>
    contextFactory({
      luckysheet_select_save: selectionFactory([0, 0], [0, 0], 0, 0),
      luckysheetCellUpdate: [0, 0],
      formulaRangeHighlight: [],
    });

  // Put the caret at the end of the formula, the way the browser leaves it
  // after the user types the opening parenthesis.
  const editFormulaIn = (editor, text) => {
    editor.innerHTML = functionHTMLGenerate(text);
    const spans = editor.querySelectorAll("span");
    const lastText = spans[spans.length - 1].firstChild;
    const range = document.createRange();
    range.setStart(lastText, lastText.length);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const editFormula = (text) => editFormulaIn(cellInput, text);

  const clickCell = (ctx, pageX, pageY) => {
    const mouseEvent = new MouseEvent("click", { button: 0 });
    mouseEvent.pageX = pageX;
    mouseEvent.pageY = pageY;
    handleCellAreaMouseDown(
      ctx,
      cache,
      mouseEvent,
      cellInput,
      container,
      fxInput
    );
  };

  beforeEach(() => {
    document.body.innerHTML = "";
    cellInput = document.createElement("div");
    cellInput.id = "luckysheet-rich-text-editor";
    fxInput = document.createElement("div");
    fxInput.id = "luckysheet-functionbox-cell";
    document.body.appendChild(cellInput);
    document.body.appendChild(fxInput);
  });

  test("clicking a cell after '(' inserts its reference into the formula", () => {
    const ctx = getContext();
    editFormula("=SUM(");

    clickCell(ctx, 369, 79); // row 3, column 4 -> E4

    expect(cellInput.textContent).toBe("=SUM(E4");
    expect(fxInput.innerHTML).toBe(cellInput.innerHTML);
    expect(
      cellInput.querySelectorAll("span.fortune-formula-functionrange-cell")
    ).toHaveLength(1);
  });

  test("the inserted reference records the phantom selection and its overlay", () => {
    const ctx = getContext();
    editFormula("=SUM(");

    clickCell(ctx, 369, 79);

    expect(ctx.formulaCache.rangestart).toBe(true);
    expect(ctx.formulaCache.rangedrag_column_start).toBe(false);
    expect(ctx.formulaCache.rangedrag_row_start).toBe(false);
    expect(ctx.formulaCache.func_selectedrange).toEqual({
      left: 296,
      width: 73,
      top: 60,
      height: 19,
      left_move: 296,
      width_move: 73,
      top_move: 60,
      height_move: 19,
      row: [3, 3],
      column: [4, 4],
      row_focus: 3,
      column_focus: 4,
    });
    expect(ctx.formulaRangeSelect).toEqual({
      rangeIndex: ctx.formulaCache.rangechangeindex,
      left: 296,
      top: 60,
      width: 73,
      height: 19,
    });
    expect(ctx.formulaCache.selectingRangeIndex).toBe(
      ctx.formulaCache.rangechangeindex
    );
  });

  test("clicking a second cell replaces the reference rather than appending one", () => {
    const ctx = getContext();
    editFormula("=SUM(");

    clickCell(ctx, 369, 79); // E4
    clickCell(ctx, 295, 59); // row 2, column 3 -> D3

    expect(cellInput.textContent).toBe("=SUM(D3");
    expect(
      cellInput.querySelectorAll("span.fortune-formula-functionrange-cell")
    ).toHaveLength(1);
    expect(ctx.formulaCache.func_selectedrange).toMatchObject({
      row: [2, 2],
      column: [3, 3],
      left: 222,
      top: 40,
    });
  });

  // The keyboard half of point mode: the arrows pick a reference instead of
  // walking the caret through the formula text.
  describe("arrow keys", () => {
    let grid;

    const pressArrow = (ctx, key, target) => {
      target.focus();
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
      });
      target.dispatchEvent(event);
      handleGlobalKeyDown(
        ctx,
        cellInput,
        fxInput,
        event,
        { undoList: [], redoList: [] },
        () => {},
        () => {}
      );
      return event;
    };

    beforeEach(() => {
      // handleGlobalKeyDown only claims navigation keys raised inside the grid.
      grid = document.createElement("div");
      grid.className = GRID_ROOT_CLASS;
      document.body.appendChild(grid);
      grid.appendChild(cellInput);
      grid.appendChild(fxInput);
      cellInput.className = "luckysheet-cell-input";
      cellInput.tabIndex = 0;
      fxInput.tabIndex = 0;
    });

    test("the first arrow picks the cell next to the one being edited", () => {
      const ctx = getContext();
      ctx.luckysheetCellUpdate = [2, 2];
      editFormula("=SUM(");

      const event = pressArrow(ctx, "ArrowUp", cellInput);

      // Editing C3, so Up is C2 -- not C3, which would be circular.
      expect(cellInput.textContent).toBe("=SUM(C2");
      expect(event.defaultPrevented).toBe(true);
      expect(ctx.formulaCache.rangestart).toBe(true);
      expect(ctx.formulaCache.func_selectedrange).toMatchObject({
        row: [1, 1],
        column: [2, 2],
        row_focus: 1,
        column_focus: 2,
      });
    });

    test("a further arrow replaces the reference rather than appending one", () => {
      const ctx = getContext();
      ctx.luckysheetCellUpdate = [2, 2];
      editFormula("=SUM(");

      pressArrow(ctx, "ArrowUp", cellInput); // C2
      pressArrow(ctx, "ArrowUp", cellInput); // C1

      expect(cellInput.textContent).toBe("=SUM(C1");
      expect(
        cellInput.querySelectorAll("span.fortune-formula-functionrange-cell")
      ).toHaveLength(1);
    });

    test("the reference stops at the edge of the sheet, key still consumed", () => {
      const ctx = getContext();
      ctx.luckysheetCellUpdate = [2, 2];
      editFormula("=SUM(");

      pressArrow(ctx, "ArrowUp", cellInput); // C2
      pressArrow(ctx, "ArrowUp", cellInput); // C1
      const event = pressArrow(ctx, "ArrowUp", cellInput); // nowhere left to go

      expect(cellInput.textContent).toBe("=SUM(C1");
      expect(event.defaultPrevented).toBe(true);
    });

    test("hidden rows are stepped over, not landed on", () => {
      const ctx = getContext();
      ctx.luckysheetCellUpdate = [2, 2];
      ctx.config = { rowhidden: { 1: 0 } };
      editFormula("=SUM(");

      pressArrow(ctx, "ArrowUp", cellInput);

      expect(cellInput.textContent).toBe("=SUM(C1");
    });

    test("with the caret away from a reference position the arrows still move the caret", () => {
      const ctx = getContext();
      ctx.luckysheetCellUpdate = [2, 2];
      editFormula("=SUM(A1)");
      const before = cellInput.innerHTML;

      const event = pressArrow(ctx, "ArrowUp", cellInput);

      expect(cellInput.innerHTML).toBe(before);
      expect(ctx.formulaCache.rangestart).toBeFalsy();
      expect(event.defaultPrevented).toBe(false);
    });

    test("editing in the formula bar works the same and keeps focus there", () => {
      const ctx = getContext();
      ctx.luckysheetCellUpdate = [2, 2];
      editFormulaIn(fxInput, "=SUM(");

      pressArrow(ctx, "ArrowUp", fxInput);

      expect(fxInput.textContent).toBe("=SUM(C2");
      expect(cellInput.innerHTML).toBe(fxInput.innerHTML);
      // The tail of handleGlobalKeyDown pulls focus back to the in-cell editor.
      // Point mode returns before it, so the formula bar keeps the caret.
      expect(document.activeElement).toBe(fxInput);
    });

    test("a merged reference is stepped over, not re-entered", () => {
      const ctx = getContext();
      ctx.luckysheetCellUpdate = [3, 0];
      // B2:B3 merged, so a reference on it must move to B1 in one press.
      ctx.luckysheetfile[0].data[1][1] = { mc: { r: 1, c: 1, rs: 2, cs: 1 } };
      ctx.luckysheetfile[0].data[2][1] = { mc: { r: 1, c: 1 } };
      editFormula("=SUM(");

      pressArrow(ctx, "ArrowUp", cellInput); // A3
      pressArrow(ctx, "ArrowRight", cellInput); // B2:B3, the merge
      expect(cellInput.textContent).toBe("=SUM(B2:B3");

      pressArrow(ctx, "ArrowUp", cellInput);
      expect(cellInput.textContent).toBe("=SUM(B1");
    });
  });
});
