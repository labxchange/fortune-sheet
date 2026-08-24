import {
  createFilterOptions,
  fixColumnStyleOverflowInFreeze,
  fixRowStyleOverflowInFreeze,
  getSheetIndex,
  indexToColumnChar,
  locale,
} from "@fortune-sheet/core";
import _ from "lodash";
import React, { useCallback, useContext, useEffect, useRef } from "react";
import WorkbookContext from "../../context";
import SVGIcon from "../SVGIcon";
import { activateOnEnterOrSpace } from "../../utils/keyboardActivation";

const FilterOptions: React.FC<{ getContainer: () => HTMLDivElement }> = ({
  getContainer,
}) => {
  const { context, setContext, refs } = useContext(WorkbookContext);
  const {
    filterOptions,
    currentSheetId,
    filter,
    visibledatarow,
    visibledatacolumn,
  } = context;
  const sheetIndex = getSheetIndex(context, context.currentSheetId);
  const { filter_select, frozen } = context.luckysheetfile[sheetIndex!];
  const { info } = locale(context);
  // Keyed by absolute column index so the keyboard shortcut can reach the same
  // funnel a click would, without reproducing its positioning maths.
  const funnelRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    setContext((draftCtx) => {
      const sheetIdx = getSheetIndex(draftCtx, draftCtx.currentSheetId);
      if (sheetIdx == null) return;
      draftCtx.luckysheet_filter_save =
        draftCtx.luckysheetfile[sheetIdx].filter_select;
      draftCtx.filter = draftCtx.luckysheetfile[sheetIdx].filter || {};
      createFilterOptions(draftCtx, draftCtx.luckysheet_filter_save, undefined);
    });
  }, [
    visibledatarow,
    visibledatacolumn,
    setContext,
    currentSheetId,
    filter_select,
  ]);

  const showFilterContextMenu = useCallback(
    (
      v: {
        col: number;
        left: number;
        top: number;
      },
      i: number
    ) => {
      if (filterOptions == null) return;
      setContext((draftCtx) => {
        if (draftCtx.filterContextMenu?.col === filterOptions.startCol + i)
          return;
        draftCtx.filterContextMenu = {
          x:
            v.left +
            draftCtx.rowHeaderWidth -
            refs.scrollbarX.current!.scrollLeft,
          y:
            v.top +
            23 +
            draftCtx.toolbarHeight +
            draftCtx.calculatebarHeight +
            draftCtx.columnHeaderHeight -
            refs.scrollbarY.current!.scrollTop,
          col: filterOptions.startCol + i,
          startRow: filterOptions.startRow,
          endRow: filterOptions.endRow,
          startCol: filterOptions.startCol,
          endCol: filterOptions.endCol,
          hiddenRows: _.keys(draftCtx.filter[i]?.rowhidden).map((r) =>
            parseInt(r, 10)
          ),
          listBoxMaxHeight: 400,
        };
      });
    },
    [filterOptions, getContainer, refs.scrollbarX, refs.scrollbarY, setContext]
  );

  // Ctrl+Cmd+R / Ctrl+Alt+R records the column it wants in core, because
  // positioning the popup needs scroll offsets and geometry only this layer
  // has. Clicking the funnel reuses every bit of that maths, so the request is
  // fulfilled by clicking it rather than by recomputing the popup position.
  const requestedColumn = context.openFilterMenuForColumn;
  useEffect(() => {
    if (requestedColumn == null) return;
    const funnel = funnelRefs.current[requestedColumn];
    // Only columns inside the applied filter range render a funnel, and one
    // scrolled under a frozen pane is styled `display: none` — clicking that
    // still opens the menu while focusing it is refused, so guard both.
    // getComputedStyle is the hidden-check jsdom reports faithfully, which
    // keeps a regression test honest.
    if (funnel && window.getComputedStyle(funnel).display !== "none") {
      funnel.click();
      funnel.focus();
    }
    setContext((draftCtx) => {
      draftCtx.openFilterMenuForColumn = null;
    });
  }, [requestedColumn, setContext]);

  const freezeType = frozen?.type;
  let frozenColumns = -1;
  let frozenRows = -1;

  if (freezeType === "row") frozenRows = 0;
  else if (freezeType === "column") frozenColumns = 0;
  else if (freezeType === "both") {
    frozenColumns = 0;
    frozenRows = 0;
  } else {
    frozenColumns = frozen?.range?.column_focus || -1;
    frozenRows = frozen?.range?.row_focus || -1;
  }

  return filterOptions == null ? (
    <div />
  ) : (
    <>
      <div
        id="luckysheet-filter-selected-sheet"
        className="luckysheet-cell-selected luckysheet-filter-selected"
        style={_.assign(
          {
            left: filterOptions.left,
            width: filterOptions.width,
            top: filterOptions.top,
            height: filterOptions.height,
            display: "block",
          },
          fixRowStyleOverflowInFreeze(
            context,
            filterOptions.startRow,
            filterOptions.endRow,
            refs.globalCache.freezen?.[context.currentSheetId]
          ),
          fixColumnStyleOverflowInFreeze(
            context,
            filterOptions.startCol,
            filterOptions.endCol,
            refs.globalCache.freezen?.[context.currentSheetId]
          )
        )}
      />
      {filterOptions.items.map((v, i) => {
        const filterParam = filter[i];
        const columnOverflowFreezeStyle = fixColumnStyleOverflowInFreeze(
          context,
          i + filterOptions.startCol,
          i + filterOptions.startCol,
          refs.globalCache.freezen?.[context.currentSheetId]
        );

        const rowOverflowFreezeStyle = fixRowStyleOverflowInFreeze(
          context,
          filterOptions.startRow,
          filterOptions.startRow,
          refs.globalCache.freezen?.[context.currentSheetId]
        );

        const col = visibledatacolumn[v.col];
        const col_pre = v.col > 0 ? visibledatacolumn[v.col - 1] : 0;

        const left =
          v.col <= frozenColumns && columnOverflowFreezeStyle.left
            ? columnOverflowFreezeStyle.left + col - col_pre - 20
            : v.left;

        const top =
          filterOptions.startRow <= frozenRows && rowOverflowFreezeStyle.top
            ? rowOverflowFreezeStyle.top
            : v.top;

        const v_adjusted = { ...v, left, top };

        const columnIndex = filterOptions.startCol + i;
        const isOpen = context.filterContextMenu?.col === columnIndex;

        return (
          <div
            ref={(el) => {
              funnelRefs.current[columnIndex] = el;
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              showFilterContextMenu(v_adjusted, i);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            // A div with only onClick never fires on Enter, so the funnel was
            // focusable but not operable. Enter/Space now forward to the click.
            onKeyDown={activateOnEnterOrSpace}
            role="button"
            aria-haspopup="menu"
            aria-expanded={isOpen}
            aria-label={`${info.filterColumn.replace(
              "${column}",
              indexToColumnChar(columnIndex)
            )}${filterParam == null ? "" : ` ${info.cellFilterActive}`}`}
            tabIndex={0}
            key={i}
            style={_.assign(rowOverflowFreezeStyle, columnOverflowFreezeStyle, {
              left,
              top,
              height: undefined,
              width: undefined,
            })}
            className={`luckysheet-filter-options ${
              filterParam == null ? "" : "luckysheet-filter-options-active"
            }`}
          >
            {filterParam == null ? (
              <div className="caret down" />
            ) : (
              <SVGIcon
                name="filter-fill-white"
                style={{ width: 15, height: 15 }}
              />
            )}
          </div>
        );
      })}
    </>
  );
};

export default FilterOptions;
