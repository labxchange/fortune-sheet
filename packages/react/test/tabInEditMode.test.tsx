import React from "react";
import { render, fireEvent, act } from "@testing-library/react";
import { produce } from "immer";
import {
  defaultContext,
  defaultSettings,
  functionHTMLGenerate,
  Context,
} from "@fortune-sheet/core";
import Workbook from "../src/components/Workbook";
import WorkbookContext from "../src/context";
import InputBox from "../src/components/SheetOverlay/InputBox";

// Tab while editing has two jobs, and exactly one of them may run per
// keystroke: accept the highlighted formula suggestion, or commit the edit and
// move to the next cell. InputBox used to take the key unconditionally, which
// made Tab dead in edit mode whenever no suggestion was open.
//
// The suggestion cases render InputBox against a context built here, because
// "a suggestion is open" is now a piece of state (`functionCandidates`) rather
// than a DOM class. They used to be written by appending a div carrying
// `luckysheet-formula-search-item-active` to the body, which stood in for an
// open list only for as long as the highlight lived in the DOM -- and which
// would have gone on passing after the accept path stopped reading it.
describe("Tab while a cell is being edited", () => {
  const makeRefs = () => ({
    globalCache: { undoList: [], redoList: [] },
    cellInput: React.createRef<HTMLDivElement | null>(),
    fxInput: React.createRef<HTMLDivElement | null>(),
    canvas: React.createRef<HTMLCanvasElement | null>(),
    scrollbarX: React.createRef<HTMLDivElement | null>(),
    scrollbarY: React.createRef<HTMLDivElement | null>(),
    cellArea: React.createRef<HTMLDivElement | null>(),
    workbookContainer: React.createRef<HTMLDivElement | null>(),
  });

  /**
   * InputBox with a live edit session and, optionally, an open suggestion list.
   *
   * `typed` seeds the editor the way the browser leaves it mid-formula: the
   * tokenised markup `handleFormulaInput` produces, and the caret at the end.
   * Only `innerHTML` is assigned -- this jsdom implements `innerText` in both
   * directions, so the getter already derives from the markup, and assigning
   * it too would replace the spans with one text node and leave the caret
   * nowhere to sit.
   */
  const setupSuggestions = ({
    candidates = [] as any[],
    index = 0,
    typed = "=AV",
  } = {}) => {
    const refs = makeRefs();
    const ctx = defaultContext(refs as any) as Context;
    ctx.allowEdit = true;
    ctx.currentSheetId = "sheet-1";
    ctx.luckysheetfile = [
      {
        id: "sheet-1",
        name: "Sheet1",
        order: 0,
        data: [
          [null, null, null],
          [null, null, null],
          [null, null, null],
        ],
      },
    ] as any;
    ctx.luckysheet_select_save = [
      { row: [1, 1], column: [1, 1], row_focus: 1, column_focus: 1 } as any,
    ];
    ctx.luckysheetCellUpdate = [1, 1];
    ctx.visibledatarow = [20, 40, 60];
    ctx.visibledatacolumn = [74, 148, 222];
    ctx.config = {};
    ctx.functionCandidates = candidates;
    ctx.functionCandidatesIndex = index;

    const setContext = (recipe: (draft: Context) => void) => {
      produce(ctx, recipe);
    };

    const fxInput = document.createElement("div");
    fxInput.id = "luckysheet-functionbox-cell";
    document.body.appendChild(fxInput);
    refs.fxInput.current = fxInput;

    const value = {
      context: ctx,
      setContext,
      settings: defaultSettings,
      refs,
      handleUndo: () => {},
      handleRedo: () => {},
    } as any;

    const { container } = render(
      <WorkbookContext.Provider value={value}>
        <InputBox />
      </WorkbookContext.Provider>
    );

    const cellInput = container.querySelector<HTMLElement>(
      "#luckysheet-rich-text-editor"
    )!;
    cellInput.innerHTML = functionHTMLGenerate(typed);

    const spans = cellInput.querySelectorAll("span");
    const lastText = spans[spans.length - 1]?.firstChild;
    if (lastText) {
      const range = document.createRange();
      range.setStart(lastText, lastText.textContent!.length);
      range.collapse(true);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    }

    return { ctx, cellInput, fxInput };
  };

  const createKey = (key: string) =>
    new KeyboardEvent("keydown", {
      key,
      code: key,
      bubbles: true,
      cancelable: true,
    });

  it("is left to the grid when no suggestion is open", () => {
    const { container } = render(
      <Workbook lang="en" data={[{ name: "Sheet1" } as any]} />
    );
    const cellInput = container.querySelector<HTMLElement>(
      "#luckysheet-rich-text-editor"
    )!;
    const fx = container.querySelector<HTMLElement>(
      "#luckysheet-functionbox-cell"
    )!;
    act(() => {
      fireEvent.pointerDown(fx);
      fireEvent.focus(fx);
    });

    const event = createKey("Tab");
    cellInput.dispatchEvent(event);

    // InputBox must not consume it: swallowing the key here is what stopped
    // the grid ever seeing it.
    expect(event.defaultPrevented).toBe(false);
  });

  it("is consumed when a suggestion is open, and accepts it", () => {
    const { cellInput } = setupSuggestions({
      candidates: [{ n: "AVERAGE", d: "Returns the average" }],
    });

    const event = createKey("Tab");
    act(() => {
      cellInput.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    // The accept itself, not merely the key being taken. The old version of
    // this test asserted only that the name box had not moved, which a Tab
    // that did nothing at all also satisfies.
    expect(cellInput.innerText).toBe("=AVERAGE(");
  });

  it("accepts the highlighted suggestion, not the first one", () => {
    const { cellInput } = setupSuggestions({
      candidates: [{ n: "AVERAGEIFS" }, { n: "AVERAGEIF" }, { n: "AVERAGE" }],
      index: 2,
    });

    act(() => {
      cellInput.dispatchEvent(createKey("Tab"));
    });

    // The reported defect in miniature: `=AV` offers AVERAGEIFS first, so a
    // learner who moves to AVERAGE and accepts must get AVERAGE. Reading the
    // highlight from a DOM class made this the one thing a re-render could
    // silently undo.
    expect(cellInput.innerText).toBe("=AVERAGE(");
  });

  it("is left to the grid when the highlighted suggestion has no name", () => {
    // A list that is open but whose highlighted entry carries no function name
    // -- the modern form of the mismatch the DOM version hid. If consuming Tab
    // ever drifted back to matching on "is a list open" rather than on there
    // being something to insert, this would swallow the key with no effect:
    // the dead-Tab-in-edit-mode bug this whole feature exists to fix, reached
    // by a narrower route.
    const { cellInput } = setupSuggestions({ candidates: [{ d: "no name" }] });

    const event = createKey("Tab");
    act(() => {
      cellInput.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
    expect(cellInput.innerText).toBe("=AV");
  });

  it("mirrors the accepted formula into the formula bar", () => {
    const { cellInput, fxInput } = setupSuggestions({
      candidates: [{ n: "AVERAGE" }],
    });

    act(() => {
      cellInput.dispatchEvent(createKey("Tab"));
    });

    // The bar used to keep showing the fragment the learner had typed while
    // the cell showed the accepted function, because the old accept path never
    // called handleFormulaInput and so never wrote to `$copyTo`.
    expect(fxInput.innerHTML).toContain("AVERAGE");
    expect(fxInput.innerHTML).not.toBe("=AV");
  });

  // The grid side of Tab -- moving the selection, and committing an open edit
  // before it does -- is covered directly in
  // packages/core/test/events/keyboard.test.js ("tab in edit mode"), where
  // handleGlobalKeyDown is invoked without the react layer in between. Asserting
  // it again from here would be testing jsdom's event plumbing, not the grid.
});
