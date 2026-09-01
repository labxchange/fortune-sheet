import {
  Context,
  locale,
  handleCopy,
  handlePasteByClick,
  deleteRowCol,
  insertRowCol,
  removeActiveImage,
  deleteSelectedCellText,
  sortSelection,
  createFilter,
  showImgChooser,
  handleLink,
  hideSelected,
  showSelected,
  getSheetIndex,
  api,
  isAllowEdit,
  jfrefreshgrid,
} from "@fortune-sheet/core";
import _ from "lodash";
import React, { useContext, useRef, useCallback, useLayoutEffect } from "react";
import regeneratorRuntime from "regenerator-runtime";
import WorkbookContext, { SetContextOptions } from "../../context";
import { useAlert } from "../../hooks/useAlert";
import { useDialog } from "../../hooks/useDialog";
import { useEscapeToClose } from "../../hooks/useEscapeToClose";
import { useOutsideClick } from "../../hooks/useOutsideClick";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import { focusAfterCommit } from "../../utils/keyboardActivation";
import { filterUnchanged } from "../../utils/filterDom";
import Divider from "./Divider";
import "./index.css";
import Menu from "./Menu";
import CustomSort, { SORT_DIALOG_TITLE_ID } from "../CustomSort";
import { announce } from "../../hooks/useContextMenuAnnouncements";

/** Singular and plural are separate keys so no reader ever hears "1 rows". */
function countKey(count: number, singular: string, plural: string) {
  return count === 1 ? singular : plural;
}

const ContextMenu: React.FC = () => {
  const { showDialog } = useDialog();
  const containerRef = useRef<HTMLDivElement>(null);
  const { context, setContext, settings, refs } = useContext(WorkbookContext);
  const { contextMenu } = context;
  // Points at the committed context, for the deferred focus decision below:
  // the render's `context` is a commit behind by the time that callback runs.
  const contextRef = useRef(context);
  contextRef.current = context;
  const { showAlert } = useAlert();
  const { rightclick, drag, generalDialog, info } = locale(context);

  const closeContextMenu = useCallback(() => {
    setContext((draftCtx) => {
      draftCtx.contextMenu = {};
    });
  }, [setContext]);

  /*
   * Where focus belongs once a context-menu action has committed (WCAG 2.4.3).
   *
   * Closing the menu used to strand focus on `<body>`: `useEscapeToClose`
   * restores focus on unmount, but only to whatever held it when the menu
   * opened, and a right-click on the grid lands on nothing focusable — so the
   * "restore" was `<body>` focusing `<body>`. Only the `filter` row had been
   * fixed; every other row inherited the bug.
   *
   * `commitAndSettle` covers rows that rewrite the selection and leave the menu
   * as the last thing on screen (nearly all of them); `focusGridBeforeHandoff`
   * covers `sort`, `image` and `link`, which hand focus to a dialog or chooser.
   */

  /**
   * Commit a menu action, then settle focus back on the grid — but only if the
   * action actually did something.
   *
   * "Did it act?" cannot be a flag set inside the recipe: `setContext` hands the
   * recipe to React as a functional updater, so it runs during reconcile and
   * anything read straight afterwards is still pre-commit. The check is deferred
   * alongside the focus call and reads the *committed* context via `contextRef`.
   *
   * The signal is the announcement `seq`: every success path calls `announce`
   * and every bail-out (multi-selection, read-only, over-limit, invalid input)
   * does not, so one check keeps the status region and the focus move in
   * agreement. That matters most on the alert paths — `showAlert` opens a
   * dialog, and pulling focus to the grid underneath it would be worse than the
   * bug being fixed.
   */
  const commitAndSettle = useCallback(
    (recipe: (draftCtx: Context) => void, options?: SetContextOptions) => {
      const seqBefore = contextRef.current.contextMenuAnnouncement?.seq ?? 0;
      setContext(recipe, options);
      focusAfterCommit(() =>
        (contextRef.current.contextMenuAnnouncement?.seq ?? 0) > seqBefore
          ? refs.cellInput.current
          : null
      );
    },
    [refs.cellInput, setContext]
  );

  /**
   * Synchronous, and called before the dialog opens — deferring would be too
   * late. `Dialog` captures `document.activeElement` in its mount effect to know
   * where to return focus on close, and React runs unmount cleanups before mount
   * effects, so the menu's own restore to `<body>` would get there first.
   *
   * Focusing inline also fires `focusin` outside the menu, which flips
   * `useEscapeToClose`'s `focusInsideContainer` false and makes it skip its
   * restore — so the two never fight over the same frame.
   */
  const focusGridBeforeHandoff = useCallback(() => {
    refs.cellInput.current?.focus();
  }, [refs.cellInput]);
  /* The only popup in the app that never had one. It closes today purely
   * because core's grid mousedown zeroes `ctx.contextMenu`
   * (`core/src/events/mouse.ts`), so a press on the toolbar, the name box, the
   * formula bar or the sheet-tab strip left it sitting open over the page. */
  useOutsideClick(containerRef, closeContextMenu, [closeContextMenu]);
  useEscapeToClose({
    open: !_.isEmpty(contextMenu),
    onClose: closeContextMenu,
    containerRef,
    // WCAG 2.4.11 — an absolutely-positioned menu left open behind whatever the
    // user tabbed to obscures it. No submenus here, so no withinRefs.
    closeOnFocusOut: true,
  });
  useRovingFocus({
    containerRef,
    orientation: "vertical",
    enabled: !_.isEmpty(contextMenu),
  });
  const getMenuElement = useCallback(
    (name: string, i: number) => {
      const selection = context.luckysheet_select_save?.[0];
      if (name === "|") {
        return <Divider key={`divider-${i}`} />;
      }
      if (name === "copy") {
        return (
          <Menu
            key={name}
            role="button"
            onClick={() => {
              commitAndSettle((draftCtx) => {
                if (draftCtx.luckysheet_select_save?.length! > 1) {
                  showAlert(rightclick.noMulti, "ok");
                  draftCtx.contextMenu = {};
                  return;
                }
                handleCopy(draftCtx);
                announce(draftCtx, "rightclick.announceCopied");
                draftCtx.contextMenu = {};
              });
            }}
          >
            {rightclick.copy}
          </Menu>
        );
      }
      if (name === "paste" && regeneratorRuntime) {
        return (
          <Menu
            key={name}
            role="button"
            onClick={async () => {
              let clipboardText = "";
              const sessionClipboardText =
                sessionStorage.getItem("localClipboard") || "";

              try {
                clipboardText = await navigator.clipboard.readText();
              } catch (err) {
                console.warn(
                  "Clipboard access blocked. Attempting to use sessionStorage fallback."
                );
              }

              const finalText = clipboardText || sessionClipboardText;

              commitAndSettle((draftCtx) => {
                handlePasteByClick(draftCtx, finalText);
                announce(draftCtx, "rightclick.announcePasted");
                draftCtx.contextMenu = {};
              });
            }}
          >
            {rightclick.paste}
          </Menu>
        );
      }
      if (name === "insert-column") {
        return selection?.row_select
          ? null
          : ["left", "right"].map((dir) => (
              <Menu
                key={`add-col-${dir}`}
                onClick={(_e, container) => {
                  const position =
                    context.luckysheet_select_save?.[0]?.column?.[0];
                  if (position == null) return;
                  const countStr = container.querySelector("input")?.value;
                  if (countStr == null) return;
                  const count = parseInt(countStr, 10);
                  if (count < 1) return;
                  const direction = dir === "left" ? "lefttop" : "rightbottom";
                  const insertRowColOp: SetContextOptions["insertRowColOp"] = {
                    type: "column",
                    index: position,
                    count,
                    direction,
                    id: context.currentSheetId,
                  };
                  commitAndSettle(
                    (draftCtx) => {
                      try {
                        insertRowCol(draftCtx, insertRowColOp);
                        // Inside the try, after the insert: an over-limit or
                        // read-only throw leaves the region silent and focus
                        // untouched.
                        announce(
                          draftCtx,
                          countKey(
                            count,
                            `rightclick.announceColumnInserted${
                              dir === "left" ? "Left" : "Right"
                            }`,
                            `rightclick.announceColumnsInserted${
                              dir === "left" ? "Left" : "Right"
                            }`
                          ),
                          { count }
                        );
                        draftCtx.contextMenu = {};
                      } catch (err: any) {
                        if (err.message === "maxExceeded")
                          showAlert(rightclick.columnOverLimit, "ok");
                        else if (err.message === "readOnly")
                          showAlert(
                            rightclick.cannotInsertOnColumnReadOnly,
                            "ok"
                          );
                        draftCtx.contextMenu = {};
                      }
                    },
                    {
                      insertRowColOp,
                    }
                  );
                }}
              >
                <>
                  {_.startsWith(context.lang ?? "", "zh") && (
                    <>
                      {rightclick.to}
                      <span className={`luckysheet-cols-rows-shift-${dir}`}>
                        {(rightclick as any)[dir]}
                      </span>
                    </>
                  )}
                  {`${rightclick.insert}  `}
                  {/*
                    aria-label rather than a visible <label>: the input sits mid
                    phrase ("Insert [1] column left"), so there is no contiguous
                    text to wrap. `placeholder`, which is what this shipped with,
                    is only a last-resort fallback for the accessible name and is
                    reported by axe (WCAG 3.3.2, 4.1.2). The direction is
                    appended because both rows render at once.
                  */}
                  <input
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    tabIndex={0}
                    type="text"
                    className="luckysheet-mousedown-cancel"
                    aria-label={`${rightclick.insertColumnCountLabel} ${
                      (rightclick as any)[dir]
                    }`}
                    placeholder={rightclick.number}
                    defaultValue="1"
                  />
                  <span className="luckysheet-cols-rows-shift-word luckysheet-mousedown-cancel">
                    {`${rightclick.column}  `}
                  </span>
                  {!_.startsWith(context.lang ?? "", "zh") && (
                    <span className={`luckysheet-cols-rows-shift-${dir}`}>
                      {(rightclick as any)[dir]}
                    </span>
                  )}
                </>
              </Menu>
            ));
      }
      if (name === "insert-row") {
        return selection?.column_select
          ? null
          : ["top", "bottom"].map((dir) => (
              <Menu
                key={`add-row-${dir}`}
                onClick={(e, container) => {
                  const position =
                    context.luckysheet_select_save?.[0]?.row?.[0];
                  if (position == null) return;
                  const countStr = container.querySelector("input")?.value;
                  if (countStr == null) return;
                  const count = parseInt(countStr, 10);
                  if (count < 1) return;
                  const direction = dir === "top" ? "lefttop" : "rightbottom";
                  const insertRowColOp: SetContextOptions["insertRowColOp"] = {
                    type: "row",
                    index: position,
                    count,
                    direction,
                    id: context.currentSheetId,
                  };
                  commitAndSettle(
                    (draftCtx) => {
                      try {
                        insertRowCol(draftCtx, insertRowColOp);
                        announce(
                          draftCtx,
                          countKey(
                            count,
                            `rightclick.announceRowInserted${
                              dir === "top" ? "Above" : "Below"
                            }`,
                            `rightclick.announceRowsInserted${
                              dir === "top" ? "Above" : "Below"
                            }`
                          ),
                          { count }
                        );
                        draftCtx.contextMenu = {};
                      } catch (err: any) {
                        if (err.message === "maxExceeded")
                          showAlert(rightclick.rowOverLimit, "ok");
                        else if (err.message === "readOnly")
                          showAlert(rightclick.cannotInsertOnRowReadOnly, "ok");
                        draftCtx.contextMenu = {};
                      }
                    },
                    { insertRowColOp }
                  );
                }}
              >
                <>
                  {_.startsWith(context.lang ?? "", "zh") && (
                    <>
                      {rightclick.to}
                      <span className={`luckysheet-cols-rows-shift-${dir}`}>
                        {(rightclick as any)[dir]}
                      </span>
                    </>
                  )}
                  {`${rightclick.insert}  `}
                  {/* Same reasoning as insert-column above. */}
                  <input
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    tabIndex={0}
                    type="text"
                    className="luckysheet-mousedown-cancel"
                    aria-label={`${rightclick.insertRowCountLabel} ${
                      (rightclick as any)[dir]
                    }`}
                    placeholder={rightclick.number}
                    defaultValue="1"
                  />
                  <span className="luckysheet-cols-rows-shift-word luckysheet-mousedown-cancel">
                    {`${rightclick.row}  `}
                  </span>
                  {!_.startsWith(context.lang ?? "", "zh") && (
                    <span className={`luckysheet-cols-rows-shift-${dir}`}>
                      {(rightclick as any)[dir]}
                    </span>
                  )}
                </>
              </Menu>
            ));
      }
      if (name === "delete-column") {
        return (
          selection?.column_select && (
            <Menu
              key="delete-col"
              role="button"
              onClick={() => {
                if (!selection) return;
                const [st_index, ed_index] = selection.column;
                const deleteRowColOp: SetContextOptions["deleteRowColOp"] = {
                  type: "column",
                  start: st_index,
                  end: ed_index,
                  id: context.currentSheetId,
                };
                commitAndSettle(
                  (draftCtx) => {
                    if (draftCtx.luckysheet_select_save?.length! > 1) {
                      showAlert(rightclick.noMulti, "ok");
                      draftCtx.contextMenu = {};
                      draftCtx.dataVerificationDropDownList = false;
                      return;
                    }
                    const slen = ed_index - st_index + 1;
                    const index = getSheetIndex(
                      draftCtx,
                      context.currentSheetId
                    ) as number;
                    if (
                      draftCtx.luckysheetfile[index].data?.[0]?.length! <= slen
                    ) {
                      showAlert(rightclick.cannotDeleteAllColumn, "ok");
                      draftCtx.contextMenu = {};
                      return;
                    }
                    try {
                      deleteRowCol(draftCtx, deleteRowColOp);
                      announce(
                        draftCtx,
                        countKey(
                          slen,
                          "rightclick.announceColumnDeleted",
                          "rightclick.announceColumnsDeleted"
                        ),
                        { count: slen }
                      );
                    } catch (e: any) {
                      if (e.message === "readOnly") {
                        showAlert(rightclick.cannotDeleteColumnReadOnly, "ok");
                      }
                    }
                    draftCtx.contextMenu = {};
                  },
                  { deleteRowColOp }
                );
              }}
            >
              {rightclick.deleteSelected}
              {rightclick.column}
            </Menu>
          )
        );
      }
      if (name === "delete-row") {
        return (
          selection?.row_select && (
            <Menu
              key="delete-row"
              role="button"
              onClick={() => {
                if (!selection) return;
                const [st_index, ed_index] = selection.row;
                const deleteRowColOp: SetContextOptions["deleteRowColOp"] = {
                  type: "row",
                  start: st_index,
                  end: ed_index,
                  id: context.currentSheetId,
                };
                commitAndSettle(
                  (draftCtx) => {
                    if (draftCtx.luckysheet_select_save?.length! > 1) {
                      showAlert(rightclick.noMulti, "ok");
                      draftCtx.contextMenu = {};
                      return;
                    }
                    const slen = ed_index - st_index + 1;
                    const index = getSheetIndex(
                      draftCtx,
                      context.currentSheetId
                    ) as number;
                    if (draftCtx.luckysheetfile[index].data?.length! <= slen) {
                      showAlert(rightclick.cannotDeleteAllRow, "ok");
                      draftCtx.contextMenu = {};
                      return;
                    }
                    try {
                      deleteRowCol(draftCtx, deleteRowColOp);
                      announce(
                        draftCtx,
                        countKey(
                          slen,
                          "rightclick.announceRowDeleted",
                          "rightclick.announceRowsDeleted"
                        ),
                        { count: slen }
                      );
                    } catch (e: any) {
                      if (e.message === "readOnly") {
                        showAlert(rightclick.cannotDeleteRowReadOnly, "ok");
                      }
                    }
                    draftCtx.contextMenu = {};
                  },
                  { deleteRowColOp }
                );
              }}
            >
              {rightclick.deleteSelected}
              {rightclick.row}
            </Menu>
          )
        );
      }
      if (name === "hide-row") {
        return (
          selection?.row_select === true &&
          ["hideSelected", "showHide"].map((item) => (
            <Menu
              key={item}
              role="button"
              onClick={() => {
                commitAndSettle((draftCtx) => {
                  let msg = "";
                  const count = _.reduce(
                    draftCtx.luckysheet_select_save,
                    (total, section) =>
                      total + (section.row[1] - section.row[0] + 1),
                    0
                  );
                  if (item === "hideSelected") {
                    msg = hideSelected(draftCtx, "row");
                  } else if (item === "showHide") {
                    showSelected(draftCtx, "row");
                  }
                  if (msg === "noMulti") {
                    showDialog(drag.noMulti);
                  } else if (item === "hideSelected") {
                    announce(
                      draftCtx,
                      countKey(
                        count,
                        "rightclick.announceRowHidden",
                        "rightclick.announceRowsHidden"
                      ),
                      { count }
                    );
                  } else {
                    // No count: showSelected reports nothing back about how much
                    // it unhid.
                    announce(draftCtx, "rightclick.announceRowsShown");
                  }
                  draftCtx.contextMenu = {};
                });
              }}
            >
              {(rightclick as any)[item] + rightclick.row}
            </Menu>
          ))
        );
      }
      if (name === "hide-column") {
        return (
          selection?.column_select === true &&
          ["hideSelected", "showHide"].map((item) => (
            <Menu
              key={item}
              role="button"
              onClick={() => {
                commitAndSettle((draftCtx) => {
                  let msg = "";
                  const count = _.reduce(
                    draftCtx.luckysheet_select_save,
                    (total, section) =>
                      total + (section.column[1] - section.column[0] + 1),
                    0
                  );
                  if (item === "hideSelected") {
                    msg = hideSelected(draftCtx, "column");
                  } else if (item === "showHide") {
                    showSelected(draftCtx, "column");
                  }
                  if (msg === "noMulti") {
                    showDialog(drag.noMulti);
                  } else if (item === "hideSelected") {
                    announce(
                      draftCtx,
                      countKey(
                        count,
                        "rightclick.announceColumnHidden",
                        "rightclick.announceColumnsHidden"
                      ),
                      { count }
                    );
                  } else {
                    announce(draftCtx, "rightclick.announceColumnsShown");
                  }
                  draftCtx.contextMenu = {};
                });
              }}
            >
              {(rightclick as any)[item] + rightclick.column}
            </Menu>
          ))
        );
      }
      if (name === "set-row-height") {
        const rowHeight = selection?.height || context.defaultrowlen;
        const shownRowHeight = context.luckysheet_select_save?.some(
          (section) =>
            section.height_move !==
            (rowHeight + 1) * (section.row[1] - section.row[0] + 1) - 1
        )
          ? ""
          : rowHeight;
        return context.luckysheet_select_save?.some(
          (section) => section.row_select
        ) ? (
          <Menu
            key="set-row-height"
            onClick={(e, container) => {
              const targetRowHeight = container.querySelector("input")?.value;
              commitAndSettle((draftCtx) => {
                if (
                  _.isUndefined(targetRowHeight) ||
                  targetRowHeight === "" ||
                  parseInt(targetRowHeight, 10) <= 0 ||
                  parseInt(targetRowHeight, 10) > 545
                ) {
                  showAlert(info.tipRowHeightLimit, "ok");
                  draftCtx.contextMenu = {};
                  return;
                }
                const numRowHeight = parseInt(targetRowHeight, 10);
                const rowHeightList: Record<string, number> = {};
                _.forEach(draftCtx.luckysheet_select_save, (section) => {
                  for (
                    let rowNum = section.row[0];
                    rowNum <= section.row[1];
                    rowNum += 1
                  ) {
                    rowHeightList[rowNum] = numRowHeight;
                  }
                });
                api.setRowHeight(draftCtx, rowHeightList, {}, true);
                announce(draftCtx, "rightclick.announceRowHeightSet", {
                  value: numRowHeight,
                });
                draftCtx.contextMenu = {};
              });
            }}
          >
            {rightclick.row}
            {rightclick.height}
            {/*
              `{row}{height}` renders as two adjacent words with no separator
              and does not read as a phrase, so the name comes from a locale key
              stating the unit instead of being assembled from the fragments.
            */}
            <input
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              tabIndex={0}
              type="number"
              min={1}
              max={545}
              className="luckysheet-mousedown-cancel"
              aria-label={rightclick.rowHeightLabel}
              placeholder={rightclick.number}
              defaultValue={shownRowHeight}
              style={{ width: "40px" }}
            />
            px
          </Menu>
        ) : null;
      }
      if (name === "set-column-width") {
        const colWidth = selection?.width || context.defaultcollen;
        const shownColWidth = context.luckysheet_select_save?.some(
          (section) =>
            section.width_move !==
            (colWidth + 1) * (section.column[1] - section.column[0] + 1) - 1
        )
          ? ""
          : colWidth;
        return context.luckysheet_select_save?.some(
          (section) => section.column_select
        ) ? (
          <Menu
            key="set-column-width"
            onClick={(e, container) => {
              const targetColWidth = container.querySelector("input")?.value;
              commitAndSettle((draftCtx) => {
                if (
                  _.isUndefined(targetColWidth) ||
                  targetColWidth === "" ||
                  parseInt(targetColWidth, 10) <= 0 ||
                  parseInt(targetColWidth, 10) > 2038
                ) {
                  showAlert(info.tipColumnWidthLimit, "ok");
                  draftCtx.contextMenu = {};
                  return;
                }
                const numColWidth = parseInt(targetColWidth, 10);
                const colWidthList: Record<string, number> = {};
                _.forEach(draftCtx.luckysheet_select_save, (section) => {
                  for (
                    let colNum = section.column[0];
                    colNum <= section.column[1];
                    colNum += 1
                  ) {
                    colWidthList[colNum] = numColWidth;
                  }
                });
                api.setColumnWidth(draftCtx, colWidthList, {}, true);
                announce(draftCtx, "rightclick.announceColumnWidthSet", {
                  value: numColWidth,
                });
                draftCtx.contextMenu = {};
              });
            }}
          >
            {rightclick.column}
            {rightclick.width}
            {/* Same reasoning as set-row-height above. */}
            <input
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              tabIndex={0}
              type="number"
              min={1}
              max={545}
              className="luckysheet-mousedown-cancel"
              aria-label={rightclick.columnWidthLabel}
              placeholder={rightclick.number}
              defaultValue={shownColWidth}
              style={{ width: "40px" }}
            />
            px
          </Menu>
        ) : null;
      }
      if (name === "clear") {
        return (
          <Menu
            key={name}
            role="button"
            onClick={() => {
              commitAndSettle((draftCtx) => {
                const allowEdit = isAllowEdit(draftCtx);
                if (!allowEdit) return;
                if (draftCtx.activeImg != null) {
                  removeActiveImage(draftCtx);
                  announce(draftCtx, "rightclick.announceCleared");
                } else {
                  const msg = deleteSelectedCellText(draftCtx);
                  if (msg === "partMC") {
                    showDialog(generalDialog.partiallyError, "ok");
                  } else if (msg === "allowEdit") {
                    showDialog(generalDialog.readOnlyError, "ok");
                  } else if (msg === "dataNullError") {
                    showDialog(generalDialog.dataNullError, "ok");
                  } else {
                    // Only the path that actually cleared something — the three
                    // above open a dialog and must not lose focus to the grid.
                    announce(draftCtx, "rightclick.announceCleared");
                  }
                }
                draftCtx.contextMenu = {};
                jfrefreshgrid(draftCtx, null, undefined);
              });
            }}
          >
            {rightclick.clearContent}
          </Menu>
        );
      }
      if (name === "orderAZ") {
        return (
          <Menu
            key={name}
            role="button"
            onClick={() => {
              commitAndSettle((draftCtx) => {
                sortSelection(draftCtx, true);
                announce(draftCtx, "rightclick.announceSortedAsc");
                draftCtx.contextMenu = {};
              });
            }}
          >
            {rightclick.orderAZ}
          </Menu>
        );
      }
      if (name === "orderZA") {
        return (
          <Menu
            key={name}
            role="button"
            onClick={() => {
              commitAndSettle((draftCtx) => {
                sortSelection(draftCtx, false);
                announce(draftCtx, "rightclick.announceSortedDesc");
                draftCtx.contextMenu = {};
              });
            }}
          >
            {rightclick.orderZA}
          </Menu>
        );
      }
      if (name === "sort") {
        return (
          <Menu
            key={name}
            role="button"
            onClick={() => {
              // No announcement: the dialog opening, and being named, is the
              // feedback.
              focusGridBeforeHandoff();
              setContext((draftCtx) => {
                // Named from CustomSort's own heading ("Sort range from A1 to
                // D20") — more use than a generic "Sort", and no new locale key.
                showDialog(<CustomSort />, {
                  labelledBy: SORT_DIALOG_TITLE_ID,
                });
                draftCtx.contextMenu = {};
              });
            }}
          >
            {rightclick.sortSelection}
          </Menu>
        );
      }
      if (name === "filter") {
        // `createFilter` is a toggle — it clears an existing filter and creates
        // one otherwise — but the row said "Filter" either way, so the user
        // could not tell which was about to happen (WCAG 4.1.2). Derived from
        // the same value the handler reads as `filterBefore`, so label and
        // behaviour cannot drift. The visible text *is* the accessible name; a
        // separate aria-label would be a second thing to keep in sync and could
        // disagree with what is announced (WCAG 2.5.3).
        const filterApplied = _.size(context.luckysheet_filter_save) > 0;
        return (
          <Menu
            key={name}
            role="button"
            onClick={() => {
              const filterBefore = contextRef.current.luckysheet_filter_save;
              setContext((draftCtx) => {
                const had = _.size(draftCtx.luckysheet_filter_save) > 0;
                createFilter(draftCtx);
                const has = _.size(draftCtx.luckysheet_filter_save) > 0;
                // Only when the toggle flipped: createFilter declines on a
                // multi-range selection and on a pivot table.
                if (had !== has) {
                  announce(
                    draftCtx,
                    has
                      ? "rightclick.announceFilterCreated"
                      : "rightclick.announceFilterRemoved"
                  );
                }
                draftCtx.contextMenu = {};
              });
              // Same target as the toolbar's create-filter: the cell the filter
              // was built around. Closing this menu would otherwise restore
              // focus to whatever held it when the menu opened, which is the
              // cell input only when the menu was opened from the grid. Skipped
              // when createFilter declined to act, so a command that changed
              // nothing does not move focus either.
              focusAfterCommit(() =>
                filterUnchanged(contextRef.current, filterBefore)
                  ? null
                  : refs.cellInput.current
              );
            }}
          >
            {filterApplied ? rightclick.removeFilter : rightclick.createFilter}
          </Menu>
        );
      }
      if (name === "image") {
        return (
          <Menu
            key={name}
            role="button"
            onClick={() => {
              focusGridBeforeHandoff();
              setContext((draftCtx) => {
                showImgChooser();
                draftCtx.contextMenu = {};
              });
            }}
          >
            {rightclick.image}
          </Menu>
        );
      }
      if (name === "link") {
        return (
          <Menu
            key={name}
            role="button"
            onClick={() => {
              focusGridBeforeHandoff();
              setContext((draftCtx) => {
                handleLink(draftCtx);
                draftCtx.contextMenu = {};
              });
            }}
          >
            {rightclick.link}
          </Menu>
        );
      }
      return null;
    },
    [
      context.currentSheetId,
      context.lang,
      context.luckysheet_select_save,
      // The filter row's label is derived from this, so it has to re-render when
      // the filter is created or removed.
      context.luckysheet_filter_save,
      context.defaultrowlen,
      context.defaultcollen,
      rightclick,
      info,
      setContext,
      showAlert,
      showDialog,
      drag,
      generalDialog,
      refs.cellInput,
      commitAndSettle,
      focusGridBeforeHandoff,
    ]
  );

  useLayoutEffect(() => {
    // re-position the context menu if it overflows the window
    if (!containerRef.current) {
      return;
    }
    const winH = window.innerHeight;
    const winW = window.innerWidth;
    const rect = containerRef.current.getBoundingClientRect();
    const workbookRect =
      refs.workbookContainer.current?.getBoundingClientRect();
    if (!workbookRect) {
      return;
    }
    const menuW = rect.width;
    const menuH = rect.height;
    let top = contextMenu.y || 0;
    let left = contextMenu.x || 0;

    let hasOverflow = false;
    if (workbookRect.left + left + menuW > winW) {
      left -= menuW;
      hasOverflow = true;
    }
    if (workbookRect.top + top + menuH > winH) {
      top -= menuH;
      hasOverflow = true;
    }
    if (top < 0) {
      top = 0;
      hasOverflow = true;
    }
    if (hasOverflow) {
      setContext((draftCtx) => {
        draftCtx.contextMenu.x = left;
        draftCtx.contextMenu.y = top;
      });
    }
  }, [contextMenu.x, contextMenu.y, refs.workbookContainer, setContext]);

  if (_.isEmpty(context.contextMenu)) return null;

  return (
    <div
      className="fortune-context-menu luckysheet-cols-menu"
      ref={containerRef}
      onContextMenu={(e) => e.stopPropagation()}
      style={{ left: contextMenu.x, top: contextMenu.y }}
    >
      {context.contextMenu.headerMenu === true
        ? settings.headerContextMenu.map((menu, i) => getMenuElement(menu, i))
        : settings.cellContextMenu.map((menu, i) => getMenuElement(menu, i))}
    </div>
  );
};

export default ContextMenu;
