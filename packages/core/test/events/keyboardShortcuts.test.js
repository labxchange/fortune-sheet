import { contextFactory, selectionFactory } from "../factories/context";
import { handleGlobalKeyDown } from "../../src/events/keyboard";
import { selectionCache } from "../../src/modules/selection";
import { GRID_ROOT_CLASS } from "../../src/constants";
import { getDefaultShortcutSections } from "../../src/modules/shortcuts";

// Every shortcut added for the spreadsheet-simulation keyboard work. These go
// through handleGlobalKeyDown rather than the individual handlers, because for
// several of them (Shift+Space, Alt+Arrow) the bug being guarded against is
// precisely that an earlier branch in the dispatch chain claims the key first.
describe("keyboard shortcuts", () => {
  // The dispatcher's grid guard only lets keys through when the event target
  // resolves inside the grid root, so the tests need that much real DOM.
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
    return { container, cellInput };
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
    return event;
  };

  const getContext = (overrides = {}) =>
    contextFactory({
      luckysheetCellUpdate: [],
      luckysheet_select_save: selectionFactory([1, 1], [2, 2], 1, 2),
      ...overrides,
    });

  afterEach(() => {
    document.body.innerHTML = "";
    selectionCache.isPasteAction = false;
    selectionCache.pasteValuesOnly = false;
  });

  describe("row and column selection", () => {
    test("ctrl+space selects the focused column top to bottom", () => {
      const { cellInput } = buildDom();
      const ctx = getContext();

      press(ctx, cellInput, { key: " ", code: "Space", ctrlKey: true });

      const [selection] = ctx.luckysheet_select_save;
      expect(selection.column).toEqual([2, 2]);
      expect(selection.row).toEqual([0, 3]);
      expect(selection.column_select).toBe(true);
      expect(selection.row_select).toBeUndefined();
      expect(selection.column_focus).toBe(2);
    });

    test("shift+space selects the focused row left to right", () => {
      const { cellInput } = buildDom();
      const ctx = getContext();

      press(ctx, cellInput, { key: " ", code: "Space", shiftKey: true });

      const [selection] = ctx.luckysheet_select_save;
      expect(selection.row).toEqual([1, 1]);
      expect(selection.column).toEqual([0, 3]);
      expect(selection.row_select).toBe(true);
      expect(selection.column_select).toBeUndefined();
    });

    test("shift+space does not type a space into the cell", () => {
      // Space is keyCode 32, which short-circuits every modifier exclusion in
      // the printable-character fallback at the end of the dispatch chain.
      // Without an explicit branch above it, this selects nothing and types.
      const { cellInput } = buildDom();
      const ctx = getContext();

      const event = press(ctx, cellInput, {
        key: " ",
        code: "Space",
        shiftKey: true,
      });

      expect(ctx.luckysheetCellUpdate).toEqual([]);
      expect(event.defaultPrevented).toBe(true);
    });

    test("a whole-column selection spans multiple columns when several are selected", () => {
      const { cellInput } = buildDom();
      const ctx = getContext({
        luckysheet_select_save: selectionFactory([0, 1], [1, 3], 0, 1),
      });

      press(ctx, cellInput, { key: " ", code: "Space", ctrlKey: true });

      expect(ctx.luckysheet_select_save[0].column).toEqual([1, 3]);
    });
  });

  describe("shift+f8 selection mode", () => {
    test("adds a second range rather than replacing the first", () => {
      const { cellInput } = buildDom();
      const ctx = getContext();

      press(ctx, cellInput, { key: "F8", code: "F8", shiftKey: true });

      expect(ctx.luckysheet_select_save).toHaveLength(2);
      expect(ctx.selectionModeActive).toBe(true);
      // Both start at the same cell; the arrow keys then move the new one,
      // leaving the original where it was.
      expect(ctx.luckysheet_select_save[0].row).toEqual([1, 1]);
      expect(ctx.luckysheet_select_save[1].row).toEqual([1, 1]);
    });

    test("arrow keys move only the newly added range", () => {
      const { cellInput } = buildDom();
      const ctx = getContext();

      press(ctx, cellInput, { key: "F8", code: "F8", shiftKey: true });
      press(ctx, cellInput, { key: "ArrowDown", code: "ArrowDown" });

      expect(ctx.luckysheet_select_save).toHaveLength(2);
      expect(ctx.luckysheet_select_save[0].row).toEqual([1, 1]);
      expect(ctx.luckysheet_select_save[1].row).toEqual([2, 2]);
    });

    test("a whole-column pick keeps the ranges committed before it", () => {
      // The reported bug: Ctrl+Space always replaced the whole selection, so
      // the column anchored before Shift+F8 vanished the moment a second
      // column was picked.
      const { cellInput } = buildDom();
      const ctx = getContext();

      press(ctx, cellInput, { key: " ", code: "Space", ctrlKey: true });
      expect(ctx.luckysheet_select_save[0].column).toEqual([2, 2]);

      press(ctx, cellInput, { key: "F8", code: "F8", shiftKey: true });
      press(ctx, cellInput, { key: "ArrowRight", code: "ArrowRight" });
      press(ctx, cellInput, { key: " ", code: "Space", ctrlKey: true });

      // Two whole columns, not one: the first survives, the second replaces
      // the range Shift+F8 anchored rather than adding a third.
      expect(ctx.luckysheet_select_save).toHaveLength(2);
      expect(ctx.luckysheet_select_save[0].column).toEqual([2, 2]);
      expect(ctx.luckysheet_select_save[0].column_select).toBe(true);
      expect(ctx.luckysheet_select_save[1].column).toEqual([3, 3]);
      expect(ctx.luckysheet_select_save[1].column_select).toBe(true);
    });

    test("the same holds for whole rows", () => {
      const { cellInput } = buildDom();
      const ctx = getContext();

      press(ctx, cellInput, { key: " ", code: "Space", shiftKey: true });
      press(ctx, cellInput, { key: "F8", code: "F8", shiftKey: true });
      press(ctx, cellInput, { key: "ArrowDown", code: "ArrowDown" });
      press(ctx, cellInput, { key: " ", code: "Space", shiftKey: true });

      expect(ctx.luckysheet_select_save).toHaveLength(2);
      expect(ctx.luckysheet_select_save[0].row).toEqual([1, 1]);
      expect(ctx.luckysheet_select_save[1].row).toEqual([2, 2]);
    });

    test("outside selection mode a whole-column pick still replaces", () => {
      const { cellInput } = buildDom();
      const ctx = getContext();

      press(ctx, cellInput, { key: " ", code: "Space", ctrlKey: true });
      press(ctx, cellInput, { key: "ArrowRight", code: "ArrowRight" });
      press(ctx, cellInput, { key: " ", code: "Space", ctrlKey: true });

      expect(ctx.luckysheet_select_save).toHaveLength(1);
      expect(ctx.luckysheet_select_save[0].column).toEqual([3, 3]);
    });

    test("escape collapses back to the range in focus", () => {
      const { cellInput } = buildDom();
      const ctx = getContext();

      press(ctx, cellInput, { key: "F8", code: "F8", shiftKey: true });
      press(ctx, cellInput, { key: "ArrowDown", code: "ArrowDown" });
      press(ctx, cellInput, { key: "Escape", code: "Escape" });

      expect(ctx.selectionModeActive).toBe(false);
      expect(ctx.luckysheet_select_save).toHaveLength(1);
      expect(ctx.luckysheet_select_save[0].row).toEqual([2, 2]);
    });
  });

  describe("sheet navigation", () => {
    test("alt+down moves to the next sheet", () => {
      const { cellInput } = buildDom();
      const ctx = getContext();

      press(ctx, cellInput, {
        key: "ArrowDown",
        code: "ArrowDown",
        altKey: true,
      });

      expect(ctx.currentSheetId).toBe("id_2");
    });

    test("alt+up moves to the previous sheet", () => {
      const { cellInput } = buildDom();
      const ctx = getContext({ currentSheetId: "id_2" });

      press(ctx, cellInput, { key: "ArrowUp", code: "ArrowUp", altKey: true });

      expect(ctx.currentSheetId).toBe("id_1");
    });

    test("stops at the last sheet rather than wrapping", () => {
      const { cellInput } = buildDom();
      const ctx = getContext({ currentSheetId: "id_2" });

      press(ctx, cellInput, {
        key: "ArrowDown",
        code: "ArrowDown",
        altKey: true,
      });

      expect(ctx.currentSheetId).toBe("id_2");
    });

    test("skips hidden sheets", () => {
      const { cellInput } = buildDom();
      const ctx = getContext();
      ctx.luckysheetfile[1].hide = 1;
      ctx.luckysheetfile.push({
        name: "sheet3",
        id: "id_3",
        order: 2,
        data: [[null]],
      });

      press(ctx, cellInput, {
        key: "ArrowDown",
        code: "ArrowDown",
        altKey: true,
      });

      expect(ctx.currentSheetId).toBe("id_3");
    });

    test("a plain arrow still moves the cell cursor", () => {
      const { cellInput } = buildDom();
      const ctx = getContext();

      press(ctx, cellInput, { key: "ArrowDown", code: "ArrowDown" });

      expect(ctx.currentSheetId).toBe("id_1");
      expect(ctx.luckysheet_select_save[0].row).toEqual([2, 2]);
    });
  });

  describe("filter menu", () => {
    test("ctrl+cmd+r asks for the focused column's filter menu", () => {
      const { cellInput } = buildDom();
      const ctx = getContext();

      press(ctx, cellInput, {
        key: "r",
        code: "KeyR",
        ctrlKey: true,
        metaKey: true,
      });

      expect(ctx.openFilterMenuForColumn).toBe(2);
    });

    test("ctrl+alt+r asks for it too, for Windows", () => {
      const { cellInput } = buildDom();
      const ctx = getContext();

      press(ctx, cellInput, {
        key: "r",
        code: "KeyR",
        ctrlKey: true,
        altKey: true,
      });

      expect(ctx.openFilterMenuForColumn).toBe(2);
    });

    test("plain ctrl+r still auto-fills right instead", () => {
      // The filter branch has to be checked before the auto-fill one, which
      // matches on KeyR alone and would otherwise swallow it.
      const { cellInput } = buildDom();
      const ctx = getContext();

      press(ctx, cellInput, { key: "r", code: "KeyR", ctrlKey: true });

      expect(ctx.openFilterMenuForColumn).toBeNull();
    });
  });

  describe("paste values only", () => {
    test("ctrl+shift+v flags a values-only paste and lets the paste event fire", () => {
      const { cellInput } = buildDom();
      const ctx = getContext();

      const event = press(ctx, cellInput, {
        key: "V",
        code: "KeyV",
        ctrlKey: true,
        shiftKey: true,
      });

      expect(selectionCache.isPasteAction).toBe(true);
      expect(selectionCache.pasteValuesOnly).toBe(true);
      // Must not be prevented: the browser's own paste event is what carries
      // the clipboard payload to handlePaste.
      expect(event.defaultPrevented).toBe(false);
    });

    test("plain ctrl+v pastes with formatting", () => {
      const { cellInput } = buildDom();
      const ctx = getContext();

      press(ctx, cellInput, { key: "v", code: "KeyV", ctrlKey: true });

      expect(selectionCache.isPasteAction).toBe(true);
      expect(selectionCache.pasteValuesOnly).toBe(false);
    });
  });

  // The shortcuts dialog is a second, hand-written description of the binding
  // table — it drifted six rows behind before anyone noticed. This ties the two
  // together: every row the dialog advertises must have a case here, and every
  // case must correspond to a row, so either kind of drift fails the build
  // rather than shipping a dialog that promises a key nothing performs.
  //
  // COVERED lists the ids exercised somewhere in the suite, including the
  // bindings owned by other layers (the react Workbook's region jumps and
  // dialog opener, zoom in modules/zoom) and the upstream behaviours this
  // branch did not introduce but the dialog now documents.
  describe("dialog and bindings stay in step", () => {
    const COVERED = [
      // this file
      "selectColumn",
      "selectRow",
      "addSelectionRange",
      "nextSheet",
      "previousSheet",
      "openFilterMenu",
      "pasteValuesOnly",
      "paste",
      "cancelOrExitMode",
      // packages/core/test/events/keyboard.test.js
      "moveBetweenCells",
      "moveRight",
      "moveLeft",
      "selectRange",
      "selectAll",
      "editCell",
      "confirmCellEdit",
      "deleteCellContent",
      "copy",
      "cut",
      "undo",
      "redo",
      "autoFillDown",
      "autoFillRight",
      "boldText",
      "find",
      "replace",
      "jumpToEdge",
      "extendToEdge",
      "insertDateTime",
      // packages/react/test — regionFocus, shortcutsDialog, keyboardZoom
      "goToToolbar",
      "goToSpreadsheet",
      "goToSheetTabs",
      "openShortcuts",
      "zoomIn",
      "zoomOut",
      "zoomReset",
      // packages/react/test/index.test.tsx (context menus)
      "contextMenu",
      "rowContextMenu",
      "columnContextMenu",
    ];

    test("every documented row is exercised, and vice versa", () => {
      const documented = getDefaultShortcutSections(getContext())
        .flatMap((section) => section.items.map((item) => item.id))
        .sort();

      expect(documented).toEqual([...COVERED].sort());
    });

    test("no row is documented twice", () => {
      const documented = getDefaultShortcutSections(getContext()).flatMap(
        (section) => section.items.map((item) => item.id)
      );

      expect(documented).toHaveLength(new Set(documented).size);
    });
  });
});
