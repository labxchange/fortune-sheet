import React from "react";
import { render, fireEvent, act } from "@testing-library/react";
import { produce } from "immer";
import { defaultContext, defaultSettings, Context } from "@fortune-sheet/core";
import WorkbookContext from "../src/context";
import FxEditor from "../src/components/FxEditor";
import InputBox from "../src/components/SheetOverlay/InputBox";

// The formula bar renders the same suggestion listbox the cell input does, but
// it had no status region of its own: `formulaSuggestionsAvailable` had exactly
// one reader repo-wide, which was `InputBox`. So on the bar the list appeared,
// was fully present in the accessibility tree, and nothing said so -- the same
// WCAG 4.1.3 gap the cell input had already closed.
//
// `functionCandidates` is a single global field with no record of which editor
// filled it, so the fix cannot simply mount a second always-on region: that
// would announce every cell-input list twice over. Both regions are gated on
// their own editor holding focus, which is the condition that already gates
// each copy of the list.
describe("formula bar suggestion announcement", () => {
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

  const CANDIDATES = [
    { n: "AVERAGE", d: "Returns the average" },
    { n: "AVERAGEA", d: "Returns the average of values" },
    { n: "AVERAGEIF", d: "Conditional average" },
  ] as any[];

  const setup = ({ candidates = CANDIDATES, withCellInput = false } = {}) => {
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
        ],
      },
    ] as any;
    ctx.luckysheet_select_save = [
      { row: [1, 1], column: [1, 1], row_focus: 1, column_focus: 1 } as any,
    ];
    ctx.visibledatarow = [20, 40];
    ctx.visibledatacolumn = [74, 148];
    ctx.config = {};
    ctx.functionCandidates = candidates;
    ctx.functionCandidatesIndex = 0;

    const setContext = (recipe: (draft: Context) => void) => {
      Object.assign(ctx, produce(ctx, recipe));
    };

    const value = {
      context: ctx,
      setContext,
      settings: defaultSettings,
      refs,
      handleUndo: () => {},
      handleRedo: () => {},
    } as any;

    const tree = (v: any) => (
      <WorkbookContext.Provider value={v}>
        {withCellInput && <InputBox />}
        <FxEditor />
      </WorkbookContext.Provider>
    );

    const view = render(tree(value));
    const rerender = () => view.rerender(tree({ ...value, context: ctx }));

    const fx = view.container.querySelector<HTMLElement>(
      "#luckysheet-functionbox-cell"
    )!;

    return { ctx, refs, view, fx, rerender };
  };

  // The bar's region, located by suffix: its id is derived from a `useId()`
  // base, precisely so it cannot collide with `InputBox`'s hard-coded
  // `sr-formulaSuggestions`.
  const barRegion = () =>
    document.querySelector<HTMLElement>('[id$="sr-formula-suggestions"]');
  const cellRegion = () => document.getElementById("sr-formulaSuggestions");

  const focusBar = (fx: HTMLElement, rerender: () => void) => {
    act(() => {
      fireEvent.focus(fx);
    });
    act(() => {
      rerender();
    });
  };

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("announces the count when the bar's list appears", () => {
    const { fx, rerender } = setup();

    focusBar(fx, rerender);

    expect(barRegion()!.textContent).toBe("Formula suggestions available: 3.");
  });

  it("is polite, not assertive", () => {
    const { fx, rerender } = setup();

    focusBar(fx, rerender);

    expect(barRegion()!.getAttribute("role")).toBe("status");
  });

  it("keeps the region mounted while the bar's list is closed", () => {
    setup();

    // Never focused, so no list -- but a live region has to be in the document
    // before its text changes for the change to be announced at all. Mounting
    // it with the list would make the first appearance silent.
    expect(barRegion()).not.toBeNull();
    expect(barRegion()!.textContent).toBe("");
  });

  it("does not re-announce when the bar's list narrows", () => {
    const { ctx, fx, rerender } = setup();
    focusBar(fx, rerender);
    expect(barRegion()!.textContent).toBe("Formula suggestions available: 3.");

    act(() => {
      ctx.functionCandidates = [{ n: "AVERAGE", d: "Returns the average" }];
      rerender();
    });

    expect(barRegion()!.textContent).toBe("Formula suggestions available: 3.");
  });

  it("clears when the bar's list closes, and speaks again next time", () => {
    const { ctx, fx, rerender } = setup();
    focusBar(fx, rerender);

    act(() => {
      ctx.functionCandidates = [];
      rerender();
    });
    expect(barRegion()!.textContent).toBe("");

    act(() => {
      ctx.functionCandidates = [{ n: "SUM" }, { n: "SUMIF" }] as any;
      rerender();
    });
    expect(barRegion()!.textContent).toBe("Formula suggestions available: 2.");
  });

  it("stays silent while the bar is unfocused, so the cell's list is announced once", () => {
    // Both regions are in the document together here, which is the real
    // arrangement. `functionCandidates` is global, so an ungated bar region
    // would speak for the cell input's list too and the count would be read
    // out twice.
    const { rerender } = setup({ withCellInput: true });

    const cellInput = document.querySelector<HTMLElement>(
      "#luckysheet-rich-text-editor"
    )!;
    act(() => {
      cellInput.focus();
      rerender();
    });

    expect(cellRegion()!.textContent).toBe("Formula suggestions available: 3.");
    expect(barRegion()!.textContent).toBe("");
  });

  it("gives the two regions different ids", () => {
    setup({ withCellInput: true });

    // A bare `sr-formulaSuggestions` literal on the bar would put two
    // identical ids in one document.
    expect(barRegion()!.id).not.toBe("sr-formulaSuggestions");
    expect(cellRegion()).not.toBeNull();
    expect(barRegion()!.id).not.toBe(cellRegion()!.id);
  });
});
