import type { Context } from "@fortune-sheet/core";

/**
 * The DOM contract shared by the filter funnel (`FilterOption`) and the popup it
 * opens (`FilterMenu`): the popup's id, how to find a funnel again by the column
 * it filters, and whether a filter command actually changed anything.
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
 * reason `SHEET_TAB_MENU_ID` is one. One workbook renders at most one filter
 * popup, so the id is unique within a workbook; two workbooks on the same page
 * can each hold one open (a keyboard toggle fires no mousedown, so no
 * useOutsideClick closes the other), in which case `aria-controls` resolves to
 * whichever popup comes first in document order. Accepted rather than fixed: a
 * per-workbook id would have to be threaded from the popup to the funnel.
 */
export const FILTER_MENU_ID = "fortune-filter-menu";

/**
 * Marks each funnel button with the *absolute* column index it filters, so a
 * caller that knows only a column (the popup, which is handed
 * `filterContextMenu.col`; the open-filter-menu shortcut, which is handed the
 * focused column) can find the button. Counting `.luckysheet-filter-options`
 * nodes instead would mean re-deriving the relative offset, which the
 * frozen-pane branches in `FilterOption` make no promises about.
 */
export const FILTER_FUNNEL_COL_ATTR = "data-filter-col";

/**
 * The funnel for `col`, or null when there is none a caller can hand focus to.
 *
 * "None" covers hidden as well as absent. A funnel scrolled behind a frozen pane
 * renders with an inline `display: none` — the `rangeshow = false` branch of both
 * `fixRowStyleOverflowInFreeze` and `fixColumnStyleOverflowInFreeze` — and a
 * browser refuses `.focus()` on such a node, leaving focus wherever it already
 * was. For the popup's footer buttons that is the button the same commit has
 * just unmounted, i.e. `<body>`: the exact failure this module exists to
 * prevent. `querySelector` matches hidden nodes and a hidden node is still
 * `isConnected`, so neither of those checks catches it. Reporting it as absent
 * here rather than inside `focusAfterCommit` is what lets the caller's
 * `?? cellInput` fallback run.
 *
 * `getComputedStyle` rather than `offsetParent` / `getClientRects`: jsdom
 * reports `display` faithfully but implements neither of the other two, so this
 * stays testable.
 */
export function findFilterFunnel(
  container: HTMLElement | null | undefined,
  col: number | null | undefined
): HTMLElement | null {
  if (container == null || col == null) return null;
  const funnel = container.querySelector<HTMLElement>(
    `[${FILTER_FUNNEL_COL_ATTR}="${col}"]`
  );
  if (funnel == null) return null;
  const view = funnel.ownerDocument.defaultView;
  if (view != null && view.getComputedStyle(funnel).display === "none") {
    return null;
  }
  return funnel;
}

/**
 * Whether a filter command left the sheet's filter untouched, in which case
 * focus should stay where the user put it: `createFilter` and `clearFilter` both
 * decline silently — a multi-range selection, a pivot table, a read-only sheet,
 * or a clear with nothing to clear — and relocating the user for a command that
 * did nothing is a surprise rather than a fix.
 *
 * Referential identity is enough, and this is the one place that reasoning is
 * written down: no bail path in either function re-assigns
 * `luckysheet_filter_save`, and immer preserves the reference for a subtree
 * nothing wrote to. If either ever mutates that value in place, this predicate
 * is what has to change — not the two call sites.
 *
 * Pass the context as of *after* the commit; both callers read it through a ref
 * for that reason.
 */
export function filterUnchanged(ctx: Context, before: unknown): boolean {
  return ctx.luckysheet_filter_save === before;
}
