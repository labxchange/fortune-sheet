import { SortRefusal, locale } from "@fortune-sheet/core";

/**
 * The alert to show when `sortSelection` declines, or `null` for the cases
 * where there is nothing useful to say.
 *
 * Shared by the two callers — the cell menu's Ascending/Descending rows and the
 * Sort dialog's Confirm — because a refusal is a property of the operation, not
 * of which control asked for it. Keeping it in one place is also what stops the
 * two drifting: before this, the menu rows alerted on a multi-range selection
 * and said nothing about merged cells, and the dialog said nothing at all.
 *
 * `sort.noRangeError` and `sort.mergeError` are not new strings. They have been
 * in all six locale files since before this fork, unused, as the two
 * commented-out `alert()` calls in `core/src/modules/sort.ts` — so the wording
 * is the original author's rather than something invented here.
 *
 * `noSelection` and `noData` return null on purpose. Both mean there was
 * nothing to sort — an empty key column, or no selection at all — which the
 * user can see, and neither has a string in the locale files that says so.
 * Inventing one would mean six translations for a case a sighted user has
 * already observed; the screen-reader half is covered by the announcement
 * staying silent, which is the correct outcome for "nothing happened".
 */
export function sortRefusalMessage(
  context: Parameters<typeof locale>[0],
  reason: SortRefusal
): string | null {
  const { sort, generalDialog } = locale(context);
  switch (reason) {
    case "multiRange":
      return sort.noRangeError;
    case "mergedCells":
      return sort.mergeError;
    case "readOnly":
      return generalDialog.readOnlyError;
    default:
      return null;
  }
}

export default sortRefusalMessage;
