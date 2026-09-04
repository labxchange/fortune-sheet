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

// Same reason as searchReplaceAnnouncements: the mount-time placeholder
// selection is open-ended, and the search helpers walk `r1..r2` with `r2`
// undefined. Selecting a cell is what a user does before searching.
const renderWorkbook = (data: any = DATA) => {
  const ref = React.createRef<WorkbookInstance>();
  const view = render(
    <Workbook ref={ref} data={data as any} toolbarItems={["search"]} />
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

  it("lets Replace resume normally after Replace All", async () => {
    // Replace All clears the cursor. If it did not, the cell it left selected
    // would look like one Replace had just written, and the next press would
    // skip it.
    const { getByRole, ref } = renderWorkbook();
    const dialog = await openDialog(getByRole);
    fillFields(dialog, "beta", "beta_");

    act(() => {
      fireEvent.click(dialog.querySelector("#replaceAllBtn")!);
    });
    expect(valueAt(ref, 2, 0)).toBe("beta_");

    // The selection now sits on the only match; a stale cursor would refuse.
    act(() => {
      fireEvent.click(dialog.querySelector("#replaceBtn")!);
    });
    expect(valueAt(ref, 2, 0)).toBe("beta__");
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
});
