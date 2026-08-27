import {
  createFilterOptions,
  fixColumnStyleOverflowInFreeze,
  fixRowStyleOverflowInFreeze,
  getCellValue,
  getFlowdata,
  getSheetIndex,
  getInlineStringNoStyle,
  indexToColumnChar,
  isInlineStringCell,
  locale,
  replaceHtml,
} from "@fortune-sheet/core";
import _ from "lodash";
import React, { useCallback, useContext, useEffect } from "react";
import WorkbookContext from "../../context";
import { activateOnEnterOrSpace } from "../../utils/keyboardActivation";
import {
  FILTER_FUNNEL_COL_ATTR,
  FILTER_MENU_ID,
  findFilterFunnel,
} from "../../utils/filterDom";
import SVGIcon from "../SVGIcon";

const FilterOptions: React.FC = () => {
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

  /**
   * Accessible name for one column's funnel (WCAG 4.1.2). A row of funnels named
   * only by column letter is far less use by ear than one named by the header
   * the user reads, so the header cell's own text is preferred and the letter is
   * the fallback for a blank header. Either way it carries the criterion state,
   * which is the other thing the icon alone conveys.
   *
   * A plain function rather than a useCallback: the name is derived from the
   * sheet's own data, so any dependency list honest enough to include it would
   * change on every render that could alter the name anyway.
   */
  const flowdata = getFlowdata(context);
  const funnelLabel = (col: number, active: boolean) => {
    let header: unknown = null;
    if (filterOptions != null && flowdata != null) {
      const { startRow } = filterOptions;
      // A header with mixed inline formatting keeps its text in `ct.s` rather
      // than in `m`, so `getCellValue(…, "m")` returns null for it and the name
      // would fall back to the column letter on a header that is plainly not
      // blank. Checked first, the order FxEditor and InputBox already read a
      // cell in.
      header = isInlineStringCell(flowdata[startRow]?.[col])
        ? getInlineStringNoStyle(startRow, col, flowdata)
        : getCellValue(startRow, col, flowdata, "m");
    }
    const headerText = _.isNil(header) ? "" : String(header).trim();
    const name = headerText
      ? replaceHtml(info.filterDropdown, { column: headerText })
      : replaceHtml(info.filterColumn, { column: indexToColumnChar(col) });
    return active ? `${name} ${info.cellFilterActive}` : name;
  };

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

  const toggleFilterContextMenu = useCallback(
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
        // A second press on the same funnel closes the popup it opened, rather
        // than being swallowed as it used to be. That is what lets this button
        // carry aria-expanded honestly: a trigger that reports "expanded" has
        // to be able to collapse, or it promises a state change it never
        // performs (3af3000).
        if (draftCtx.filterContextMenu?.col === filterOptions.startCol + i) {
          draftCtx.filterContextMenu = undefined;
          return;
        }
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
    [filterOptions, refs.scrollbarX, refs.scrollbarY, setContext]
  );

  // Ctrl+Cmd+R / Ctrl+Alt+R records the column it wants in core, because
  // positioning the popup needs scroll offsets and geometry only this layer
  // has. Clicking the funnel reuses every bit of that maths, so the request is
  // fulfilled by clicking it rather than by recomputing the popup position.
  const requestedColumn = context.openFilterMenuForColumn;
  useEffect(() => {
    if (requestedColumn == null) return;
    // Addressed through the same data-filter-col lookup the popup uses to hand
    // focus back, rather than a second ref map of the same funnels — and that
    // lookup is where the "only columns in the range render a funnel, and one
    // scrolled under a frozen pane is display:none and refuses focus" guard now
    // lives, so both callers get it.
    const funnel = findFilterFunnel(
      refs.workbookContainer.current,
      requestedColumn
    );
    if (funnel) {
      funnel.click();
      funnel.focus();
    }
    setContext((draftCtx) => {
      draftCtx.openFilterMenuForColumn = null;
    });
  }, [requestedColumn, setContext, refs.workbookContainer]);

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
            // Kept on mousedown: it stops the press reaching the popup's own
            // document-level outside-click listener, which is what keeps the
            // close-then-reopen race of 3af3000 away from a click-driven
            // toggle — and what lets the shortcut below open the popup with a
            // plain .click().
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              // Toggles rather than only opening: a second press closes the
              // popup, so the aria-expanded below is a state the button can
              // actually change.
              toggleFilterContextMenu(v_adjusted, i);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            // A div with only onClick never fires on Enter, so the funnel was
            // focusable but not operable. Enter/Space now forward to the click.
            onKeyDown={activateOnEnterOrSpace}
            role="button"
            aria-haspopup="menu"
            aria-expanded={isOpen}
            aria-label={funnelLabel(columnIndex, filterParam != null)}
            // Gated on `isOpen`: the popup is only rendered while open, so the
            // reference would otherwise dangle.
            aria-controls={isOpen ? FILTER_MENU_ID : undefined}
            tabIndex={0}
            key={i}
            {...{ [FILTER_FUNNEL_COL_ATTR]: v.col }}
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
