import {
  createFilterOptions,
  fixColumnStyleOverflowInFreeze,
  fixRowStyleOverflowInFreeze,
  getCellValue,
  getFlowdata,
  getSheetIndex,
  indexToColumnChar,
  locale,
  replaceHtml,
} from "@fortune-sheet/core";
import _ from "lodash";
import React, { useCallback, useContext, useEffect } from "react";
import WorkbookContext from "../../context";
import { mouseDownToggleHandlers } from "../../utils/keyboardActivation";
import { FILTER_FUNNEL_COL_ATTR, FILTER_MENU_ID } from "../../utils/filterDom";
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
   * Accessible name for one column's funnel (WCAG 4.1.2). A row of identically
   * named buttons is unusable by ear, so each is named after the header cell
   * that owns it — the name the user knows the column by — falling back to the
   * column letter when that header is blank.
   *
   * A plain function rather than a useCallback: the name is derived from the
   * sheet's own data, so any dependency list honest enough to include it would
   * change on every render that could alter the name anyway.
   */
  const flowdata = getFlowdata(context);
  const funnelLabel = (col: number) => {
    const header =
      filterOptions == null || flowdata == null
        ? null
        : getCellValue(filterOptions.startRow, col, flowdata, "m");
    const headerText = _.isNil(header) ? "" : String(header).trim();
    return headerText
      ? replaceHtml(info.filterDropdown, { column: headerText })
      : replaceHtml(info.filterDropdownUnnamed, {
          column: indexToColumnChar(col),
        });
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

        const isOpen = context.filterContextMenu?.col === v.col;

        return (
          <div
            // Toggles on mousedown, the way every other popup trigger in the
            // workbook does: the popup closes itself on any mousedown outside
            // it, so running the toggle on click instead meant the outside-click
            // close and the click-to-open raced (3af3000). Also makes the
            // control operable by keyboard (WCAG 2.1.1) — Enter and Space run
            // the same toggle, which is what this funnel had no handler for.
            {...mouseDownToggleHandlers(() =>
              toggleFilterContextMenu(v_adjusted, i)
            )}
            onDoubleClick={(e) => e.stopPropagation()}
            role="button"
            aria-label={funnelLabel(v.col)}
            aria-expanded={isOpen}
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
