import React, {
  useContext,
  useCallback,
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useId,
} from "react";
import "./index.css";
import {
  getRangetxt,
  locale,
  drawArrow,
  handleCellAreaDoubleClick,
  handleCellAreaMouseDown,
  handleContextMenu,
  handleOverlayMouseMove,
  handleOverlayMouseUp,
  selectAll,
  handleOverlayTouchEnd,
  handleOverlayTouchMove,
  handleOverlayTouchStart,
  createDropCellRange,
  getCellRowColumn,
  getCellHyperlink,
  showLinkCard,
  Context,
  GlobalCache,
  onCellsMoveStart,
  insertRowCol,
  getSheetIndex,
  fixRowStyleOverflowInFreeze,
  fixColumnStyleOverflowInFreeze,
  handleKeydownForZoom,
  formatRefForSr,
  api,
  GRID_ROOT_CLASS,
} from "@fortune-sheet/core";
import _ from "lodash";
import WorkbookContext, { SetContextOptions } from "../../context";
import ColumnHeader from "./ColumnHeader";
import RowHeader from "./RowHeader";
import InputBox from "./InputBox";
import ScrollBar from "./ScrollBar";
import SearchReplace from "../SearchReplace";
import LinkEditCard from "../LinkEidtCard";
import FilterOptions from "../FilterOption";
import { useAlert } from "../../hooks/useAlert";
import ImgBoxs from "../ImgBoxs";
import NotationBoxes from "../NotationBoxes";
import RangeDialog from "../DataVerification/RangeDialog";
import { useDialog } from "../../hooks/useDialog";
import { useFilterAnnouncements } from "../../hooks/useFilterAnnouncements";
import { useSelectionModeAnnouncement } from "../../hooks/useSelectionModeAnnouncement";
import { useSelectAllAnnouncement } from "../../hooks/useSelectAllAnnouncement";
import { useNameBoxClampAnnouncement } from "../../hooks/useNameBoxClampAnnouncement";
import { useContextMenuAnnouncements } from "../../hooks/useContextMenuAnnouncements";
import SVGIcon from "../SVGIcon";
import DropDownList from "../DataVerification/DropdownList";
import { activateOnEnterOrSpace } from "../../utils/keyboardActivation";

const SheetOverlay: React.FC = () => {
  const { context, setContext, settings, refs } = useContext(WorkbookContext);
  const { info, rightclick } = locale(context);
  const { showDialog } = useDialog();
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomAddRowInputRef = useRef<HTMLInputElement>(null);
  const dataVerificationHintBoxRef = useRef<HTMLDivElement>(null);
  const { showAlert } = useAlert();
  // const isMobile = browser.mobilecheck();
  const cellAreaMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
      const { nativeEvent } = e;
      if (e.button !== 2) {
        // onContextMenu event will not call onMouseDown
        setContext((draftCtx) => {
          handleCellAreaMouseDown(
            draftCtx,
            refs.globalCache,
            nativeEvent,
            refs.cellInput.current!,
            refs.cellArea.current!,
            refs.fxInput.current!,
            refs.canvas.current!.getContext("2d")!
          );

          if (
            !_.isEmpty(draftCtx.luckysheet_select_save?.[0]) &&
            refs.cellInput.current
          ) {
            setTimeout(() => {
              refs.cellInput.current?.focus();
            });
          }
        });
      }
    },
    [
      setContext,
      refs.globalCache,
      refs.cellInput,
      refs.cellArea,
      refs.fxInput,
      refs.canvas,
    ]
  );

  const cellAreaContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
      const { nativeEvent } = e;
      setContext((draftCtx) => {
        handleContextMenu(
          draftCtx,
          settings,
          nativeEvent,
          refs.workbookContainer.current!,
          refs.cellArea.current!,
          "cell"
        );
      });
    },
    [refs.workbookContainer, setContext, settings, refs.cellArea]
  );

  /**
   * The cell area is `overflow: hidden` with a fixed size, which still makes it
   * a scroll container: gestures are blocked, but the browser scrolls it
   * natively anyway. Because the only sync was context -> DOM, `scrollTop` in
   * context never learned about that scroll: the canvas kept painting rows for
   * the old offset while every DOM overlay shifted with the container, so the
   * add-row strip, the selection outline and the cell input all landed over the
   * wrong cells.
   *
   * What is established about the regression: #19 adopted every such native
   * scroll into context by calling `setContext` from this handler, and that is
   * what broke committing a formula. The only functional change in the tarball
   * diff between the last green release and the red one is this `onScroll`, and
   * the e2e (`practicing-imputation-methods` 4.C/4.D) is red on the release that
   * added it and green with it gone. The extra `setContext` producer lands in
   * the middle of a cell commit and the pending edit is dropped: type a formula
   * in F2, press Enter, and F2 is silently left empty.
   *
   * What is not fully pinned down is why the browser scrolls the area mid-commit
   * in the first place. It is not a focus reveal — no `focus()` fires during
   * that commit — most likely the caret/selection being repositioned inside the
   * still-focused contenteditable. The precise trigger does not change the fix:
   * refuse the scroll entirely. Snap the element back to context's offset and
   * change no state.
   *
   * Refusing every element-originated scroll is safe because the scroll a user
   * asks for never arrives here — wheel, scrollbar and keyboard navigation all
   * write context, and the effect below writes context back onto the element,
   * where the snap-back compares equal and stops. The one thing that did depend
   * on the native scroll, revealing a focused control below the last row, is
   * redone by `cellAreaFocus` off the focus event, which never fires mid-commit.
   */
  const cellAreaScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      if (el.scrollTop !== context.scrollTop) {
        el.scrollTop = context.scrollTop;
      }
      if (el.scrollLeft !== context.scrollLeft) {
        el.scrollLeft = context.scrollLeft;
      }
    },
    [context.scrollTop, context.scrollLeft]
  );

  /**
   * Keyboard focus can land on a control the browser has to scroll to reveal:
   * the add-row strip and its "back to the top" button sit below the last row,
   * inside `.fortune-cell-area`. `cellAreaScroll` refuses the browser's native
   * reveal scroll along with everything else — it cannot tell a focus reveal
   * apart from the mid-commit scroll above — so a control tabbed to below the
   * fold would be left focused but off-screen (WCAG 2.4.7).
   *
   * Redo that reveal as a context scroll. This is a focus event, not a scroll
   * event: focus does not move during a cell commit, so unlike #19's handler
   * this `setContext` cannot land mid-commit and drop an edit. It moves only
   * when the focused descendant is actually outside the visible box, and only by
   * the minimum needed to bring it in — matching what the browser would have
   * done natively, but recorded in context so the canvas repaints to match.
   *
   * The cell input is explicitly exempt. It lives in this container but is the
   * grid's own editing chrome: the grid positions it at the active cell, and
   * parks it at `left/top: -10000` (`InputBox`) whenever there is no selection.
   * It also takes keyboard focus on every cell click. Revealing it would be
   * both wrong (the grid already places it) and harmful — a focus landing while
   * it is parked reads as far above the fold and would yank the scroll to the
   * top-left. Only the static chrome below the last row needs revealing.
   */
  const cellAreaFocus = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      const container = e.currentTarget;
      const target = e.target as HTMLElement;
      if (target === container) return;
      if (target.closest(".luckysheet-input-box")) return;

      const cRect = container.getBoundingClientRect();
      const tRect = target.getBoundingClientRect();

      // Content coordinates, invariant to any native scroll the browser may have
      // already applied: both rects reflect the same current scroll offset, so
      // adding it back cancels it out.
      const topInContent = tRect.top - cRect.top + container.scrollTop;
      const bottomInContent = topInContent + tRect.height;
      const leftInContent = tRect.left - cRect.left + container.scrollLeft;
      const rightInContent = leftInContent + tRect.width;

      let nextTop = context.scrollTop;
      let nextLeft = context.scrollLeft;
      if (topInContent < nextTop) {
        nextTop = topInContent;
      } else if (bottomInContent > nextTop + container.clientHeight) {
        nextTop = bottomInContent - container.clientHeight;
      }
      if (leftInContent < nextLeft) {
        nextLeft = leftInContent;
      } else if (rightInContent > nextLeft + container.clientWidth) {
        nextLeft = rightInContent - container.clientWidth;
      }
      nextTop = Math.max(0, nextTop);
      nextLeft = Math.max(0, nextLeft);

      if (nextTop === context.scrollTop && nextLeft === context.scrollLeft) {
        return;
      }
      setContext((draftCtx) => {
        draftCtx.scrollTop = nextTop;
        draftCtx.scrollLeft = nextLeft;
      });
    },
    [context.scrollTop, context.scrollLeft, setContext]
  );

  const cellAreaDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
      const { nativeEvent } = e;
      setContext((draftCtx) => {
        handleCellAreaDoubleClick(
          draftCtx,
          refs.globalCache,
          settings,
          nativeEvent,
          refs.cellArea.current!
        );
      });
    },
    [refs.cellArea, refs.globalCache, setContext, settings]
  );

  const onLeftTopClick = useCallback(() => {
    setContext((draftCtx) => {
      selectAll(draftCtx);
    });
  }, [setContext]);

  const debouncedShowLinkCard = useMemo(
    () =>
      _.debounce(
        (
          globalCache: GlobalCache,
          r: number,
          c: number,
          isEditing: boolean,
          skip = false
        ) => {
          if (skip || globalCache.linkCard?.mouseEnter) return;
          setContext((draftCtx) => {
            showLinkCard(draftCtx, r, c, isEditing);
          });
        },
        800
      ),
    [setContext]
  );

  const overShowLinkCard = useCallback(
    (
      ctx: Context,
      globalCache: GlobalCache,
      e: MouseEvent,
      container: HTMLDivElement,
      scrollX: HTMLDivElement,
      scrollY: HTMLDivElement
    ) => {
      const rc = getCellRowColumn(ctx, e, container, scrollX, scrollY);
      if (rc == null) return;
      const link = getCellHyperlink(ctx, rc.r, rc.c);
      if (link == null) {
        debouncedShowLinkCard(globalCache, rc.r, rc.c, false);
      } else {
        showLinkCard(ctx, rc.r, rc.c, false);
        debouncedShowLinkCard(globalCache, rc.r, rc.c, false, true);
      }
    },
    [debouncedShowLinkCard]
  );

  const onMouseMove = useCallback(
    (nativeEvent: MouseEvent) => {
      setContext((draftCtx) => {
        overShowLinkCard(
          draftCtx,
          refs.globalCache,
          nativeEvent,
          containerRef.current!,
          refs.scrollbarX.current!,
          refs.scrollbarY.current!
        );
        handleOverlayMouseMove(
          draftCtx,
          refs.globalCache,
          nativeEvent,
          refs.cellInput.current!,
          refs.scrollbarX.current!,
          refs.scrollbarY.current!,
          containerRef.current!,
          refs.fxInput.current
        );
      });
    },
    [
      overShowLinkCard,
      refs.cellInput,
      refs.fxInput,
      refs.globalCache,
      refs.scrollbarX,
      refs.scrollbarY,
      setContext,
    ]
  );

  const onMouseUp = useCallback(
    (nativeEvent: MouseEvent) => {
      setContext((draftCtx) => {
        try {
          handleOverlayMouseUp(
            draftCtx,
            refs.globalCache,
            settings,
            nativeEvent,
            refs.scrollbarX.current!,
            refs.scrollbarY.current!,
            containerRef.current!,
            refs.cellInput.current,
            refs.fxInput.current
          );
        } catch (e: any) {
          showAlert(e.message);
        }
      });
    },
    [
      refs.cellInput,
      refs.fxInput,
      refs.globalCache,
      refs.scrollbarX,
      refs.scrollbarY,
      setContext,
      settings,
      showAlert,
    ]
  );

  const onKeyDownForZoom = useCallback(
    (ev: KeyboardEvent) => {
      const newZoom = handleKeydownForZoom(ev, context.zoomRatio);
      if (newZoom !== context.zoomRatio) {
        setContext((ctx) => {
          ctx.zoomRatio = newZoom;
          ctx.luckysheetfile[
            getSheetIndex(ctx, ctx.currentSheetId)!
          ].zoomRatio = newZoom;
        });
      }
    },
    [context.zoomRatio, setContext]
  );

  const onTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      const { nativeEvent } = e;
      setContext((draftContext) => {
        handleOverlayTouchStart(draftContext, nativeEvent, refs.globalCache);
      });
      e.stopPropagation();
    },
    [refs.globalCache, setContext]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      const { nativeEvent } = e;
      setContext((draftCtx) => {
        handleOverlayTouchMove(
          draftCtx,
          nativeEvent,
          refs.globalCache,
          refs.scrollbarX.current!,
          refs.scrollbarY.current!
        );
      });
      // e.stopPropagation();
    },
    [refs.globalCache, refs.scrollbarX, refs.scrollbarY, setContext]
  );

  const onTouchEnd = useCallback(() => {
    handleOverlayTouchEnd(refs.globalCache);
  }, [refs.globalCache]);

  const handleBottomAddRow = useCallback(() => {
    const valueStr =
      bottomAddRowInputRef.current?.value || context.addDefaultRows.toString();
    const value = parseInt(valueStr, 10);
    if (Number.isNaN(value)) {
      return;
    }
    if (value < 1) {
      return;
    }
    const insertRowColOp: SetContextOptions["insertRowColOp"] = {
      type: "row",
      index:
        context.luckysheetfile[
          getSheetIndex(context, context!.currentSheetId! as string) as number
        ].data!.length - 1,
      count: value,
      direction: "rightbottom",
      id: context.currentSheetId,
    };
    setContext(
      (draftCtx) => {
        try {
          insertRowCol(draftCtx, insertRowColOp, false);
        } catch (err: any) {
          if (err.message === "maxExceeded") showAlert(rightclick.rowOverLimit);
        }
      },
      { insertRowColOp }
    );
  }, [context, rightclick.rowOverLimit, setContext, showAlert]);

  useEffect(() => {
    setContext((draftCtx) => {
      const sheetIndex = getSheetIndex(draftCtx, draftCtx.currentSheetId);
      if (sheetIndex === undefined || sheetIndex === null) return;

      const currentSheet = draftCtx.luckysheetfile[sheetIndex];

      // Only reset selection if there's no existing selection
      if (!currentSheet.luckysheet_select_save?.length) {
        api.setSelection(draftCtx, [{ row: [0], column: [0] }], {});
      }
    });
  }, [context.currentSheetId, setContext]);

  // 提醒弹窗
  useEffect(() => {
    if (context.warnDialog) {
      setTimeout(() => {
        showDialog(context.warnDialog, "ok");
      }, 240);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.warnDialog]);

  useEffect(() => {
    refs.cellArea.current!.scrollLeft = context.scrollLeft;
    refs.cellArea.current!.scrollTop = context.scrollTop;
  }, [
    context.scrollLeft,
    context.scrollTop,
    refs.cellArea,
    refs.cellArea.current?.scrollLeft,
    refs.cellArea.current?.scrollTop,
  ]);

  // useEffect(() => {
  //   // ensure cell input is always focused to accept first key stroke on cell
  //   if (!context.editingCommentBox) {
  //     refs.cellInput.current?.focus({ preventScroll: true });
  //   }
  // }, [
  //   context.editingCommentBox,
  //   context.luckysheet_select_save,
  //   refs.cellInput,
  // ]);

  useLayoutEffect(() => {
    if (
      context.commentBoxes ||
      context.hoveredCommentBox ||
      context.editingCommentBox
    ) {
      _.concat(
        context.commentBoxes?.filter(
          (v) => v.rc !== context.editingCommentBox?.rc
        ),
        [context.hoveredCommentBox, context.editingCommentBox]
      ).forEach((box) => {
        if (box) {
          drawArrow(box.rc, box.size);
        }
      });
    }
  }, [
    context.commentBoxes,
    context.hoveredCommentBox,
    context.editingCommentBox,
  ]);

  useEffect(() => {
    document.addEventListener("mousemove", onMouseMove);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
    };
  }, [onMouseMove]);

  useEffect(() => {
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseUp]);

  useEffect(() => {
    document.addEventListener("keydown", onKeyDownForZoom);
    return () => {
      document.removeEventListener("keydown", onKeyDownForZoom);
    };
  }, [onKeyDownForZoom]);

  const rangeText = useMemo(() => {
    const lastSelection = _.last(context.luckysheet_select_save);
    if (
      !(
        lastSelection &&
        lastSelection.row_focus != null &&
        lastSelection.column_focus != null
      )
    )
      return "";
    const rf = lastSelection.row_focus;
    const cf = lastSelection.column_focus;
    if (context.config.merge != null && `${rf}_${cf}` in context.config.merge) {
      return getRangetxt(context, context.currentSheetId, {
        column: [cf, cf],
        row: [rf, rf],
      });
    }

    const rawRangeTxt = getRangetxt(
      context,
      context.currentSheetId,
      lastSelection
    );
    // Spaced for screen reading: "AA12" -> "AA. 12", "A1:BB100" -> "A. 1: BB. 100".
    return formatRefForSr(rawRangeTxt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.currentSheetId, context.luckysheet_select_save]);

  const selectionModeAnnouncement = useSelectionModeAnnouncement(context);
  const selectAllAnnouncement = useSelectAllAnnouncement(context);
  const clampAnnouncement = useNameBoxClampAnnouncement(context, info);
  // The id comes back from the hook rather than being a module constant: this
  // fork is embedded once per sim section, and a fixed id made every instance's
  // `aria-describedby` resolve to the first instance's (empty) region. See
  // CONTEXT_MENU_REGION_ID_SUFFIX.
  const {
    regionId: contextMenuRegionId,
    announcement: contextMenuAnnouncement,
  } = useContextMenuAnnouncements(context, refs.cellInput);
  const cellAreaId = useId();
  const { cellAnnouncement: filterCellAnnouncement, regionAnnouncement } =
    useFilterAnnouncements(context, info);

  const cellValue = () => {
    if ((context.luckysheet_select_save?.length ?? 0) > 0) {
      const selection =
        context.luckysheet_select_save?.[
          context.luckysheet_select_save.length - 1
        ];
      if (!selection) return "";
      const sheetIndex = getSheetIndex(context, context.currentSheetId);
      if (sheetIndex === undefined || sheetIndex === null) return "";
      const rowFocus = selection.row_focus ?? 0;
      const columnFocus = selection.column_focus ?? 0;
      const cellVal =
        context.luckysheetfile[sheetIndex]?.data?.[rowFocus]?.[columnFocus]
          ?.m || "";
      return cellVal;
    }
    return "";
  };

  const computedCellValue = cellValue();

  return (
    <main
      className={GRID_ROOT_CLASS}
      // Without a name, landmark navigation announces only "main", which does
      // not say the region is the sheet and does not distinguish it from an
      // embedding page's own main landmark (WCAG 1.3.1, 2.4.1).
      aria-label={info.spreadsheetLandmark}
      ref={containerRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      tabIndex={-1}
      style={{
        width: context.luckysheetTableContentHW[0],
        height: context.luckysheetTableContentHW[1],
      }}
    >
      <div className="fortune-col-header-wrap">
        <div
          className="fortune-left-top"
          onClick={onLeftTopClick}
          // A focusable control has to be operable by keyboard (WCAG 2.1.1).
          // Via the shared helper rather than a hand-rolled handler: it
          // forwards to onClick above instead of duplicating onLeftTopClick,
          // and carries the target/currentTarget guard the inline copies
          // lacked. The legacy "Spacebar" key name master handled here is now
          // covered in isActivationKey, so every call site gets it.
          onKeyDown={activateOnEnterOrSpace}
          tabIndex={0}
          role="button"
          aria-label={info.selectAllCells}
          style={{
            width: context.rowHeaderWidth - 1.5,
            height: context.columnHeaderHeight - 1.5,
          }}
        />
        <ColumnHeader />
      </div>
      {(context.showSearch || context.showReplace) && (
        <SearchReplace getContainer={() => containerRef.current!} />
      )}
      <div className="fortune-row-body">
        <RowHeader />
        <ScrollBar axis="x" controls={cellAreaId} />
        <ScrollBar axis="y" controls={cellAreaId} />
        <div
          ref={refs.cellArea}
          // The scrollbars' `aria-controls` target. Generated rather than
          // literal because a page can hold more than one workbook.
          id={cellAreaId}
          className="fortune-cell-area"
          onMouseDown={cellAreaMouseDown}
          onDoubleClick={cellAreaDoubleClick}
          onContextMenu={cellAreaContextMenu}
          onScroll={cellAreaScroll}
          onFocusCapture={cellAreaFocus}
          style={{
            width: context.cellmainWidth,
            height: context.cellmainHeight,
            cursor: context.luckysheet_cell_selected_extend
              ? "crosshair"
              : "default",
          }}
        >
          <div id="fortune-formula-functionrange" />
          {context.formulaRangeSelect && (
            <div
              className="fortune-selection-copy fortune-formula-functionrange-select"
              style={context.formulaRangeSelect}
            >
              <div className="fortune-selection-copy-top fortune-copy" />
              <div className="fortune-selection-copy-right fortune-copy" />
              <div className="fortune-selection-copy-bottom fortune-copy" />
              <div className="fortune-selection-copy-left fortune-copy" />
              <div className="fortune-selection-copy-hc" />
            </div>
          )}
          {context.formulaRangeHighlight.map((v) => {
            const { rangeIndex, backgroundColor } = v;
            return (
              <div
                key={rangeIndex}
                id="fortune-formula-functionrange-highlight"
                className="fortune-selection-highlight fortune-formula-functionrange-highlight"
                style={_.omit(v, "backgroundColor")}
              >
                {["top", "right", "bottom", "left"].map((d) => (
                  <div
                    key={d}
                    data-type={d}
                    className={`fortune-selection-copy-${d} fortune-copy`}
                    style={{ backgroundColor }}
                  />
                ))}
                <div
                  className="fortune-selection-copy-hc"
                  style={{ backgroundColor }}
                />
                {["lt", "rt", "lb", "rb"].map((d) => (
                  <div
                    key={d}
                    data-type={d}
                    className={`fortune-selection-highlight-${d} luckysheet-highlight`}
                    style={{ backgroundColor }}
                  />
                ))}
              </div>
            );
          })}
          <div
            className="luckysheet-row-count-show luckysheet-count-show"
            id="luckysheet-row-count-show"
          />
          <div
            className="luckysheet-column-count-show luckysheet-count-show"
            id="luckysheet-column-count-show"
          />
          <div
            className="fortune-change-size-line"
            hidden={
              !context.luckysheet_cols_change_size &&
              !context.luckysheet_rows_change_size &&
              !context.luckysheet_cols_freeze_drag &&
              !context.luckysheet_rows_freeze_drag
            }
          />
          <div
            className="fortune-freeze-drag-line"
            hidden={
              !context.luckysheet_cols_freeze_drag &&
              !context.luckysheet_rows_freeze_drag
            }
          />
          <div
            className="luckysheet-cell-selected-focus"
            style={
              (context.luckysheet_select_save?.length ?? 0) > 0
                ? (() => {
                    const selection = _.last(context.luckysheet_select_save)!;
                    return _.assign(
                      {
                        left: selection.left,
                        top: selection.top,
                        width: selection?.width || 0,
                        height: selection?.height || 0,
                        display: "block",
                      },
                      fixRowStyleOverflowInFreeze(
                        context,
                        selection.row_focus || 0,
                        selection.row_focus || 0,
                        refs.globalCache.freezen?.[context.currentSheetId]
                      ),
                      fixColumnStyleOverflowInFreeze(
                        context,
                        selection.column_focus || 0,
                        selection.column_focus || 0,
                        refs.globalCache.freezen?.[context.currentSheetId]
                      )
                    );
                  })()
                : {}
            }
            onMouseDown={(e) => e.preventDefault()}
          />
          {(context.luckysheet_selection_range?.length ?? 0) > 0 && (
            <div id="fortune-selection-copy">
              {context.luckysheet_selection_range!.map((range) => {
                const r1 = range.row[0];
                const r2 = range.row[1];
                const c1 = range.column[0];
                const c2 = range.column[1];

                const row = context.visibledatarow[r2];
                const row_pre =
                  r1 - 1 === -1 ? 0 : context.visibledatarow[r1 - 1];
                const col = context.visibledatacolumn[c2];
                const col_pre =
                  c1 - 1 === -1 ? 0 : context.visibledatacolumn[c1 - 1];

                return (
                  <div
                    className="fortune-selection-copy"
                    key={`${r1}-${r2}-${c1}-${c2}`}
                    style={{
                      left: col_pre,
                      width: col - col_pre - 1,
                      top: row_pre,
                      height: row - row_pre - 1,
                    }}
                  >
                    <div className="fortune-selection-copy-top fortune-copy" />
                    <div className="fortune-selection-copy-right fortune-copy" />
                    <div className="fortune-selection-copy-bottom fortune-copy" />
                    <div className="fortune-selection-copy-left fortune-copy" />
                    <div className="fortune-selection-copy-hc" />
                  </div>
                );
              })}
            </div>
          )}
          <div id="luckysheet-chart-rangeShow" />
          <div className="fortune-cell-selected-extend" />
          <div
            className="fortune-cell-selected-move"
            id="fortune-cell-selected-move"
            onMouseDown={(e) => e.preventDefault()}
          />
          {(context.luckysheet_select_save?.length ?? 0) > 0 && (
            <div id="luckysheet-cell-selected-boxs">
              {context.luckysheet_select_save!.map((selection, index) => (
                <div
                  key={index}
                  id="luckysheet-cell-selected"
                  className="luckysheet-cell-selected"
                  style={_.assign(
                    {
                      left: selection.left_move,
                      top: selection.top_move,
                      width: selection?.width_move || 0,
                      height: selection?.height_move || 0,
                      display: "block",
                    },
                    fixRowStyleOverflowInFreeze(
                      context,
                      selection.row[0],
                      selection.row[1],
                      refs.globalCache.freezen?.[context.currentSheetId]
                    ),
                    fixColumnStyleOverflowInFreeze(
                      context,
                      selection.column[0],
                      selection.column[1],
                      refs.globalCache.freezen?.[context.currentSheetId]
                    )
                  )}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    const { nativeEvent } = e;
                    setContext((draftCtx) => {
                      onCellsMoveStart(
                        draftCtx,
                        refs.globalCache,
                        nativeEvent,
                        refs.scrollbarX.current!,
                        refs.scrollbarY.current!,
                        containerRef.current!
                      );
                    });
                  }}
                >
                  <div className="luckysheet-cs-inner-border" />
                  <div
                    className="luckysheet-cs-fillhandle"
                    onMouseDown={(e) => {
                      const { nativeEvent } = e;
                      setContext((draftContext) => {
                        createDropCellRange(
                          draftContext,
                          nativeEvent,
                          containerRef.current!
                        );
                      });
                      e.stopPropagation();
                    }}
                  />
                  <div className="luckysheet-cs-inner-border" />
                  <div
                    className="luckysheet-cs-draghandle-top luckysheet-cs-draghandle"
                    onMouseDown={(e) => e.preventDefault()}
                  />
                  <div
                    className="luckysheet-cs-draghandle-bottom luckysheet-cs-draghandle"
                    onMouseDown={(e) => e.preventDefault()}
                  />
                  <div
                    className="luckysheet-cs-draghandle-left luckysheet-cs-draghandle"
                    onMouseDown={(e) => e.preventDefault()}
                  />
                  <div
                    className="luckysheet-cs-draghandle-right luckysheet-cs-draghandle"
                    onMouseDown={(e) => e.preventDefault()}
                  />
                  <div className="luckysheet-cs-touchhandle luckysheet-cs-touchhandle-lt">
                    <div className="luckysheet-cs-touchhandle-btn" />
                  </div>
                  <div className="luckysheet-cs-touchhandle luckysheet-cs-touchhandle-rb">
                    <div className="luckysheet-cs-touchhandle-btn" />
                  </div>
                </div>
              ))}
            </div>
          )}
          {(context.presences?.length ?? 0) > 0 &&
            context.presences!.map((presence, index) => {
              if (presence.sheetId !== context.currentSheetId) {
                return null;
              }
              const {
                selection: { r, c },
                color,
              } = presence;
              const row_pre = r - 1 === -1 ? 0 : context.visibledatarow[r - 1];
              const col_pre =
                c - 1 === -1 ? 0 : context.visibledatacolumn[c - 1];
              const row = context.visibledatarow[r];
              const col = context.visibledatacolumn[c];
              const width = col - col_pre - 1;
              const height = row - row_pre - 1;
              const usernameStyle = {
                maxWidth: width + 1,
                backgroundColor: color,
              };
              _.set(usernameStyle, r === 0 ? "top" : "bottom", height);

              return (
                <div
                  key={presence?.userId || index}
                  className="fortune-presence-selection"
                  style={{
                    left: col_pre,
                    top: row_pre - 2,
                    width,
                    height,
                    borderColor: color,
                    borderWidth: 1,
                  }}
                >
                  <div
                    className="fortune-presence-username"
                    style={usernameStyle}
                  >
                    {presence.username}
                  </div>
                </div>
              );
            })}
          {context.linkCard?.sheetId === context.currentSheetId && (
            <LinkEditCard {...context.linkCard} />
          )}
          {context.rangeDialog?.show && <RangeDialog />}
          <FilterOptions />
          <InputBox />
          <NotationBoxes />
          <div id="luckysheet-multipleRange-show" />
          <div id="luckysheet-dynamicArray-hightShow" />
          <ImgBoxs />
          <div
            id="luckysheet-dataVerification-dropdown-btn"
            onClick={() => {
              setContext((ctx) => {
                ctx.dataVerificationDropDownList = true;
                dataVerificationHintBoxRef.current!.style.display = "none";
              });
            }}
            tabIndex={0}
            style={{ display: "none" }}
          >
            <SVGIcon name="combo-arrow" width={16} />
          </div>
          {context.dataVerificationDropDownList && <DropDownList />}
          {/* <div
            id="luckysheet-dataVerification-dropdown-List"
            className="luckysheet-mousedown-cancel"
          /> */}
          <div
            id="luckysheet-dataVerification-showHintBox"
            className="luckysheet-mousedown-cancel"
            ref={dataVerificationHintBoxRef}
          />
          <div className="luckysheet-cell-copy" />
          <div className="luckysheet-grdblkflowpush" />
          <div
            id="luckysheet-cell-flow_0"
            className="luckysheet-cell-flow luckysheetsheetchange"
          >
            <div className="luckysheet-cell-flow-clip">
              <div className="luckysheet-grdblkpush" />
              <div
                id="luckysheetcoltable_0"
                className="luckysheet-cell-flow-col"
              >
                <div
                  id="luckysheet-sheettable_0"
                  className="luckysheet-cell-sheettable"
                  style={{
                    height: context.rh_height,
                    width: context.ch_width,
                  }}
                />
                <div
                  id="luckysheet-bottom-controll-row"
                  className="luckysheet-bottom-controll-row"
                  onMouseDown={(e) => e.stopPropagation()}
                  onMouseUp={(e) => e.stopPropagation()}
                  // onMouseMove={(e) => {
                  //   e.stopPropagation();
                  //   e.preventDefault();
                  // }}
                  onKeyDown={(e) => e.stopPropagation()}
                  onKeyUp={(e) => e.stopPropagation()}
                  onKeyPress={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  style={{
                    left: context.scrollLeft,
                    display: context.allowEdit ? "block" : "none",
                  }}
                >
                  <div
                    className="fortune-add-row-button"
                    onClick={() => {
                      handleBottomAddRow();
                    }}
                    onKeyDown={activateOnEnterOrSpace}
                    tabIndex={0}
                    role="button"
                  >
                    {info.add}
                  </div>
                  <input
                    ref={bottomAddRowInputRef}
                    type="text"
                    style={{ width: 50 }}
                    // The adjacent `info.row` is a unit suffix, not a label, and
                    // a placeholder is not an accessible name — without this the
                    // field announces only as "edit text".
                    aria-label={info.addRowsInputLabel}
                    placeholder={context.addDefaultRows.toString()}
                  />{" "}
                  <span className="fortune-add-row-unit">{info.row}</span>{" "}
                  <span className="fortune-add-row-hint">({info.addLast})</span>
                  <span
                    className="fortune-add-row-button"
                    onClick={() => {
                      setContext((ctx) => {
                        ctx.scrollTop = 0;
                      });
                    }}
                    onKeyDown={activateOnEnterOrSpace}
                    tabIndex={0}
                    role="button"
                  >
                    {info.backTop}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div id="sr-selection" className="sr-only" role="alert">
        {!rangeText.includes("NaN")
          ? `${rangeText} ${computedCellValue}${filterCellAnnouncement}${clampAnnouncement}`
          : `A1. ${info.sheetSrIntro}`}
      </div>
      {/*
        Polite, not assertive: the crossing lands a commit after `#sr-selection`
        has the cell reference and value, so an assertive region would interrupt
        the cell announcement the user navigated to hear, typically mid-word.
      */}
      <div id="sr-filterRegion" className="sr-only" role="status">
        {regionAnnouncement}
      </div>
      {/* Shift+F8 anchors a duplicate of the range in focus, so neither the
          grid nor `#sr-selection` changes — without this, entering the mode is
          silent as well as invisible. Polite, for the same reason as above. */}
      <div id="sr-selectionMode" className="sr-only" role="status">
        {selectionModeAnnouncement}
      </div>
      {/* Select-all changes the whole sheet and says nothing: `#sr-selection`
          is built from the focus cell, which stays at A1, so it repeats itself.
          Polite, for the same reason as above. */}
      <div id="sr-selectAll" className="sr-only" role="status">
        {selectAllAnnouncement}
      </div>
      {/* Context-menu actions were silent: the grid rearranges and `#sr-selection`
          reports the new cell, but nothing says what the action did — "3 columns
          inserted" is not recoverable from the after-state.

          This element is both an assertive live region and the target of the cell
          input's `aria-describedby`. Almost every one of these actions also moves
          focus to the cell input, VoiceOver announces the newly focused element,
          and that utterance discards a *polite* message queued in the same
          moment — which is why this is not polite. So the text is delivered as
          part of the focus announcement through the description, and the region
          reaches the actions that do not move focus. Assertive specifically
          because the sheet-rename announcement shares this region and
          `sr-virtual.test.tsx` asserts it survives a focus move that way. The
          full reasoning, including the double-speak question the two mechanisms
          raise together, is in useContextMenuAnnouncements. */}
      <div
        id={contextMenuRegionId}
        className="sr-only"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
      >
        {contextMenuAnnouncement}
      </div>
    </main>
  );
};

export default SheetOverlay;
