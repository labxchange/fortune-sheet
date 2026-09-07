import { render, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";
import Workbook, { WorkbookInstance } from "../src/components/Workbook";

// Two bugs about what Replace leaves behind, rather than what it writes.
//
// Both come from the same place: `replace` and `replaceAll` finish by parking
// `luckysheet_select_save` on what they just touched, and the next thing to
// read that selection treats it as the user's own. For `replace` the next
// reader is `replace` itself, which re-finds the cell it just wrote; for
// `replaceAll` it is the sheet, which stays covered in a selection the user
// never made.

const DATA = [
  {
    name: "Sheet1",
    celldata: [
      {
        r: 0,
        c: 0,
        v: { v: "8_10", m: "8_10", ct: { fa: "General", t: "s" } },
      },
      {
        r: 1,
        c: 0,
        v: { v: "8_10", m: "8_10", ct: { fa: "General", t: "s" } },
      },
      {
        r: 2,
        c: 0,
        v: { v: "beta", m: "beta", ct: { fa: "General", t: "s" } },
      },
    ],
  },
];

// Two sheets whose matches sit at the same coordinates. A cursor that is not
// scoped to its sheet matches by `r`/`c` alone, so Sheet2's A1 looks like the
// cell Replace just wrote on Sheet1.
const TWO_SHEETS = [
  {
    name: "Sheet1",
    id: "s1",
    celldata: [
      {
        r: 0,
        c: 0,
        v: { v: "8_10", m: "8_10", ct: { fa: "General", t: "s" } },
      },
    ],
  },
  {
    name: "Sheet2",
    id: "s2",
    celldata: [
      {
        r: 0,
        c: 0,
        v: { v: "8_10", m: "8_10", ct: { fa: "General", t: "s" } },
      },
      {
        r: 5,
        c: 0,
        v: { v: "8_10", m: "8_10", ct: { fa: "General", t: "s" } },
      },
    ],
  },
];

// A match inside the column the user selects and one outside it, so a run that
// escapes their selection is visible in a cell they never targeted.
const OUT_OF_RANGE = [
  {
    name: "Sheet1",
    celldata: [
      { r: 0, c: 0, v: { v: "cat", m: "cat", ct: { fa: "General", t: "s" } } },
      { r: 1, c: 0, v: { v: "cat", m: "cat", ct: { fa: "General", t: "s" } } },
      { r: 0, c: 2, v: { v: "cat", m: "cat", ct: { fa: "General", t: "s" } } },
    ],
  },
];

// A non-matching row above two matches, so deleting it shifts a *different*
// cell onto the coordinates the cursor recorded.
const JUNK_FIRST = [
  {
    name: "Sheet1",
    celldata: [
      {
        r: 0,
        c: 0,
        v: { v: "junk", m: "junk", ct: { fa: "General", t: "s" } },
      },
      {
        r: 1,
        c: 0,
        v: { v: "8_10", m: "8_10", ct: { fa: "General", t: "s" } },
      },
      {
        r: 2,
        c: 0,
        v: { v: "8_10", m: "8_10", ct: { fa: "General", t: "s" } },
      },
    ],
  },
];

// Two spellings that differ only in case, so Match case changes what matches.
const MIXED_CASE = [
  {
    name: "Sheet1",
    celldata: [
      { r: 0, c: 0, v: { v: "abc", m: "abc", ct: { fa: "General", t: "s" } } },
      { r: 1, c: 0, v: { v: "ABC", m: "ABC", ct: { fa: "General", t: "s" } } },
    ],
  },
];

// Same reason as searchReplaceAnnouncements: the mount-time placeholder
// selection is open-ended, and the search helpers walk `r1..r2` with `r2`
// undefined. Selecting a cell is what a user does before searching.
const renderWorkbook = (
  data: any = DATA,
  toolbarItems: string[] = ["search"]
) => {
  const ref = React.createRef<WorkbookInstance>();
  const view = render(
    <Workbook ref={ref} data={data as any} toolbarItems={toolbarItems} />
  );
  act(() => {
    ref.current!.setSelection([{ row: [0, 0], column: [0, 0] }]);
  });
  return { ...view, ref };
};

const openDialog = async (getByRole: any) => {
  fireEvent.click(getByRole("button", { name: /find and replace/i }));
  return waitFor(() => getByRole("dialog"));
};

// The replace field only exists on the Replace tab; the dialog opens on Find.
const fillFields = (dialog: HTMLElement, find: string, replaceWith: string) => {
  fireEvent.click(dialog.querySelector("#replaceTab")!);
  fireEvent.change(dialog.querySelector("#searchInput input")!, {
    target: { value: find },
  });
  fireEvent.change(dialog.querySelector("#replaceInput input")!, {
    target: { value: replaceWith },
  });
};

const valueAt = (
  ref: React.RefObject<WorkbookInstance>,
  r: number,
  c: number
) => ref.current!.getCellValue(r, c);

describe("Replace leaves a usable selection", () => {
  it("does not re-replace the cell it just wrote", async () => {
    const { getByRole, ref } = renderWorkbook();
    const dialog = await openDialog(getByRole);
    fillFields(dialog, "8_10", "8_10_");

    const replaceBtn = dialog.querySelector("#replaceBtn")!;

    // The replacement still contains the search text, so the cell stays a
    // match. Pressing Replace again must move on to the *next* match rather
    // than rewrite this one.
    act(() => {
      fireEvent.click(replaceBtn);
    });
    expect(valueAt(ref, 0, 0)).toBe("8_10_");

    act(() => {
      fireEvent.click(replaceBtn);
    });
    expect(valueAt(ref, 0, 0)).toBe("8_10_");
    expect(valueAt(ref, 1, 0)).toBe("8_10_");

    act(() => {
      fireEvent.click(replaceBtn);
    });
    expect(valueAt(ref, 0, 0)).toBe("8_10_");
    expect(valueAt(ref, 1, 0)).toBe("8_10_");
  });

  it("still walks forward through every match", async () => {
    // The ordinary case, where the replacement is not itself a match. Guards
    // against the cursor turning "don't redo this cell" into "stop after one".
    const { getByRole, ref } = renderWorkbook();
    const dialog = await openDialog(getByRole);
    fillFields(dialog, "8_10", "done");

    const replaceBtn = dialog.querySelector("#replaceBtn")!;
    act(() => {
      fireEvent.click(replaceBtn);
    });
    act(() => {
      fireEvent.click(replaceBtn);
    });

    expect(valueAt(ref, 0, 0)).toBe("done");
    expect(valueAt(ref, 1, 0)).toBe("done");
  });

  it("resumes on a cell the user selects that Replace did not write", async () => {
    // The cursor yields to a selection somewhere else: row 1 is untouched by
    // the first press, and selecting it is the user saying they mean it.
    const { getByRole, ref } = renderWorkbook();
    const dialog = await openDialog(getByRole);
    fillFields(dialog, "8_10", "8_10_");

    act(() => {
      fireEvent.click(dialog.querySelector("#replaceBtn")!);
    });
    expect(valueAt(ref, 0, 0)).toBe("8_10_");

    act(() => {
      ref.current!.setSelection([{ row: [1, 1], column: [0, 0] }]);
    });
    act(() => {
      fireEvent.click(dialog.querySelector("#replaceBtn")!);
    });

    expect(valueAt(ref, 1, 0)).toBe("8_10_");
    expect(valueAt(ref, 0, 0)).toBe("8_10_");
  });

  it("stops rather than reappending when the terms are unchanged", async () => {
    // Reselecting the very cell Replace left the selection on is
    // indistinguishable from never having moved, so the cursor still holds and
    // the press is refused. Documented in `replaceCursor`; this pins it so the
    // trade is a decision rather than a surprise.
    const { getByRole, ref } = renderWorkbook();
    const dialog = await openDialog(getByRole);
    fillFields(dialog, "8_10", "8_10_");

    act(() => {
      fireEvent.click(dialog.querySelector("#replaceBtn")!);
    });
    act(() => {
      ref.current!.setSelection([{ row: [0, 0], column: [0, 0] }]);
    });
    act(() => {
      fireEvent.click(dialog.querySelector("#replaceBtn")!);
    });

    expect(valueAt(ref, 0, 0)).toBe("8_10_");
  });

  it("collapses the selection to one cell after Replace All", async () => {
    const { getByRole, ref } = renderWorkbook();
    const dialog = await openDialog(getByRole);
    fillFields(dialog, "8_10", "X");

    act(() => {
      fireEvent.click(dialog.querySelector("#replaceAllBtn")!);
    });

    expect(valueAt(ref, 0, 0)).toBe("X");
    expect(valueAt(ref, 1, 0)).toBe("X");

    // Not merely "some single cell": collapsing onto the wrong one is the
    // failure this guards against, so pin it to the first match replaced.
    const selection = ref.current!.getSelection()!;
    expect(selection).toHaveLength(1);
    const { row, column } = selection[0] as any;
    expect(row).toEqual([0, 0]);
    expect(column).toEqual([0, 0]);
  });

  it("does not append again to the cell Replace All left selected", async () => {
    // "Replace All consumed every match" is false when the replacement still
    // matches: every cell it wrote is still a match, and it parks the
    // selection on the first of them. So it leaves a cursor there like Replace
    // does, and the next press resumes after that cell instead of appending to
    // it — here there is nothing after it, so nothing is written.
    const { getByRole, ref } = renderWorkbook();
    const dialog = await openDialog(getByRole);
    fillFields(dialog, "beta", "beta_");

    act(() => {
      fireEvent.click(dialog.querySelector("#replaceAllBtn")!);
    });
    expect(valueAt(ref, 2, 0)).toBe("beta_");

    act(() => {
      fireEvent.click(dialog.querySelector("#replaceBtn")!);
    });
    expect(valueAt(ref, 2, 0)).toBe("beta_");
  });

  it("lets Replace resume after Replace All once a term changes", async () => {
    // The cursor Replace All leaves behind is bounded the same way Replace's
    // is: change a field and the cell is free again.
    const { getByRole, ref } = renderWorkbook();
    const dialog = await openDialog(getByRole);
    fillFields(dialog, "beta", "beta_");

    act(() => {
      fireEvent.click(dialog.querySelector("#replaceAllBtn")!);
    });
    expect(valueAt(ref, 2, 0)).toBe("beta_");

    fireEvent.change(dialog.querySelector("#replaceInput input")!, {
      target: { value: "gamma" },
    });
    act(() => {
      fireEvent.click(dialog.querySelector("#replaceBtn")!);
    });
    expect(valueAt(ref, 2, 0)).toBe("gamma_");
  });

  it("replaces the same cell again once a term changes", async () => {
    // The documented way out of the refusal above: the cursor is only honoured
    // while both terms are unchanged, so editing either one frees the cell.
    const { getByRole, ref } = renderWorkbook();
    const dialog = await openDialog(getByRole);
    fillFields(dialog, "8_10", "8_10_");

    act(() => {
      fireEvent.click(dialog.querySelector("#replaceBtn")!);
    });
    expect(valueAt(ref, 0, 0)).toBe("8_10_");

    fireEvent.change(dialog.querySelector("#replaceInput input")!, {
      target: { value: "8_10x" },
    });
    act(() => {
      fireEvent.click(dialog.querySelector("#replaceBtn")!);
    });

    expect(valueAt(ref, 0, 0)).toBe("8_10x_");
    expect(valueAt(ref, 1, 0)).toBe("8_10");
  });

  it("does not carry the cursor onto another sheet", async () => {
    // The cursor is keyed by coordinates, so without a sheet of its own it
    // would match a same-positioned cell on the sheet the user switched to and
    // skip the match they have selected.
    const { getByRole, ref } = renderWorkbook(TWO_SHEETS);
    const dialog = await openDialog(getByRole);
    fillFields(dialog, "8_10", "8_10_");

    act(() => {
      fireEvent.click(dialog.querySelector("#replaceBtn")!);
    });
    expect(valueAt(ref, 0, 0)).toBe("8_10_");

    act(() => {
      ref.current!.activateSheet({ id: "s2" });
    });
    act(() => {
      ref.current!.setSelection([{ row: [0, 0], column: [0, 0] }]);
    });
    act(() => {
      fireEvent.click(dialog.querySelector("#replaceBtn")!);
    });

    // Sheet2's A1 is selected and matches, so it is what gets written — not
    // the next match down.
    expect(valueAt(ref, 0, 0)).toBe("8_10_");
    expect(valueAt(ref, 5, 0)).toBe("8_10");
  });

  it("replaces the restored cell again after Undo", async () => {
    // The cursor is not document state, so Undo does not revert it and nothing
    // clears it. What saves the restored cell is that it no longer holds the
    // text we wrote there, so the cursor stops recognising it. Were the cursor
    // keyed on coordinates alone, the press after Undo would treat the cell
    // the user has just restored as one we had already written, skip it, and
    // silently write the next match instead — a cell they never asked about.
    const { getByRole, ref } = renderWorkbook(DATA, ["undo", "search"]);
    const dialog = await openDialog(getByRole);
    fillFields(dialog, "8_10", "8_10_");

    act(() => {
      fireEvent.click(dialog.querySelector("#replaceBtn")!);
    });
    expect(valueAt(ref, 0, 0)).toBe("8_10_");

    act(() => {
      fireEvent.click(getByRole("button", { name: /^undo$/i }));
    });
    expect(valueAt(ref, 0, 0)).toBe("8_10");

    act(() => {
      fireEvent.click(dialog.querySelector("#replaceBtn")!);
    });
    expect(valueAt(ref, 0, 0)).toBe("8_10_");
    expect(valueAt(ref, 1, 0)).toBe("8_10");
  });

  it("walks on when the replacement empties the cell", async () => {
    // The cursor records the cell's text by reading it back after the write,
    // and replacing with nothing leaves a cell that reads as nullish rather
    // than as "". Taking `.toString()` of that throws, so Replace has to
    // record the empty text and carry on to the next match.
    const { getByRole, ref } = renderWorkbook();
    const dialog = await openDialog(getByRole);
    fillFields(dialog, "8_10", "");

    act(() => {
      fireEvent.click(dialog.querySelector("#replaceBtn")!);
    });
    expect(valueAt(ref, 0, 0)).toBeNull();

    act(() => {
      fireEvent.click(dialog.querySelector("#replaceBtn")!);
    });
    expect(valueAt(ref, 1, 0)).toBeNull();
  });

  it("leaves the cell alone again after Undo then Redo", async () => {
    // Redo puts the document back exactly as Replace left it, so the cell
    // holds our text again and the cursor is right to recognise it: the press
    // after a redo should behave like the press after the original replace and
    // move on. Clearing the cursor on redo instead would hand A1 back and
    // append to it, which is the headline bug of this PR reached through the
    // history buttons.
    const { getByRole, ref } = renderWorkbook(DATA, ["undo", "redo", "search"]);
    const dialog = await openDialog(getByRole);
    fillFields(dialog, "8_10", "8_10_");

    act(() => {
      fireEvent.click(dialog.querySelector("#replaceBtn")!);
    });
    expect(valueAt(ref, 0, 0)).toBe("8_10_");

    act(() => {
      fireEvent.click(getByRole("button", { name: /^undo$/i }));
    });
    act(() => {
      fireEvent.click(getByRole("button", { name: /^redo$/i }));
    });
    expect(valueAt(ref, 0, 0)).toBe("8_10_");

    act(() => {
      fireEvent.click(dialog.querySelector("#replaceBtn")!);
    });

    // A1 is left alone and the run resumes on the next match.
    expect(valueAt(ref, 0, 0)).toBe("8_10_");
    expect(valueAt(ref, 1, 0)).toBe("8_10_");
  });

  it("keeps a second Replace All inside the user's selection", async () => {
    // Collapsing onto one cell would widen the next run: a single-cell
    // selection reads as "no selection" and defaults to the whole sheet. So a
    // selection the user drew is left alone — C1 is outside it and must stay
    // untouched however many times Replace All runs.
    const { getByRole, ref } = renderWorkbook(OUT_OF_RANGE);
    act(() => {
      ref.current!.setSelection([{ row: [0, 1], column: [0, 0] }]);
    });
    const dialog = await openDialog(getByRole);
    fillFields(dialog, "cat", "dog");

    const replaceAllBtn = dialog.querySelector("#replaceAllBtn")!;
    act(() => {
      fireEvent.click(replaceAllBtn);
    });
    expect(valueAt(ref, 0, 0)).toBe("dog");
    expect(valueAt(ref, 1, 0)).toBe("dog");
    expect(valueAt(ref, 0, 2)).toBe("cat");

    act(() => {
      fireEvent.click(replaceAllBtn);
    });
    expect(valueAt(ref, 0, 2)).toBe("cat");
  });

  it("resumes past the anchor, and stops, after a whole-sheet Replace All", async () => {
    // The multi-match version of the test above it, on the branch that
    // collapses. The first press must not re-hit the anchor, and the residual
    // it does have — one more suffix on the next match, which this run also
    // wrote — has to terminate rather than walk the sheet.
    const { getByRole, ref } = renderWorkbook();
    const dialog = await openDialog(getByRole);
    fillFields(dialog, "8_10", "8_10_");

    act(() => {
      fireEvent.click(dialog.querySelector("#replaceAllBtn")!);
    });
    expect(valueAt(ref, 0, 0)).toBe("8_10_");
    expect(valueAt(ref, 1, 0)).toBe("8_10_");

    const replaceBtn = dialog.querySelector("#replaceBtn")!;
    act(() => {
      fireEvent.click(replaceBtn);
    });
    expect(valueAt(ref, 0, 0)).toBe("8_10_");
    expect(valueAt(ref, 1, 0)).toBe("8_10__");

    // Nothing after A2, so the next press reports `lastMatchTip` and writes
    // nothing. Deliberately no wrap back onto A1.
    act(() => {
      fireEvent.click(replaceBtn);
    });
    expect(valueAt(ref, 0, 0)).toBe("8_10_");
    expect(valueAt(ref, 1, 0)).toBe("8_10__");
  });

  it("does not append again inside a selection the user drew", async () => {
    // The other half of the branch above. Leaving the user's range in place
    // leaves it *anchored* on a cell this run wrote, so this branch needs the
    // same cursor the collapsing one does; without it the next press appends
    // to that cell, which is the bug this PR exists to fix, reached through
    // Replace All inside a selection. `setSelection` here passes no focus, so
    // `normalizeSelection` defaults it to the range's first row and column and
    // the anchor is A1 — see the two tests at the end of this file for the
    // anchors a drag and a multi-range selection leave instead.
    const { getByRole, ref } = renderWorkbook(OUT_OF_RANGE);
    act(() => {
      ref.current!.setSelection([{ row: [0, 1], column: [0, 0] }]);
    });
    const dialog = await openDialog(getByRole);
    fillFields(dialog, "cat", "cat_");

    act(() => {
      fireEvent.click(dialog.querySelector("#replaceAllBtn")!);
    });
    expect(valueAt(ref, 0, 0)).toBe("cat_");
    expect(valueAt(ref, 1, 0)).toBe("cat_");
    expect(valueAt(ref, 0, 2)).toBe("cat");

    act(() => {
      fireEvent.click(dialog.querySelector("#replaceBtn")!);
    });

    // A1 is the cell the selection is anchored on, and it is left alone.
    expect(valueAt(ref, 0, 0)).toBe("cat_");
    // A2 is the knowingly-accepted residual, not the desired outcome: "resume
    // after the anchored cell" lands on the next match, which this run had
    // also written, so it gains one more suffix before the press after it
    // reports `lastMatchTip`. Bounded, and the same trade the whole-sheet
    // branch makes; narrowing it means teaching the cursor to stand for a
    // whole run, which would refuse every cell until a term changes.
    expect(valueAt(ref, 1, 0)).toBe("cat__");
    // Still scoped: C1 was never in the user's range.
    expect(valueAt(ref, 0, 2)).toBe("cat");
  });

  it("frees the cell again when a search mode changes", async () => {
    // The modes are part of what the cursor was written for, like the terms:
    // ticking Match case narrows the matches, and the press after it must act
    // on the new first match rather than report there is nothing left.
    const { getByRole, ref } = renderWorkbook(MIXED_CASE);
    const dialog = await openDialog(getByRole);
    fillFields(dialog, "abc", "abc_");

    act(() => {
      fireEvent.click(dialog.querySelector("#replaceBtn")!);
    });
    expect(valueAt(ref, 0, 0)).toBe("abc_");

    // With Match case on, row 1's "ABC" drops out and row 0 is the only match
    // left — the cell the selection is already on.
    act(() => {
      fireEvent.click(dialog.querySelector("#caseCheck input")!);
    });
    act(() => {
      fireEvent.click(dialog.querySelector("#replaceBtn")!);
    });

    expect(valueAt(ref, 0, 0)).toBe("abc__");
    expect(valueAt(ref, 1, 0)).toBe("ABC");
  });
  it("replaces the cell again once its value has changed under the cursor", async () => {
    // Undo is only one of the ways the document moves out from under the
    // cursor. Retyping the search text into the cell Replace wrote leaves the
    // coordinates and the terms untouched, so a cursor that recorded only
    // those would still claim that cell as one we had written — and would skip
    // it and silently write the next match instead, which is finding 1's
    // defect reached by editing rather than by Undo.
    const { getByRole, ref } = renderWorkbook();
    const dialog = await openDialog(getByRole);
    fillFields(dialog, "8_10", "8_10_");

    act(() => {
      fireEvent.click(dialog.querySelector("#replaceBtn")!);
    });
    expect(valueAt(ref, 0, 0)).toBe("8_10_");

    act(() => {
      ref.current!.setCellValue(0, 0, "8_10");
    });
    act(() => {
      ref.current!.setSelection([{ row: [0, 0], column: [0, 0] }]);
    });
    act(() => {
      fireEvent.click(dialog.querySelector("#replaceBtn")!);
    });

    // A1 is what it wrote, and A2 — the cell the user never asked about — is
    // untouched.
    expect(valueAt(ref, 0, 0)).toBe("8_10_");
    expect(valueAt(ref, 1, 0)).toBe("8_10");
  });

  it("replaces the cell a row shift moved onto the cursor's coordinates", async () => {
    // The other shape of the same door: the value at those coordinates changes
    // without anyone editing that cell. Deleting the row above moves the
    // still-unreplaced match onto them, and a coordinates-only cursor would
    // report there was nothing left to replace while it sat there in plain
    // sight.
    const { getByRole, ref } = renderWorkbook(JUNK_FIRST);
    act(() => {
      ref.current!.setSelection([{ row: [1, 1], column: [0, 0] }]);
    });
    const dialog = await openDialog(getByRole);
    fillFields(dialog, "8_10", "8_10_");

    act(() => {
      fireEvent.click(dialog.querySelector("#replaceBtn")!);
    });
    expect(valueAt(ref, 1, 0)).toBe("8_10_");

    act(() => {
      ref.current!.deleteRowOrColumn("row", 0, 0);
    });
    // A2 now holds the match that was in A3 and was never replaced.
    expect(valueAt(ref, 0, 0)).toBe("8_10_");
    expect(valueAt(ref, 1, 0)).toBe("8_10");

    act(() => {
      ref.current!.setSelection([{ row: [1, 1], column: [0, 0] }]);
    });
    act(() => {
      fireEvent.click(dialog.querySelector("#replaceBtn")!);
    });
    expect(valueAt(ref, 1, 0)).toBe("8_10_");
  });

  it("resumes from the anchor a drag left, not from the first match", async () => {
    // `normalizeSelection` only defaults `row_focus` when it is nil, and a
    // drag always sets it — dragging A2 up to A1 gives `row: [0, 1]` with
    // `row_focus: 1`. That focus is what the next press resolves to, so the
    // cursor has to name it: recording the first match instead leaves the real
    // anchor unprotected and it takes another suffix.
    const { getByRole, ref } = renderWorkbook(OUT_OF_RANGE);
    act(() => {
      ref.current!.setSelection([
        { row: [0, 1], column: [0, 0], row_focus: 1, column_focus: 0 },
      ] as any);
    });
    const dialog = await openDialog(getByRole);
    fillFields(dialog, "cat", "cat_");

    act(() => {
      fireEvent.click(dialog.querySelector("#replaceAllBtn")!);
    });
    expect(valueAt(ref, 0, 0)).toBe("cat_");
    expect(valueAt(ref, 1, 0)).toBe("cat_");
    expect(valueAt(ref, 0, 2)).toBe("cat");

    act(() => {
      fireEvent.click(dialog.querySelector("#replaceBtn")!);
    });

    // A2 is the anchor, and it is the last match in the range, so the press
    // resumes past it, finds nothing after it and writes nothing at all.
    expect(valueAt(ref, 0, 0)).toBe("cat_");
    expect(valueAt(ref, 1, 0)).toBe("cat_");
    expect(valueAt(ref, 0, 2)).toBe("cat");
  });

  it("resumes past the anchor when it sits mid-way through the matches", async () => {
    // The multi-range version: `count` resolves from the *last* range's focus,
    // which need not be the first match — here the ranges are given C1 first,
    // so the search order is C1, A1, A2 while the anchor is A1. The press has
    // to protect A1 and move on to A2, rather than protect C1 and append to
    // A1 again.
    const { getByRole, ref } = renderWorkbook(OUT_OF_RANGE);
    act(() => {
      ref.current!.setSelection([
        { row: [0, 0], column: [2, 2] },
        { row: [0, 1], column: [0, 0] },
      ] as any);
    });
    const dialog = await openDialog(getByRole);
    fillFields(dialog, "cat", "cat_");

    act(() => {
      fireEvent.click(dialog.querySelector("#replaceAllBtn")!);
    });
    expect(valueAt(ref, 0, 2)).toBe("cat_");
    expect(valueAt(ref, 0, 0)).toBe("cat_");
    expect(valueAt(ref, 1, 0)).toBe("cat_");

    act(() => {
      fireEvent.click(dialog.querySelector("#replaceBtn")!);
    });

    // A1 is the anchor and is left alone; A2 is the next entry in search order
    // and takes the bounded extra suffix this branch already documents.
    expect(valueAt(ref, 0, 0)).toBe("cat_");
    expect(valueAt(ref, 1, 0)).toBe("cat__");
    expect(valueAt(ref, 0, 2)).toBe("cat_");
  });
});
