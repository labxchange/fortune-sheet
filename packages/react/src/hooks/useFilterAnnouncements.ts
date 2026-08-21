import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import _ from "lodash";
import {
  Context,
  formatRefForSr,
  getFilterColumnExtent,
  isColumnFilterActive,
  isFilterDropdownCell,
  isFilterStateCurrent,
  isInFilterRegion,
  locale,
  replaceHtml,
} from "@fortune-sheet/core";

import { markAsRepeat } from "../utils/liveRegion";

type LocaleInfo = ReturnType<typeof locale>["info"];

/**
 * Screen-reader announcements for filter state, as a state machine over
 * `(selection, filterOptions, filter, config, sheetId)`.
 *
 * Filtering is otherwise conveyed only by the funnel icon, so it has to reach
 * the live regions two ways: as a property of the focused cell (the header cell
 * that owns the dropdown, and whether a criterion is applied to its column),
 * and as a one-off event when the cursor crosses a filtered column's boundary.
 *
 * Returns `cellAnnouncement` to append to the selection region, and
 * `regionAnnouncement` for the separate crossing region — a crossing lands a
 * commit after the cell text, so putting it in the selection region would make
 * the whole cell description be announced a second time.
 */
export function useFilterAnnouncements(context: Context, info: LocaleInfo) {
  const filterCellState = useMemo(() => {
    const lastSelection = _.last(context.luckysheet_select_save);
    // `ctx.filterOptions` / `ctx.filter` lag the sheet by one commit, so on the
    // first render after a switch they still describe the previous sheet. Report
    // that window as `stale` rather than mixing it with the new sheet's
    // selection, which would put a filter the sheet does not have into the live
    // region and then baseline the crossing on a value that never held.
    const stale = !isFilterStateCurrent(context);
    if (
      stale ||
      !(
        lastSelection &&
        lastSelection.row_focus != null &&
        lastSelection.column_focus != null
      )
    )
      return {
        stale,
        filteredColumn: null,
        isDropdownCell: false,
        columnFiltered: false,
        columnExtent: null,
      };
    const rf = lastSelection.row_focus;
    const cf = lastSelection.column_focus;
    const columnFiltered = isColumnFilterActive(context, cf);
    return {
      stale,
      // Which filtered column the focus sits in, or null for none. Membership is
      // tracked per-column rather than as one region-wide flag: the block itself
      // routinely spans the entire sheet, so a whole-range test would be true
      // everywhere and could never announce a crossing — and identifying the
      // column is what lets a move between two filtered columns announce the
      // one just entered instead of falling silent.
      filteredColumn:
        isInFilterRegion(context, rf, cf) && columnFiltered ? cf : null,
      isDropdownCell: isFilterDropdownCell(context, rf, cf),
      columnFiltered,
      // The extent excludes rows the criterion hides, so it is re-derived when
      // `config.rowhidden` changes and not only when `filter` happens to.
      columnExtent: getFilterColumnExtent(context, cf),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    context.luckysheet_select_save,
    context.filter,
    context.filterOptions,
    context.config,
    context.currentSheetId,
  ]);

  // Region entry/exit is a transition, not a property of the cell, so it needs
  // the previously occupied filtered column. `undefined` means nothing has been
  // observed yet, which `null` cannot express — `null` is the meaningful state
  // of being in no filtered column.
  const prevFilteredColumn = useRef<number | null | undefined>(undefined);
  const prevFilterSheetId = useRef<string | undefined>(undefined);
  const [regionAnnouncement, setRegionAnnouncement] = useState("");
  const announceCount = useRef(0);

  // A live region speaks on content *change*, so the same phrase twice running
  // would be silent. Crossings do not reliably alternate: the sheet-switch
  // branches below announce nothing, so a user can leave a filtered column and
  // come back to it — or move between two sheets carrying the same filter range
  // — with no different phrase in between. markAsRepeat makes the text node
  // differ without changing what is spoken.
  const announceRegion = useCallback((phrase: string) => {
    announceCount.current += 1;
    setRegionAnnouncement(
      announceCount.current % 2 === 0 ? markAsRepeat(phrase) : phrase
    );
  }, []);

  // Computed after commit and held in state, rather than derived during render.
  // A `useMemo` that advanced the refs in its body consumed the crossing on the
  // first pass and then erased it on any second evaluation of the same
  // interaction — which React is free to do, and which reliably happens when one
  // interaction commits twice (activating a sheet does) — leaving the phrase
  // blank before a screen reader had read it and, the crossing spent, never
  // announced again. An effect runs once per commit, and the state it sets
  // outlives the commits in between.
  useEffect(() => {
    // Nothing to compare against yet while the filter state describes the
    // previous sheet; leave the baseline untouched so the crossing is judged
    // once this sheet's own filter has landed.
    if (filterCellState.stale) return;
    const wasColumn = prevFilteredColumn.current;
    const previousSheetId = prevFilterSheetId.current;
    const switchedSheet = previousSheetId !== context.currentSheetId;
    prevFilteredColumn.current = filterCellState.filteredColumn;
    prevFilterSheetId.current = context.currentSheetId;

    // Every branch with nothing to announce leaves the region holding whatever
    // it already said, rather than clearing it: a live region is silent while
    // its content is unchanged, whereas clearing would erase a phrase a screen
    // reader may not have read yet — and this effect does run on commits where
    // nothing relevant changed (activating a sheet commits twice).
    //
    // Baseline silently on the very first observation. Content already present in
    // a live region at first paint is not announced by screen readers anyway,
    // and firing one on load is noise.
    if (wasColumn === undefined) return;
    // Staying in the same filtered column — moving down it, say — is not a
    // crossing. A sheet switch is exempt: the column index means something
    // different on each sheet, and arrival there still needs describing.
    if (!switchedSheet && wasColumn === filterCellState.filteredColumn) return;
    if (filterCellState.filteredColumn === null) {
      // Leaving a sheet is not leaving a region — the region belonged to the
      // sheet the user is no longer on, so there is nothing to report as left.
      if (switchedSheet) return;
      announceRegion(info.leftFilteredRegion);
      return;
    }
    // Entered a filtered column: from outside the region, straight from another
    // filtered column, or by arriving on a freshly activated sheet. All three
    // need announcing — the extent describes this column and nothing else would
    // convey the move, and arriving silently used to leave the user inside a
    // region they were never told about, so the eventual exit announced "left"
    // for somewhere they had no idea they were.
    const extent = filterCellState.columnExtent;
    if (extent == null) return;
    announceRegion(
      replaceHtml(info.enteredFilteredRegion, {
        start: formatRefForSr(extent.start),
        end: formatRefForSr(extent.end),
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCellState, context.currentSheetId, info, announceRegion]);

  // Dropdown ownership and criterion state are properties of the focused cell,
  // so they ride along with it in the selection region and are repeated for each
  // cell that has them.
  const cellAnnouncement = useMemo(() => {
    const parts: string[] = [];
    if (filterCellState.isDropdownCell) {
      parts.push(info.cellHasFilterDropdown);
      if (filterCellState.columnFiltered) parts.push(info.cellFilterActive);
    }
    return parts.length > 0 ? ` ${parts.join(" ")}` : "";
  }, [filterCellState, info]);

  return { cellAnnouncement, regionAnnouncement };
}

export default useFilterAnnouncements;
