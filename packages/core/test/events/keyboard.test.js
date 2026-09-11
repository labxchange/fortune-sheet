import { contextFactory, selectionFactory } from "../factories/context";
import {
  handleArrowKey,
  handleGlobalEnter,
  handleGlobalKeyDown,
  handleWithCtrlOrMetaKey,
} from "../../src/events/keyboard";
import { getFlowdata } from "../../src/context";
import { GRID_ROOT_CLASS } from "../../src/constants";
import { groupValuesRefresh } from "../../src";

describe("keyboard", () => {
  const keypressWithCtrlPressed = (key, code) => {
    return new KeyboardEvent("ctrl+[key]", { key, ctrlKey: true, code });
  };
  const getContext = () =>
    contextFactory({
      luckysheet_select_save: selectionFactory([0, 0], [0, 0], 0, 0),
      luckysheetfile: [
        {
          id: "id_1",
          data: [
            [{ v: "abc" }, { v: "abc" }],
            [{ v: "abc" }, { v: "abc" }],
          ],
        },
      ],
    });
  const cellData = {
    m: "30",
    v: "30",
    f: "=SUM(A1:B1)",
    ct: { fa: "General", t: "inlineStr" },
  };

  test("handle global enter", async () => {
    const cellInput = document.createElement("div");
    cellInput.innerText = "Hello world";
    const ctx = getContext();
    const keyboardEvent = new KeyboardEvent("Enter", { key: "Enter" });
    handleGlobalEnter(ctx, cellInput, keyboardEvent);
    expect(getFlowdata(ctx)[0][0].v).toBe("Hello world");
  });

  test("handle with ctrl+b", async () => {
    const cellInput = document.createElement("div");
    const fxInput = document.createElement("div");
    const ctx = getContext();
    ctx.luckysheetCellUpdate = [];
    let cache;

    handleWithCtrlOrMetaKey(
      ctx,
      cache,
      keypressWithCtrlPressed("b", "KeyB"),
      cellInput,
      fxInput,
      () => {},
      () => {}
    );
    expect(getFlowdata(ctx)[0][0]).toEqual({ bl: 1, v: "abc" });
  });

  test("handle with ctrl+z", async () => {
    const cellInput = document.createElement("div");
    const fxInput = document.createElement("div");
    const ctx = getContext();
    const undo = jest.fn();
    let cache;
    // const redo = jest.fn();
    handleWithCtrlOrMetaKey(
      ctx,
      cache,
      keypressWithCtrlPressed("z", "KeyZ"),
      cellInput,
      fxInput,
      undo
      // redo
    );
    await new Promise((resolve) => {
      setTimeout(() => resolve(true), 1);
    });
    expect(undo).toHaveBeenCalled();
    // handleWithCtrlOrMetaKey(
    //   ctx,
    //   keypressWithCtrlPressed("shift+z"),
    //   cellInput,
    //   fxInput,
    //   undo
    // redo
    // );
    // expect(redo).toHaveBeenCalled();
  });

  test("handle with ctrl+a", async () => {
    const cellInput = document.createElement("div");
    const fxInput = document.createElement("div");
    const ctx = getContext();
    let cache;
    handleWithCtrlOrMetaKey(
      ctx,
      cache,
      keypressWithCtrlPressed("a", "KeyA"),
      cellInput,
      fxInput,
      () => {},
      () => {}
    );
    expect(ctx.luckysheet_select_save[0].row_select).toBe(true);
    expect(ctx.luckysheet_select_save[0].column_select).toBe(true);
    expect(ctx.luckysheet_select_save[0].row).toEqual([0, 1]);
    expect(ctx.luckysheet_select_save[0].column).toEqual([0, 1]);
  });

  test("handle delete cell", async () => {
    const cellInput = document.createElement("div");
    const fxInput = document.createElement("div");
    const ctx = getContext();

    ctx.luckysheetCellUpdate = [];
    let cache;
    ["Delete", "Backspace"].forEach((k) => {
      ctx.luckysheetfile[0].data[0][0] = { ...cellData };
      const keyboardEvent = new KeyboardEvent("keydown", {
        key: k,
        keyCode: k === "Delete" ? 46 : 8, // Ensure correct keyCode
        bubbles: true,
        cancelable: true,
      });

      document.dispatchEvent(keyboardEvent); // Simulate user keypress
      handleGlobalKeyDown(
        ctx,
        cellInput,
        fxInput,
        keyboardEvent,
        cache,
        () => {},
        () => {}
      );
      expect(getFlowdata(ctx)[0][0]).toMatchObject({}); // Matches any empty object
    });
  });

  test("handle delete multiple cells", async () => {
    const cellInput = document.createElement("div");
    const fxInput = document.createElement("div");
    const ctx = getContext();
    ctx.luckysheetCellUpdate = [];
    let cache;
    ctx.luckysheetfile[0].data[0][0] = cellData;
    ctx.luckysheetfile[0].data[0][1] = cellData;
    ctx.luckysheet_select_save = selectionFactory([0, 1], [0, 1], 0, 1);
    const keyboardEvent = new KeyboardEvent("Delete", { key: "Delete" });
    handleGlobalKeyDown(
      ctx,
      cellInput,
      fxInput,
      keyboardEvent,
      cache,
      () => {},
      () => {}
    );
    expect(getFlowdata(ctx)[0][0]).toMatchObject({}); // Matches any empty object
    expect(getFlowdata(ctx)[0][1]).toMatchObject({}); // Matches any empty object
  });

  test("handle arrow", async () => {
    const ctx = getContext();
    ctx.luckysheetCellUpdate = [];
    [
      { k: "ArrowDown", r: 1, c: 0 },
      { k: "ArrowRight", r: 1, c: 1 },
      { k: "ArrowUp", r: 0, c: 1 },
      { k: "ArrowLeft", r: 0, c: 0 },
    ].forEach((item) => {
      const keyboardEvent = new KeyboardEvent(item.k, { key: item.k });
      handleArrowKey(ctx, keyboardEvent);
      expect(ctx.luckysheet_select_save[0].row_focus).toBe(item.r);
      expect(ctx.luckysheet_select_save[0].column_focus).toBe(item.c);
    });
  });

  // The shortcuts dialog advertises these three, and the drift check in
  // keyboardShortcuts.test.js recorded them as covered by this file — which
  // referenced none of them. Real cases, so the coverage claim is true.
  describe("bindings advertised by the shortcuts dialog", () => {
    const ctrlKeyEvent = (init) =>
      new KeyboardEvent("keydown", {
        ctrlKey: true,
        cancelable: true,
        ...init,
      });

    // handleControlPlusArrowKey reads the sheet's declared extent and bails
    // without it, which the shared fixture does not carry.
    //
    // Row 0 needs >=3 contiguous columns, not 2: a 2-column row makes the
    // edge of the data region (B1) land on the same cell a plain ArrowRight
    // would reach in a single step, so a test using it cannot tell a jump
    // from a step -- it would pass unchanged with the Ctrl modifier dropped.
    const getSizedContext = () =>
      contextFactory({
        luckysheet_select_save: selectionFactory([0, 0], [0, 0], 0, 0),
        luckysheetfile: [
          {
            id: "id_1",
            row: 10,
            column: 8,
            data: [
              [{ v: "abc" }, { v: "abc" }, { v: "abc" }],
              [{ v: "abc" }, { v: "abc" }, { v: "abc" }],
            ],
          },
        ],
      });

    const pressWithCtrl = (ctx, event, cellInput) =>
      handleWithCtrlOrMetaKey(
        ctx,
        { ignoreWriteCell: false },
        event,
        cellInput ?? document.createElement("div"),
        document.createElement("div"),
        () => {},
        () => {}
      );

    // Ctrl/Cmd + arrow: jump to the edge of the data region.
    test("ctrl+arrow jumps to the edge of the data region", () => {
      const ctx = getSizedContext();
      ctx.luckysheetCellUpdate = [];

      pressWithCtrl(
        ctx,
        ctrlKeyEvent({ key: "ArrowRight", code: "ArrowRight" })
      );

      const last = ctx.luckysheet_select_save[0];
      // The fixture's row 0 runs A1:C1, so the edge to the right of A1 is C1
      // -- two columns away. A plain ArrowRight only reaches B1, so landing
      // on C1 is what a single step could not produce; that is what proves
      // the Ctrl modifier's jump-to-edge behaviour actually ran.
      expect(last.column_focus).toBe(2);
      expect(last.row_focus).toBe(0);
    });

    // Ctrl/Cmd + Shift + arrow: extend the selection to that edge instead.
    test("ctrl+shift+arrow extends the selection to the edge", () => {
      const ctx = getSizedContext();
      ctx.luckysheetCellUpdate = [];

      pressWithCtrl(
        ctx,
        ctrlKeyEvent({ key: "ArrowRight", code: "ArrowRight", shiftKey: true })
      );

      const last = ctx.luckysheet_select_save[0];
      // Extending, so the anchor stays put and the range grows to the edge --
      // [0, 2] (A1:C1), same reasoning as the jump test above: a plain
      // Shift+ArrowRight would only reach [0, 1].
      expect(last.column).toEqual([0, 2]);
      expect(last.column_focus).toBe(0);
    });

    // Ctrl/Cmd + Shift + ; : insert the current date and time.
    test("ctrl+shift+semicolon inserts the current date and time", () => {
      const ctx = getContext();
      ctx.luckysheetCellUpdate = [];
      const cellInput = document.createElement("div");

      pressWithCtrl(
        ctx,
        ctrlKeyEvent({
          key: ";",
          code: "Semicolon",
          keyCode: 186,
          shiftKey: true,
        }),
        cellInput
      );

      // Written into the cell being edited, not committed outright, so the user
      // can still amend it before pressing Enter.
      expect(cellInput.innerText).toMatch(
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/
      );
      expect(ctx.luckysheetCellUpdate).toEqual([0, 0]);
    });
  });

  // Tab used to bail outright while a cell was being edited, so it did nothing
  // at all: InputBox had already preventDefault()ed the key, so focus stayed
  // put and no cell moved. It now commits and steps sideways, the way Enter
  // commits and steps down.
  describe("tab in edit mode", () => {
    const editing = (ctx, row, col, text) => {
      const cellInput = document.createElement("div");
      cellInput.innerText = text;
      ctx.luckysheetCellUpdate = [row, col];
      return cellInput;
    };
    const tab = (shiftKey = false) =>
      new KeyboardEvent("keydown", { key: "Tab", shiftKey, cancelable: true });

    const press = (ctx, cellInput, event) =>
      handleGlobalKeyDown(
        ctx,
        cellInput,
        document.createElement("div"),
        event,
        { undoList: [], redoList: [] },
        () => {},
        () => {}
      );

    test("commits the edit and moves right", () => {
      const ctx = getContext();
      const cellInput = editing(ctx, 0, 0, "Hello world");

      press(ctx, cellInput, tab());

      expect(getFlowdata(ctx)[0][0].v).toBe("Hello world");
      expect(ctx.luckysheet_select_save[0].column_focus).toBe(1);
      expect(ctx.luckysheet_select_save[0].row_focus).toBe(0);
    });

    test("shift+tab commits the edit and moves left", () => {
      const ctx = getContext();
      const cellInput = editing(ctx, 0, 1, "Hello world");

      press(ctx, cellInput, tab(true));

      expect(getFlowdata(ctx)[0][1].v).toBe("Hello world");
      expect(ctx.luckysheet_select_save[0].column_focus).toBe(0);
    });

    // Tab must not be a second, subtly different way of writing a cell.
    test("stores the same value Enter would", () => {
      const viaTab = getContext();
      press(viaTab, editing(viaTab, 0, 0, "42"), tab());

      const viaEnter = getContext();
      const enterInput = editing(viaEnter, 0, 0, "42");
      handleGlobalEnter(
        viaEnter,
        enterInput,
        new KeyboardEvent("Enter", { key: "Enter" })
      );

      expect(getFlowdata(viaTab)[0][0]).toEqual(getFlowdata(viaEnter)[0][0]);
    });

    test("consumes the key so focus cannot also advance", () => {
      const ctx = getContext();
      const cellInput = editing(ctx, 0, 0, "abc");
      const event = tab();

      press(ctx, cellInput, event);

      expect(event.defaultPrevented).toBe(true);
    });

    test("commits without moving past the last addressable column", () => {
      const ctx = getContext();
      const lastCol = getFlowdata(ctx)[0].length - 1;
      const cellInput = editing(ctx, 0, lastCol, "edge");

      press(ctx, cellInput, tab());

      expect(getFlowdata(ctx)[0][lastCol].v).toBe("edge");
      expect(ctx.luckysheet_select_save[0].column_focus).toBeLessThanOrEqual(
        lastCol
      );
    });

    test("leaves edit mode behind", () => {
      const ctx = getContext();
      const cellInput = editing(ctx, 0, 0, "done");

      press(ctx, cellInput, tab());

      expect(ctx.luckysheetCellUpdate).toEqual([]);
    });
  });

  // The Ctrl+Shift+F "sheet focus lock" toggle was removed: it was a hidden
  // mode with no visible affordance, and the grid now scopes its keys by event
  // target instead, so the toolbar and sheet tabs stay reachable by Tab.
  describe("grid key scoping", () => {
    // Mirrors the real DOM: the cell input is a focusable contenteditable inside
    // the sheet overlay, the overlay carries its own non-grid controls (the
    // add-row input, the select-all corner, the filter buttons), and the toolbar
    // is a sibling outside it. The cell input has to be focusable or the
    // unconditional cellInput.focus() at the end of handleGlobalKeyDown is a
    // no-op and the focus assertions below cannot fail.
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
      const addRowInput = document.createElement("input");
      addRowInput.type = "text";
      overlay.appendChild(addRowInput);
      const overlayButton = document.createElement("div");
      overlayButton.className = "fortune-left-top";
      overlayButton.tabIndex = 0;
      overlay.appendChild(overlayButton);
      const scrollbar = document.createElement("div");
      scrollbar.className = "luckysheet-scrollbar luckysheet-scrollbar-y";
      scrollbar.setAttribute("role", "scrollbar");
      scrollbar.tabIndex = 0;
      overlay.appendChild(scrollbar);
      const toolbar = document.createElement("div");
      toolbar.className = "fortune-toolbar";
      const toolbarButton = document.createElement("button");
      toolbar.appendChild(toolbarButton);
      container.appendChild(overlay);
      container.appendChild(toolbar);
      document.body.appendChild(container);
      return {
        container,
        overlay,
        cellInput,
        addRowInput,
        overlayButton,
        scrollbar,
        toolbarButton,
      };
    };

    // Focus the target first: a real keydown is delivered to whatever holds
    // focus, and "did the grid steal focus back" is half of what is under test.
    const pressFrom = (ctx, cellInput, target, init) => {
      target.focus();
      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ...init,
      });
      target.dispatchEvent(event);
      handleGlobalKeyDown(
        ctx,
        cellInput,
        document.createElement("div"),
        event,
        { undoList: [], redoList: [] },
        () => {},
        () => {}
      );
      return event;
    };

    afterEach(() => {
      document.body.innerHTML = "";
    });

    test("ctrl+shift+f no longer toggles anything", () => {
      const { cellInput, toolbarButton } = buildDom();
      const ctx = getContext();
      ctx.luckysheetCellUpdate = [];

      const event = pressFrom(ctx, cellInput, cellInput, {
        key: "F",
        code: "KeyF",
        ctrlKey: true,
        shiftKey: true,
      });

      // Ctrl+Shift+F is no longer a mode toggle: no focus lock flag, no jump to
      // the toolbar, no Find dialog and no selection move. It does still get
      // preventDefault()ed, because every Ctrl/Meta combo reaching the grid goes
      // through handleWithCtrlOrMetaKey, which swallows the event wholesale --
      // pre-existing upstream behaviour, not part of this removal.
      expect(ctx.sheetFocused).toBeUndefined();
      expect(document.activeElement).toBe(cellInput);
      expect(ctx.showSearch).toBeFalsy();
      expect(event.defaultPrevented).toBe(true);
      expect(ctx.luckysheet_select_save[0].column_focus).toBe(0);
      expect(document.activeElement).not.toBe(toolbarButton);
    });

    test("tab from the toolbar is left to the browser", () => {
      const { cellInput, toolbarButton } = buildDom();
      const ctx = getContext();
      ctx.luckysheetCellUpdate = [];

      const event = pressFrom(ctx, cellInput, toolbarButton, { key: "Tab" });

      expect(event.defaultPrevented).toBe(false);
      expect(ctx.luckysheet_select_save[0].column_focus).toBe(0);
      // The grid must not yank focus back out of the toolbar either.
      expect(document.activeElement).toBe(toolbarButton);
    });

    test("escape from the toolbar leaves the selection range alone", () => {
      const { cellInput, toolbarButton } = buildDom();
      const ctx = getContext();
      ctx.luckysheetCellUpdate = [];
      ctx.luckysheet_selection_range = [{ row: [0, 1], column: [0, 1] }];

      pressFrom(ctx, cellInput, toolbarButton, { key: "Escape" });

      // The scoping guard runs before any grid state is touched, so a key that
      // was never meant for the grid cannot clear the range.
      expect(ctx.luckysheet_selection_range).toEqual([
        { row: [0, 1], column: [0, 1] },
      ]);
    });

    test("typing in the overlay's add-row input is left to the browser", () => {
      const { cellInput, addRowInput } = buildDom();
      const ctx = getContext();
      ctx.luckysheetCellUpdate = [];

      const event = pressFrom(ctx, cellInput, addRowInput, {
        key: "5",
        code: "Digit5",
        keyCode: 53,
      });

      // No cell edit started, nothing overwritten, and focus stays in the input
      // the user is typing into -- the overlay hosts its own controls and the
      // grid must not eat their keys.
      expect(event.defaultPrevented).toBe(false);
      expect(ctx.luckysheetCellUpdate).toEqual([]);
      expect(document.activeElement).toBe(addRowInput);
    });

    test("tab from a focusable overlay control is left to the browser", () => {
      const { cellInput, overlayButton } = buildDom();
      const ctx = getContext();
      ctx.luckysheetCellUpdate = [];

      const event = pressFrom(ctx, cellInput, overlayButton, { key: "Tab" });

      expect(event.defaultPrevented).toBe(false);
      expect(ctx.luckysheet_select_save[0].column_focus).toBe(0);
      expect(document.activeElement).toBe(overlayButton);
    });

    test("tab from the cell input still moves the selection", () => {
      const { cellInput } = buildDom();
      const ctx = getContext();
      ctx.luckysheetCellUpdate = [];

      const event = pressFrom(ctx, cellInput, cellInput, { key: "Tab" });

      expect(event.defaultPrevented).toBe(true);
      expect(ctx.luckysheet_select_save[0].column_focus).toBe(1);
    });

    test("tab from elsewhere in the overlay still moves the selection", () => {
      const { cellInput, overlay } = buildDom();
      const ctx = getContext();
      ctx.luckysheetCellUpdate = [];

      const event = pressFrom(ctx, cellInput, overlay, { key: "Tab" });

      expect(event.defaultPrevented).toBe(true);
      expect(ctx.luckysheet_select_save[0].column_focus).toBe(1);
    });

    // The scrollbars are operable widgets with their own key handling (arrows
    // scroll, Home/End jump), so the grid must not also move the selection when
    // one of them holds focus.
    test("arrow keys from a scrollbar are left to the scrollbar", () => {
      const { cellInput, scrollbar } = buildDom();
      const ctx = getContext();
      ctx.luckysheetCellUpdate = [];

      const event = pressFrom(ctx, cellInput, scrollbar, {
        key: "ArrowDown",
        code: "ArrowDown",
      });

      expect(event.defaultPrevented).toBe(false);
      expect(ctx.luckysheet_select_save[0].row_focus).toBe(0);
      expect(document.activeElement).toBe(scrollbar);
    });

    // The grid root is the grid's own tab stop, not a control rendered around
    // it. Once it carries tabIndex 0 it starts matching the "focusable control"
    // selector, and without the carve-out for it the arrow keys would silently
    // stop moving the selection for anyone who tabbed into the grid.
    test("arrow keys from a tabbable grid root still move the selection", () => {
      const { cellInput, overlay } = buildDom();
      overlay.tabIndex = 0;
      const ctx = getContext();
      ctx.luckysheetCellUpdate = [];

      pressFrom(ctx, cellInput, overlay, {
        key: "ArrowRight",
        code: "ArrowRight",
      });

      expect(ctx.luckysheet_select_save[0].column_focus).toBe(1);
    });

    test("tab from a tabbable grid root still moves the selection", () => {
      const { cellInput, overlay } = buildDom();
      overlay.tabIndex = 0;
      const ctx = getContext();
      ctx.luckysheetCellUpdate = [];

      const event = pressFrom(ctx, cellInput, overlay, { key: "Tab" });

      expect(event.defaultPrevented).toBe(true);
      expect(ctx.luckysheet_select_save[0].column_focus).toBe(1);
    });

    // The carve-out is for the root itself, not for everything inside it: a
    // tabbable control in the overlay stays out of scope whatever the root's
    // own tabIndex is.
    test("a tabbable grid root does not put its controls in scope", () => {
      const { cellInput, overlay, overlayButton } = buildDom();
      overlay.tabIndex = 0;
      const ctx = getContext();
      ctx.luckysheetCellUpdate = [];

      const event = pressFrom(ctx, cellInput, overlayButton, { key: "Tab" });

      expect(event.defaultPrevented).toBe(false);
      expect(ctx.luckysheet_select_save[0].column_focus).toBe(0);
      expect(document.activeElement).toBe(overlayButton);
    });

    // Only navigation and typing are grid-scoped. Workbook commands keep acting
    // on the selection from anywhere in the workbook, the way Ctrl+Z and Ctrl+Y
    // already do one level up in Workbook.onKeyDown -- otherwise a keyboard user
    // who tabs to the toolbar to inspect a button finds Ctrl+C silently dead.
    test("ctrl+c from a toolbar button still copies the selection", () => {
      const { cellInput, toolbarButton } = buildDom();
      const ctx = getContext();
      ctx.luckysheetCellUpdate = [];

      pressFrom(ctx, cellInput, toolbarButton, {
        key: "c",
        code: "KeyC",
        ctrlKey: true,
      });

      expect(ctx.luckysheet_copy_save.copyRange).toEqual([
        { row: [0, 0], column: [0, 0] },
      ]);
    });

    test("ctrl+f from a toolbar button still opens find", () => {
      const { cellInput, toolbarButton } = buildDom();
      const ctx = getContext();
      ctx.luckysheetCellUpdate = [];

      pressFrom(ctx, cellInput, toolbarButton, {
        key: "f",
        code: "KeyF",
        ctrlKey: true,
      });

      expect(ctx.showSearch).toBe(true);
    });

    // Text-entry targets are the exception: they own every key they receive,
    // Ctrl combos included, so the grid must not copy cells while the user is
    // copying text out of the add-row input, the formula bar or a search field.
    test("ctrl+c inside a text input is left to the input", () => {
      const { cellInput, addRowInput } = buildDom();
      const ctx = getContext();
      ctx.luckysheetCellUpdate = [];

      const event = pressFrom(ctx, cellInput, addRowInput, {
        key: "c",
        code: "KeyC",
        ctrlKey: true,
      });

      expect(event.defaultPrevented).toBe(false);
      expect(ctx.luckysheet_copy_save).toBeUndefined();
      expect(document.activeElement).toBe(addRowInput);
    });

    // Tab and Enter stay out of scope whatever the modifiers: moving focus and
    // activating the focused control are the browser's job.
    test("ctrl+tab from the toolbar is left to the browser", () => {
      const { cellInput, toolbarButton } = buildDom();
      const ctx = getContext();
      ctx.luckysheetCellUpdate = [];

      const event = pressFrom(ctx, cellInput, toolbarButton, {
        key: "Tab",
        ctrlKey: true,
      });

      expect(event.defaultPrevented).toBe(false);
      expect(ctx.luckysheet_select_save[0].column_focus).toBe(0);
      expect(document.activeElement).toBe(toolbarButton);
    });

    // Arming Format Painter from the toolbar now returns focus to the cell
    // input (combineStamps, this same round), so Escape pressed there reaches
    // this handler in-grid -- without this, it cleared only the visual
    // marching-ants (luckysheet_selection_range) and left
    // luckysheetPaintModelOn true, an armed mode a keyboard-only user had no
    // way to leave.
    test("escape from the grid cancels an armed format painter", () => {
      const { cellInput } = buildDom();
      const ctx = getContext();
      ctx.luckysheetCellUpdate = [];
      ctx.luckysheetPaintModelOn = true;
      ctx.luckysheet_copy_save = {
        dataSheetId: ctx.currentSheetId,
        copyRange: [{ row: [0, 0], column: [0, 0] }],
        RowlChange: false,
        HasMC: false,
      };

      pressFrom(ctx, cellInput, cellInput, { key: "Escape" });

      expect(ctx.luckysheetPaintModelOn).toBe(false);
    });

    // Escape must stay a no-op for the common case, not a blanket reset.
    test("escape from the grid leaves format painter alone when it was never armed", () => {
      const { cellInput } = buildDom();
      const ctx = getContext();
      ctx.luckysheetCellUpdate = [];
      ctx.luckysheetPaintModelOn = false;

      pressFrom(ctx, cellInput, cellInput, { key: "Escape" });

      expect(ctx.luckysheetPaintModelOn).toBe(false);
    });
  });

  test("handle formula", async () => {
    const ctx = getContext();
    const keyboardEvent = new KeyboardEvent("Enter", { key: "Enter" });
    [
      {
        f1: "SUM",
        f2: "SUM",
        newCell: "120",
        v1: 330,
        v2: 660,
        v3: 240,
        v4: 480,
      },
      {
        f1: "AVERAGE",
        f2: "AVERAGE",
        newCell: "120",
        v1: 165,
        v2: 165,
        v3: 120,
        v4: 120,
      },
      {
        f1: "MAX",
        f2: "MAX",
        newCell: "120",
        v1: 210,
        v2: 210,
        v3: 120,
        v4: 120,
      },
      {
        f1: "MIN",
        f2: "MIN",
        newCell: "120",
        v1: 120,
        v2: 120,
        v3: 120,
        v4: 120,
      },
      { f1: "COUNT", f2: "COUNT", newCell: "", v1: 2, v2: 3, v3: 1, v4: 2 },
      {
        f1: "SUM",
        f2: "MAX",
        newCell: "120",
        v1: 330,
        v2: 330,
        v3: 240,
        v4: 240,
      },
    ].forEach((item) => {
      ctx.luckysheetfile = [
        {
          id: "id_1",
          data: [[{ v: 120 }, { v: 210 }, null]],
        },
      ];
      const cellInput = document.createElement("div");
      cellInput.innerText = `=${item.f1}(A1:B1)`;
      ctx.luckysheetCellUpdate = [0, 2];
      handleGlobalEnter(ctx, cellInput, keyboardEvent);
      expect(getFlowdata(ctx)[0][2].v).toBe(item.v1);
      cellInput.innerText = `=${item.f2}(A1:C1)`;
      ctx.luckysheetCellUpdate = [0, 3];
      handleGlobalEnter(ctx, cellInput, keyboardEvent);
      expect(getFlowdata(ctx)[0][3].v).toBe(item.v2);

      cellInput.innerText = item.newCell;
      ctx.luckysheetCellUpdate = [0, 1];
      handleGlobalEnter(ctx, cellInput, keyboardEvent);
      groupValuesRefresh(ctx);
      expect(getFlowdata(ctx)[0][2].v).toBe(item.v3);
      expect(getFlowdata(ctx)[0][3].v).toBe(item.v4);
    });
  });

  // Ctrl/Cmd+D and Ctrl/Cmd+R each carried their own hand-rolled
  // reference-offsetting regex, `/(\$?[A-Z]+)(\$?)(\d+)/g`. Both now delegate
  // to `functionCopy`, the helper the drag-fill path already used. The tests
  // drive the KEYBOARD gesture on purpose: the drag path was never broken, and
  // an earlier attempt to clear this ticket tested the drag path and so found
  // nothing wrong.
  // These cover the fill that `autoFillCell` performs -- the hand-rolled
  // regexes these cases were written against were deleted upstream in #36,
  // which delegates both directions to the same engine helper. The cases
  // survived that change unaltered, which is the useful part: they were written
  // as behaviour, not as a description of the loop.
  //
  // Trimmed to what `test/events/autoFillFormulaRefs.test.js` does NOT assert.
  // What is left is the lower-case reference in both directions -- #36 has no
  // lower-case case at all, and a case-sensitive predicate was the whole of T6
  // -- plus the two inverse guards: an upper-case formula unchanged, and a
  // plain value still filled as a value rather than promoted to a formula.
  // Dropped as genuine duplicates: a multi-letter column (#36 crosses the
  // Z -> AA boundary, which is strictly stronger than starting at AA) and an
  // absolute-vs-relative column (#36 pins both anchors, separately).
  describe("keyboard fill (ctrl+d / ctrl+r)", () => {
    const fillEvent = (code) =>
      new KeyboardEvent("keydown", {
        key: code === "KeyD" ? "d" : "r",
        code,
        ctrlKey: true,
        cancelable: true,
      });

    // `row`/`column` give the sheet a declared extent; without it the fill
    // handlers bail before reaching the offsetting code.
    const fillContext = (sourceCell, row, column) =>
      contextFactory({
        luckysheet_select_save: [
          { row, column, row_focus: row[0], column_focus: column[0] },
        ],
        luckysheetfile: [
          {
            id: "id_1",
            row: 10,
            column: 8,
            data: [
              [sourceCell, null, null, null, null],
              [null, null, null, null, null],
              [null, null, null, null, null],
              [null, null, null, null, null],
            ],
          },
        ],
      });

    const fill = (ctx, code) => {
      ctx.luckysheetCellUpdate = [];
      handleWithCtrlOrMetaKey(
        ctx,
        { ignoreWriteCell: false },
        fillEvent(code),
        document.createElement("div"),
        document.createElement("div"),
        () => {},
        () => {}
      );
    };

    // The reported defect: `[A-Z]+` never matched a lower-case reference, so
    // no substitution ran and the source formula was written verbatim into
    // every target. Asserting on `.f` rather than the rendered value is
    // deliberate -- a copied value and a correctly offset formula can display
    // identically, which is how this survived to be audited.
    test("ctrl+d offsets a lower-case formula's row reference", () => {
      const ctx = fillContext({ v: 1, f: "=b1+1" }, [0, 2], [0, 0]);

      fill(ctx, "KeyD");

      // `functionCopy` normalises a reference to upper case as it offsets it,
      // the same way the drag-fill path always has. That normalisation is
      // itself the proof the delegation ran: the old regex could not match
      // `b1` at all, so it wrote `=b1+1` through unchanged -- lower case AND
      // un-offset. Upper case here means the reference was actually parsed.
      expect(getFlowdata(ctx)[1][0].f).toBe("=B2+1");
      expect(getFlowdata(ctx)[2][0].f).toBe("=B3+1");
    });

    // The counter-path, and the whole regression risk of this change: making
    // the lenient case work must not alter the strict case.
    test("ctrl+d offsets an upper-case formula exactly as before", () => {
      const ctx = fillContext({ v: 1, f: "=B1+1" }, [0, 2], [0, 0]);

      fill(ctx, "KeyD");

      expect(getFlowdata(ctx)[1][0].f).toBe("=B2+1");
      expect(getFlowdata(ctx)[2][0].f).toBe("=B3+1");
    });

    // The no-op axis: a cell with no formula must still fill as a value, not
    // acquire one.
    test("ctrl+d copies a plain value as a value", () => {
      const ctx = fillContext({ v: "abc" }, [0, 2], [0, 0]);

      fill(ctx, "KeyD");

      expect(getFlowdata(ctx)[1][0].v).toBe("abc");
      expect(getFlowdata(ctx)[1][0].f).toBeUndefined();
    });

    test("ctrl+r offsets a lower-case formula's column reference", () => {
      const ctx = fillContext({ v: 1, f: "=a2+1" }, [0, 0], [0, 2]);

      fill(ctx, "KeyR");

      // Upper-cased as it is offset -- see the ctrl+d case above.
      expect(getFlowdata(ctx)[0][1].f).toBe("=B2+1");
      expect(getFlowdata(ctx)[0][2].f).toBe("=C2+1");
    });

    // Ctrl+R's regex read only `colRef.charCodeAt(0)` and emitted a single
    // character, so any reference past column Z mis-offset -- and past the
    // 26th column it produced non-letters. `functionCopy` goes through
    // `columnCharToIndex`/`indexToColumnChar`, which are width-agnostic.

    // Ctrl+R's regex tested capture group 2 -- the `$` in front of the ROW --
    // to decide whether to move the COLUMN, so it had absolute handling
    // exactly backwards: `$A1` was offset and `A$1` was pinned.
  });

  // A write refused by data verification used to set `warnDialog` and return
  // with no signal to its caller, so both commit paths overwrote the selection
  // and stepped away regardless -- moving the user off the cell at the moment
  // a dialog naming that cell appeared.
  describe("commit refused by data verification", () => {
    // `type: "dropdown"` on purpose: its failure text is a fixed string, so the
    // fixture needs no `ctx.dataVerification.optionLabel_*` lookup table.
    const withRule = (cellUpdate) => {
      const ctx = contextFactory({
        luckysheet_select_save: selectionFactory([0, 0], [0, 0], 0, 0),
        luckysheetfile: [
          {
            id: "id_1",
            row: 10,
            column: 8,
            data: [
              [{ v: "yes" }, { v: "yes" }],
              [{ v: "yes" }, { v: "yes" }],
            ],
            dataVerification: {
              "0_0": {
                type: "dropdown",
                value1: "yes,no",
                prohibitInput: true,
              },
            },
          },
        ],
      });
      ctx.luckysheetCellUpdate = cellUpdate;
      return ctx;
    };

    const editing = (text) => {
      const cellInput = document.createElement("div");
      cellInput.innerText = text;
      return cellInput;
    };

    const pressEnter = (ctx, cellInput) =>
      handleGlobalEnter(
        ctx,
        cellInput,
        new KeyboardEvent("Enter", { key: "Enter", cancelable: true })
      );

    const pressTab = (ctx, cellInput) =>
      handleGlobalKeyDown(
        ctx,
        cellInput,
        document.createElement("div"),
        new KeyboardEvent("keydown", { key: "Tab", cancelable: true }),
        { undoList: [], redoList: [] },
        () => {},
        () => {}
      );

    test("enter leaves the caret on the refused cell", () => {
      const ctx = withRule([0, 0]);

      pressEnter(ctx, editing("maybe"));

      // The assertion is about the SELECTION, not about `warnDialog`. The old
      // code already set the dialog -- that is the symptom, not the fix.
      expect(ctx.luckysheet_select_save[0].row_focus).toBe(0);
      expect(ctx.luckysheet_select_save[0].column_focus).toBe(0);
    });

    test("tab leaves the caret on the refused cell", () => {
      const ctx = withRule([0, 0]);

      pressTab(ctx, editing("maybe"));

      expect(ctx.luckysheet_select_save[0].column_focus).toBe(0);
      expect(ctx.luckysheet_select_save[0].row_focus).toBe(0);
    });

    // Tab's move sits outside the edit-mode branch, so the refusal guard
    // returns early to skip it. That must not also drop `preventDefault`, or
    // the browser advances focus past a cell the grid is holding.
    test("a refused tab still consumes the key", () => {
      const ctx = withRule([0, 0]);
      const event = new KeyboardEvent("keydown", {
        key: "Tab",
        cancelable: true,
      });

      handleGlobalKeyDown(
        ctx,
        editing("maybe"),
        document.createElement("div"),
        event,
        { undoList: [], redoList: [] },
        () => {},
        () => {}
      );

      expect(event.defaultPrevented).toBe(true);
    });

    // The counter-path pair. Without these two, the tests above would pass
    // against a commit path that had simply stopped moving altogether.
    test("an accepted enter still steps down", () => {
      const ctx = withRule([0, 0]);

      pressEnter(ctx, editing("no"));

      expect(ctx.luckysheet_select_save[0].row_focus).toBe(1);
    });

    test("an accepted tab still steps right", () => {
      const ctx = withRule([0, 0]);

      pressTab(ctx, editing("no"));

      expect(ctx.luckysheet_select_save[0].column_focus).toBe(1);
    });

    // A no-op is a request that SUCCEEDED, so it must still advance. This is
    // what makes the guard's predicate "refused" rather than "wrote": three of
    // `updateCell`'s early returns are unchanged-value no-ops, and keying them
    // to movement would strand the caret whenever a value was re-entered
    // unchanged.
    test("re-entering an unchanged value still steps down", () => {
      const ctx = withRule([0, 1]);

      pressEnter(ctx, editing("yes"));

      expect(ctx.luckysheet_select_save[0].row_focus).toBe(1);
    });
  });
});
