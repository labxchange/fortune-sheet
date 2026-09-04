import React from "react";
import { render, act } from "@testing-library/react";
import { produce } from "immer";
import {
  defaultContext,
  defaultSettings,
  functionHTMLGenerate,
  Context,
} from "@fortune-sheet/core";
import WorkbookContext from "../src/context";
import FxEditor from "../src/components/FxEditor";

// FxEditor drives point mode itself: the grid's key handler hands every key
// straight back to a text-entry target outside the grid, and Left/Right are
// stopPropagation()ed before that even matters. So the formula bar resolves the
// step in the event handler, cancels the key on that resolution, and applies
// that same object inside the setContext producer.
//
// The core suite covers resolvePointModeStep and applyPointModeStep directly.
// What only a component test can cover is the seam between them -- that the
// resolve happens during the dispatch and the apply happens later, against
// whatever the producer is handed rather than against a re-read of the caret.
// `setContext` here is deliberately controllable on that axis: `flush()` runs
// the captured recipe when the test says to, which is what lets the deferred
// case be written down at all.
describe("FxEditor point mode", () => {
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

  const setup = ({
    editing = [2, 2] as any[],
    selection = {
      row: [2, 2],
      column: [2, 2],
      row_focus: 2,
      column_focus: 2,
    } as any,
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
          [null, null, null, null],
          [null, null, null, null],
          [null, null, null, null],
          [null, null, null, null],
        ],
      },
    ] as any;
    ctx.luckysheet_select_save = [selection];
    ctx.luckysheetCellUpdate = editing;
    ctx.visibledatarow = [20, 40, 60, 80, 100];
    ctx.visibledatacolumn = [74, 148, 222, 296, 370];
    ctx.config = {};

    // The cell editor is InputBox's element, which is not rendered here, so it
    // is supplied directly -- applyPointModeStep writes the formula there and
    // mirrors it into the formula bar.
    const cellInput = document.createElement("div");
    cellInput.id = "luckysheet-rich-text-editor";
    document.body.appendChild(cellInput);
    refs.cellInput.current = cellInput;

    let deferred = false;
    const queue: ((draft: Context) => void)[] = [];
    const setContext = (recipe: (draft: Context) => void) => {
      if (deferred) {
        queue.push(recipe);
        return;
      }
      produce(ctx, recipe);
    };
    const flush = () => {
      while (queue.length) produce(ctx, queue.shift()!);
    };

    const value = {
      context: ctx,
      setContext,
      settings: defaultSettings,
      refs,
      handleUndo: () => {},
      handleRedo: () => {},
    } as any;

    render(
      <WorkbookContext.Provider value={value}>
        <FxEditor />
      </WorkbookContext.Provider>
    );

    const fxInput = refs.fxInput.current!;

    // Type a formula into the formula bar and leave the caret where the browser
    // leaves it after the opening parenthesis. Done after render because the
    // mount effect rewrites fxInput's markup from the cell's value.
    const typeFormula = (text: string) => {
      fxInput.innerHTML = functionHTMLGenerate(text);
      const spans = fxInput.querySelectorAll("span");
      const lastText = spans[spans.length - 1].firstChild!;
      const range = document.createRange();
      range.setStart(lastText, lastText.textContent!.length);
      range.collapse(true);
      const selectionObj = window.getSelection()!;
      selectionObj.removeAllRanges();
      selectionObj.addRange(range);
      fxInput.focus();
    };

    return {
      ctx,
      refs,
      cellInput,
      fxInput,
      typeFormula,
      flush,
      defer: () => {
        deferred = true;
      },
      pending: () => queue.length,
    };
  };

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("an arrow is cancelled during the dispatch, before the producer runs", () => {
    const t = setup();
    // Deferred only from here on: focusing the formula bar makes onFocus queue
    // a setContext of its own, and this test counts what is outstanding.
    t.typeFormula("=SUM(");
    t.defer();

    const event = new KeyboardEvent("keydown", {
      key: "ArrowUp",
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      t.fxInput.dispatchEvent(event);
    });

    // preventDefault cannot be deferred -- it has to be issued while the event
    // is still being dispatched -- so the decision that governs it has to be
    // taken in the handler. This asserts the order: cancelled already, with the
    // producer still unrun.
    expect(event.defaultPrevented).toBe(true);
    expect(t.pending()).toBe(1);
    expect(t.cellInput.textContent).toBe("");

    act(() => {
      t.flush();
    });

    expect(t.fxInput.textContent).toBe("=SUM(C2");
    expect(t.cellInput.innerHTML).toBe(t.fxInput.innerHTML);
    expect(t.ctx.formulaCache.rangestart).toBe(true);
  });

  test("the pick survives the producer running after the caret has moved", () => {
    const t = setup();
    // Deferred only from here on: focusing the formula bar makes onFocus queue
    // a setContext of its own, and this test counts what is outstanding.
    t.typeFormula("=SUM(");
    t.defer();

    const event = new KeyboardEvent("keydown", {
      key: "ArrowUp",
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      t.fxInput.dispatchEvent(event);
    });

    // The load-bearing case, and the reason the resolve sits outside the
    // producer. Between the keydown and the producer, move the caret to the
    // very start of the formula -- a position where no reference may go. If the
    // step or the caret test were re-read inside the producer, this is where it
    // would read the moved caret and either decline after the key had already
    // been cancelled, or write the reference somewhere else. Because the whole
    // decision was resolved at keydown and handed over as a value, the pick is
    // unaffected.
    const spans = t.fxInput.querySelectorAll("span");
    const firstText = spans[0].firstChild!;
    const range = document.createRange();
    range.setStart(firstText, 0);
    range.collapse(true);
    const selectionObj = window.getSelection()!;
    selectionObj.removeAllRanges();
    selectionObj.addRange(range);

    act(() => {
      t.flush();
    });

    expect(t.fxInput.textContent).toBe("=SUM(C2");
    expect(t.ctx.formulaCache.rangestart).toBe(true);
  });

  test.each(["ArrowUp", "ArrowLeft"])(
    "%s at the edge of the sheet keeps its ordinary meaning",
    (key) => {
      const t = setup({
        editing: [0, 0],
        selection: {
          row: [0, 0],
          column: [0, 0],
          row_focus: 0,
          column_focus: 0,
        },
      });
      t.typeFormula("=SUM(");

      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        t.fxInput.dispatchEvent(event);
      });

      // Editing A1, so there is nowhere to step. The regression this closes was
      // cancelling on "a reference may go here" alone: the key was consumed and
      // nothing replaced it, so the caret sat still in the formula bar. It must
      // be left to the browser instead.
      expect(event.defaultPrevented).toBe(false);
      expect(t.fxInput.textContent).toBe("=SUM(");
      expect(t.ctx.formulaCache.rangestart).toBeFalsy();
    }
  );

  test.each([
    ["shiftKey", { shiftKey: true }],
    ["ctrlKey", { ctrlKey: true }],
    ["metaKey", { metaKey: true }],
  ])("%s + ArrowLeft does its ordinary text-editing job", (_name, modifier) => {
    const t = setup();
    t.typeFormula("=SUM(");

    const event = new KeyboardEvent("keydown", {
      key: "ArrowLeft",
      bubbles: true,
      cancelable: true,
      ...modifier,
    });
    act(() => {
      t.fxInput.dispatchEvent(event);
    });

    // The formula bar switches on `key` alone, so without the modifier filter
    // living in the shared gate, Shift+Left here selected no text and wrote a
    // reference instead. The grid never had the problem because it filters
    // modifiers upstream of its arrow branch.
    expect(event.defaultPrevented).toBe(false);
    expect(t.fxInput.textContent).toBe("=SUM(");
    expect(t.ctx.formulaCache.rangestart).toBeFalsy();
  });

  test("a selection with no focus cell yields no reference", () => {
    // Reachability for the non-finite seed. onFocus writes
    // `[row_focus, column_focus]` into luckysheetCellUpdate with no nil check,
    // and row_focus/column_focus are optional on the Selection type, so this is
    // the route by which `[undefined, undefined]` becomes the cell being
    // edited. Arithmetic on it is NaN, and NaN fails both of
    // stepToVisibleIndex's bounds tests, so before the finite guard the step
    // came back as a valid target and wrote a reference at row NaN.
    const t = setup({
      editing: [undefined, undefined],
      selection: { row: [2, 2], column: [2, 2] },
    });
    t.typeFormula("=SUM(");

    const event = new KeyboardEvent("keydown", {
      key: "ArrowUp",
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      t.fxInput.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
    expect(t.fxInput.textContent).toBe("=SUM(");
    expect(t.fxInput.textContent).not.toContain("NaN");
    expect(t.ctx.formulaCache.rangestart).toBeFalsy();
  });
});
