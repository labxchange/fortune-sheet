/**
 * The DOM contract shared by the filter funnel (`FilterOption`) and the popup it
 * opens (`FilterMenu`): the popup's id, and how to find a funnel again by the
 * column it filters.
 *
 * Their own home rather than one importing from the other, because the
 * references run both ways — the funnel points `aria-controls` at the popup, and
 * the popup's footer buttons hand focus back to the funnel — and a cycle between
 * two component modules survives only as long as nothing touches the other's
 * exports at module-evaluation time.
 */

/**
 * Set on the popup so the funnel can point `aria-controls` at it. A constant
 * rather than `useId` because the two live in separate components — the same
 * reason `SHEET_TAB_MENU_ID` is one. Only one filter popup is ever open (a
 * mousedown anywhere else closes it, including in another workbook on the page),
 * so a fixed id cannot be duplicated in one document.
 */
export const FILTER_MENU_ID = "fortune-filter-menu";

/**
 * Marks each funnel button with the *absolute* column index it filters, so a
 * caller that knows only a column (the popup, which is handed
 * `filterContextMenu.col`) can find the button again after a criterion change
 * has rebuilt the funnel list. Counting `.luckysheet-filter-options` nodes
 * instead would mean re-deriving the relative offset, which the frozen-pane
 * branches in `FilterOption` make no promises about.
 */
export const FILTER_FUNNEL_COL_ATTR = "data-filter-col";

export function findFilterFunnel(
  container: HTMLElement | null | undefined,
  col: number | null | undefined
): HTMLElement | null {
  if (container == null || col == null) return null;
  return container.querySelector<HTMLElement>(
    `[${FILTER_FUNNEL_COL_ATTR}="${col}"]`
  );
}
