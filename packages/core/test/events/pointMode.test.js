import { contextFactory, selectionFactory } from "../factories/context";
import { handleCellAreaMouseDown } from "../../src/events/mouse";
import { functionHTMLGenerate } from "../../src/modules/formula";

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
  const editFormula = (text) => {
    cellInput.innerHTML = functionHTMLGenerate(text);
    const spans = cellInput.querySelectorAll("span");
    const lastText = spans[spans.length - 1].firstChild;
    const range = document.createRange();
    range.setStart(lastText, lastText.length);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  };

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
});
