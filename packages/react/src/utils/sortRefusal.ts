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
 * Every reason returns a message, including `noData` and `noSelection`. An
 * earlier revision returned null for those two on the grounds that "nothing
 * was sorted" is something the user can see — which is exactly the wrong
 * instinct in an accessibility change: a screen-reader user cannot see it, and
 * the result was a Sort that closed its dialog and said nothing in either
 * channel. Before the announcement was gated at all, the same press claimed
 * "Sorted in ascending order." Silence is better than a lie and worse than the
 * truth. `sort.nothingToSort` is the one string this needed adding.
 */
export function sortRefusalMessage(
  context: Parameters<typeof locale>[0],
  reason: SortRefusal
): string {
  const { sort, generalDialog } = locale(context);
  switch (reason) {
    case "multiRange":
      return sort.noRangeError;
    case "mergedCells":
      return sort.mergeError;
    case "readOnly":
      return generalDialog.readOnlyError;
    // `noData` and `noSelection` are the same thing to a user: the range they
    // pressed Sort on had nothing sortable in its key column.
    default:
      return sort.nothingToSort;
  }
}

export default sortRefusalMessage;
