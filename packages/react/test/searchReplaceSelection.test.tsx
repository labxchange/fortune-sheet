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
    // The cursor is not document state, so Undo does not revert it. If it
    // survived, the press after Undo would treat the cell the user has just
    // restored as one we had already written, skip it, and silently write the
    // next match instead — a cell they never asked about.
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
});
