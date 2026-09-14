import {
  addSheet,
  api,
  Cell,
  Context,
  deleteRowCol,
  deleteSheet,
  insertRowCol,
  Op,
  opToPatch,
  Range,
  Selection,
  Presence,
  Settings,
  SingleRange,
  createFilterOptions,
  getSheetIndex,
  GRID_ROOT_CLASS,
  moveToEnd,
  Sheet,
  CellMatrix,
  CellWithRowAndCol,
} from "@fortune-sheet/core";
import type { RefObject } from "react";
import { applyPatches } from "immer";
import _ from "lodash";
import { SetContextOptions } from "../../context";

/**
 * Enter a region at its single keyboard entry point, and make the focus ring
 * visible whatever the last input modality was.
 *
 * Module-level and shared by two callers on purpose. `focusRegion` below backs
 * the `focusToolbar`/`focusSheetTabs` APIs; `Workbook/index.tsx` backs the
 * Ctrl/Cmd+Alt+T/S/B shortcuts. Those were two independent copies of this
 * logic, and the forced-visible marker below was added to only one of them --
 * so the shortcut, which is the route the report is actually about, went on
 * moving focus invisibly. One function, so a fix cannot reach one route and
 * miss the other.
 *
 * The toolbar and the sheet tabs are roving-tabindex composites, so the element
 * to land on is whichever item currently holds tabIndex 0 -- falling back to
 * the container itself, so the shortcut still moves focus even before a region
 * has been visited.
 *
 * `atRoot` enters at the container instead. The grid needs that: landing on one
 * of the controls inside it (the select-all corner, a filter funnel) makes
 * `handleGlobalKeyDown`'s grid guard classify focus as outside the grid, and
 * the arrow keys then move nothing.
 */
export function enterRegion(region: HTMLElement, atRoot = false): boolean {
  const target = atRoot
    ? region
    : region.querySelector<HTMLElement>(
        '[tabindex="0"]:not([aria-disabled="true"])'
      ) ?? region;
  target.focus();
  // Report whether focus landed, not merely that a target was found. The
  // browser refuses to focus anything inside a display:none / inert subtree
  // and leaves activeElement alone; an embedder that trusts a bare true
  // swallows the keystroke and denies this workbook its own chance at it.
  const landed = document.activeElement === target;
  // Force the focus ring on, because the browser will not.
  //
  // Chrome grants `:focus-visible` by last input modality, so a programmatic
  // `.focus()` after a MOUSE interaction does not match it and no ring paints
  // -- while the same call after a keyboard interaction does. That asymmetry is
  // the reported defect: reach a cell by mouse, press the region shortcut, and
  // focus moves invisibly.
  //
  // A region jump is explicit keyboard intent, so it must paint either way.
  // Marking the target and having the CSS match `[data-focus-visible]`
  // alongside `:focus-visible` does that without restyling onto bare `:focus`,
  // which would put a ring on every mouse click on a toolbar control -- a
  // visible regression, and the reason `:focus-visible` exists.
  if (landed && !target.hasAttribute("data-focus-visible")) {
    target.setAttribute("data-focus-visible", "");
    target.addEventListener(
      "blur",
      () => target.removeAttribute("data-focus-visible"),
      { once: true }
    );
  }
  return landed;
}

export function generateAPIs(
  context: Context,
  setContext: (
    recipe: (ctx: Context) => void,
    options?: SetContextOptions
  ) => void,
  handleUndo: () => void,
  handleRedo: () => void,
  settings: Required<Settings>,
  cellInput: HTMLDivElement | null,
  scrollbarX: HTMLDivElement | null,
  scrollbarY: HTMLDivElement | null,
  workbookContainer: RefObject<HTMLDivElement | null>
) {
  type ApiCall = {
    name: string;
    args: any[];
  };

  /**
   * Focus a region's single keyboard entry point, resolved from a selector.
   * Thin wrapper over `enterRegion` — see its note for why that is a shared,
   * module-level function rather than logic inlined here.
   */
  const focusRegion = (containerSelector: string) => {
    // `.current` is read here, at call time, not captured when this memo runs:
    // on the first render the ref is not attached yet, so a host calling this
    // from its own mount effect would otherwise get a silent false.
    const region =
      workbookContainer.current?.querySelector<HTMLElement>(containerSelector);
    if (!region) return false;
    return enterRegion(region);
  };

  return {
    /**
     * Move keyboard focus to the cell grid, ready to navigate.
     *
     * Deliberately not `focusRegion`: the grid root contains focusable controls
     * of its own (the select-all corner, the filter funnels), and `focusRegion`
     * picks the first `[tabindex="0"]` it finds inside the region -- landing on
     * one of those makes `handleGlobalKeyDown`'s grid guard classify focus as
     * *outside* the grid, so the arrow keys would move nothing.
     *
     * This used to be justified by the root carrying tabIndex -1, which made it
     * the only element `focusRegion` could not have chosen. The root is now a
     * real tab stop (tabIndex 0, `SheetOverlay/index.tsx`), so that particular
     * argument is spent -- but the conclusion is unchanged and now matters
     * more, not less: `focusRegion` would still prefer a control *inside* the
     * grid over the root, and the root is now exactly where Tab and Ctrl+Alt+S
     * both land, so this API has to agree with them. Focusing the root
     * directly is what keeps all three routes on one element.
     *
     * With an edit already open, the editor is where focus belongs instead.
     * That is not a departure from the paragraph above: the rule it states is
     * that no route may park a caret in a cell *nobody asked to edit*, and an
     * open edit is one the user did ask for -- which is why `InputBox` gives
     * the editor tabIndex 0 in exactly this state and -1 otherwise. Landing on
     * the root mid-edit left the edit painted but unusable: the printable-key
     * and point-mode-arrow branches of `handleGlobalKeyDown` both return before
     * the tail that parks focus on the editor, so no key pressed in the grid
     * could recover it (WCAG 2.1.1, 2.4.3). See `onGridFocus` in
     * `SheetOverlay/index.tsx` for the same restoration on the routes that do
     * not come through here.
     */
    focusSpreadsheet: () => {
      const grid = workbookContainer.current?.querySelector<HTMLElement>(
        `.${GRID_ROOT_CLASS}`
      );
      if (cellInput && context.luckysheetCellUpdate.length > 0) {
        // `preventScroll` for the reason `focusAfterCommit` gives: `InputBox`
        // parks this element at `left: -10000` whenever it has no selection to
        // sit on, so a plain focus lets the browser scroll an embedder's layout
        // sideways. The caret because focus alone is not enough -- an editor
        // focused with no caret in its text still accepts nothing.
        cellInput.focus({ preventScroll: true });
        if (document.activeElement !== cellInput) return false;
        moveToEnd(cellInput);
        // No arrival announcement while editing: landing on the editor already
        // announces the cell, that it is editable, and the text entered so far.
        return true;
      }
      if (!grid) return false;
      grid.focus();
      if (document.activeElement !== grid) return false;
      // Arrival moves focus without moving the selection, so `#sr-selection`
      // renders the text it already held and never fires. Bumping a counter is
      // what tells the arrival region a return happened -- see
      // `spreadsheetFocusReturnCount`.
      setContext(
        (draftCtx) => {
          draftCtx.spreadsheetFocusReturnCount =
            (draftCtx.spreadsheetFocusReturnCount ?? 0) + 1;
        },
        { noHistory: true }
      );
      return true;
    },

    /** Move keyboard focus to the toolbar. */
    focusToolbar: () => focusRegion(".fortune-toolbar"),

    /** Move keyboard focus to the sheet tab bar. */
    focusSheetTabs: () => focusRegion(".fortune-sheettab-container-c"),

    openShortcutsDialog: () => {
      setContext((draftCtx) => {
        draftCtx.showShortcutsDialog = true;
      });
    },

    closeShortcutsDialog: () => {
      setContext((draftCtx) => {
        draftCtx.showShortcutsDialog = false;
      });
    },

    applyOp: (ops: Op[]) => {
      setContext(
        (ctx_) => {
          const [patches, specialOps] = opToPatch(ctx_, ops);
          if (specialOps.length > 0) {
            const [specialOp] = specialOps;
            if (specialOp.op === "insertRowCol") {
              try {
                insertRowCol(ctx_, specialOp.value, false);
              } catch (e: any) {
                console.error(e);
              }
            } else if (specialOp.op === "deleteRowCol") {
              deleteRowCol(ctx_, specialOp.value);
            } else if (specialOp.op === "addSheet") {
              const name = patches.filter(
                (path) => path.path[0] === "name"
              )?.[0]?.value;
              if (specialOp.value?.id) {
                addSheet(
                  ctx_,
                  settings,
                  specialOp.value.id,
                  false,
                  name,
                  specialOp.value
                );
              }
              // 添加addSheet完后，给sheet初始化data
              const fileIndex = getSheetIndex(
                ctx_,
                specialOp.value.id
              ) as number;
              api.initSheetData(ctx_, fileIndex, specialOp.value);
            } else if (specialOp.op === "deleteSheet") {
              deleteSheet(ctx_, specialOp.value.id);
              patches.length = 0;
            }
          }
          if (ops[0]?.path?.[0] === "filter_select")
            ctx_.luckysheet_filter_save = ops[0].value;
          else if (ops[0]?.path?.[0] === "hide") {
            //  hide sheet
            if (ctx_.currentSheetId === ops[0].id) {
              const shownSheets = ctx_.luckysheetfile.filter(
                (sheet) =>
                  (_.isUndefined(sheet.hide) || sheet?.hide !== 1) &&
                  sheet.id !== ops[0].id
              );
              ctx_.currentSheetId = _.sortBy(
                shownSheets,
                (sheet) => sheet.order
              )[0].id as string;
            }
          }
          createFilterOptions(ctx_, ctx_.luckysheet_filter_save, ops[0]?.id);
          if (patches.length === 0) return;
          try {
            applyPatches(ctx_, patches);
          } catch (e) {
            console.error(e);
          }
        },
        { noHistory: true }
      );
    },

    getCellValue: (
      row: number,
      column: number,
      options: api.CommonOptions & { type?: keyof Cell } = {}
    ) => api.getCellValue(context, row, column, options),

    setCellValue: (
      row: number,
      column: number,
      value: any,
      options: api.CommonOptions & { type?: keyof Cell } = {}
    ) =>
      setContext((draftCtx) =>
        api.setCellValue(draftCtx, row, column, value, cellInput, options)
      ),

    clearCell: (row: number, column: number, options: api.CommonOptions = {}) =>
      setContext((draftCtx) => api.clearCell(draftCtx, row, column, options)),

    setCellFormat: (
      row: number,
      column: number,
      attr: keyof Cell,
      value: any,
      options: api.CommonOptions = {}
    ) =>
      setContext((draftCtx) =>
        api.setCellFormat(draftCtx, row, column, attr, value, options)
      ),

    autoFillCell: (
      copyRange: SingleRange,
      applyRange: SingleRange,
      direction: "up" | "down" | "left" | "right"
    ) =>
      setContext((draftCtx) =>
        api.autoFillCell(draftCtx, copyRange, applyRange, direction)
      ),

    freeze: (
      type: "row" | "column" | "both",
      range: { row: number; column: number },
      options: api.CommonOptions = {}
    ) => setContext((draftCtx) => api.freeze(draftCtx, type, range, options)),

    insertRowOrColumn: (
      type: "row" | "column",
      index: number,
      count: number,
      direction: "lefttop" | "rightbottom" = "rightbottom",
      options: api.CommonOptions = {}
    ) =>
      setContext((draftCtx) =>
        api.insertRowOrColumn(draftCtx, type, index, count, direction, options)
      ),

    deleteRowOrColumn: (
      type: "row" | "column",
      start: number,
      end: number,
      options: api.CommonOptions = {}
    ) =>
      setContext((draftCtx) =>
        api.deleteRowOrColumn(draftCtx, type, start, end, options)
      ),

    hideRowOrColumn: (rowOrColInfo: string[], type: "row" | "column") =>
      setContext((draftCtx) =>
        api.hideRowOrColumn(draftCtx, rowOrColInfo, type)
      ),

    showRowOrColumn: (rowOrColInfo: string[], type: "row" | "column") =>
      setContext((draftCtx) =>
        api.showRowOrColumn(draftCtx, rowOrColInfo, type)
      ),

    setRowHeight: (
      rowInfo: Record<string, number>,
      options: api.CommonOptions = {},
      custom: boolean = false
    ) =>
      setContext((draftCtx) =>
        api.setRowHeight(draftCtx, rowInfo, options, custom)
      ),

    setColumnWidth: (
      columnInfo: Record<string, number>,
      options: api.CommonOptions = {},
      custom: boolean = false
    ) =>
      setContext((draftCtx) =>
        api.setColumnWidth(draftCtx, columnInfo, options, custom)
      ),

    getRowHeight: (rows: number[], options: api.CommonOptions = {}) =>
      api.getRowHeight(context, rows, options),

    getColumnWidth: (columns: number[], options: api.CommonOptions = {}) =>
      api.getColumnWidth(context, columns, options),

    getSelection: () => api.getSelection(context),

    getFlattenRange: (range: Range) => api.getFlattenRange(context, range),

    getCellsByFlattenRange: (range?: { r: number; c: number }[]) =>
      api.getCellsByFlattenRange(context, range),

    getSelectionCoordinates: () => api.getSelectionCoordinates(context),

    getCellsByRange: (range: Selection, options: api.CommonOptions = {}) =>
      api.getCellsByRange(context, range, options),

    getHtmlByRange: (range: Range, options: api.CommonOptions = {}) =>
      api.getHtmlByRange(context, range, options),

    setSelection: (range: Range, options: api.CommonOptions = {}) =>
      setContext((draftCtx) => api.setSelection(draftCtx, range, options)),

    setCellValuesByRange: (
      data: any[][],
      range: SingleRange,
      options: api.CommonOptions = {}
    ) =>
      setContext((draftCtx) =>
        api.setCellValuesByRange(draftCtx, data, range, cellInput, options)
      ),

    setCellFormatByRange: (
      attr: keyof Cell,
      value: any,
      range: Range | SingleRange,
      options: api.CommonOptions = {}
    ) =>
      setContext((draftCtx) =>
        api.setCellFormatByRange(draftCtx, attr, value, range, options)
      ),

    mergeCells: (
      ranges: Range,
      type: string,
      options: api.CommonOptions = {}
    ) =>
      setContext((draftCtx) => api.mergeCells(draftCtx, ranges, type, options)),

    cancelMerge: (ranges: Range, options: api.CommonOptions = {}) =>
      setContext((draftCtx) => api.cancelMerge(draftCtx, ranges, options)),

    getAllSheets: () => api.getAllSheets(context),

    getSheet: (options: api.CommonOptions = {}) =>
      api.getSheetWithLatestCelldata(context, options),

    addSheet: (sheetId?: string) => {
      const existingSheetIds = api
        .getAllSheets(context)
        .map((sheet) => sheet.id || "");
      if (sheetId && existingSheetIds.includes(sheetId)) {
        console.error(
          `Failed to add new sheet: A sheet with the id "${sheetId}" already exists. Please use a unique sheet id.`
        );
      } else {
        setContext((draftCtx) => api.addSheet(draftCtx, settings, sheetId));
      }
    },

    deleteSheet: (options: api.CommonOptions = {}) =>
      setContext((draftCtx) => api.deleteSheet(draftCtx, options)),

    updateSheet: (data: Sheet[]) =>
      setContext((draftCtx) => api.updateSheet(draftCtx, data)),

    activateSheet: (options: api.CommonOptions = {}) =>
      setContext((draftCtx) => api.activateSheet(draftCtx, options)),

    setSheetName: (name: string, options: api.CommonOptions = {}) =>
      setContext((draftCtx) => api.setSheetName(draftCtx, name, options)),

    setSheetOrder: (orderList: Record<string, number>) =>
      setContext((draftCtx) => api.setSheetOrder(draftCtx, orderList)),

    scroll: (options: {
      scrollLeft?: number;
      scrollTop?: number;
      targetRow?: number;
      targetColumn?: number;
    }) => api.scroll(context, scrollbarX, scrollbarY, options),

    addPresences: (newPresences: Presence[]) => {
      setContext((draftCtx) => {
        draftCtx.presences = _.differenceBy(
          draftCtx.presences || [],
          newPresences,
          (v) => (v.userId == null ? v.username : v.userId)
        ).concat(newPresences);
      });
    },

    removePresences: (
      arr: {
        username: string;
        userId?: string;
      }[]
    ) => {
      setContext((draftCtx) => {
        if (draftCtx.presences != null) {
          draftCtx.presences = _.differenceBy(draftCtx.presences, arr, (v) =>
            v.userId == null ? v.username : v.userId
          );
        }
      });
    },

    handleUndo,
    handleRedo,

    calculateFormula: (id?: string, range?: SingleRange) => {
      setContext((draftCtx) => {
        api.calculateFormula(draftCtx, id, range);
      });
    },

    dataToCelldata: (data: CellMatrix | undefined) => {
      return api.dataToCelldata(data);
    },

    celldataToData: (
      celldata: CellWithRowAndCol[],
      rowCount?: number,
      colCount?: number
    ) => {
      return api.celldataToData(celldata, rowCount, colCount);
    },

    batchCallApis: (apiCalls: ApiCall[]) => {
      setContext((draftCtx) => {
        apiCalls.forEach((apiCall) => {
          const { name, args } = apiCall;
          if (typeof (api as any)[name] === "function") {
            (api as any)[name](draftCtx, ...args);
          } else {
            console.warn(`API ${name} does not exist`);
          }
        });
      });
    },
  };
}
