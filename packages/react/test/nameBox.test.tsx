import { render, act, fireEvent } from "@testing-library/react";
import React from "react";
import Workbook, { WorkbookInstance } from "../src/components/Workbook";

// The name box was a display-only div: it showed the reference in focus and
// accepted nothing. These cover it as the editable control it now is — the
// accessible name and role, the commit path, and the rejection path, which is
// the one that has to leave both the selection and the user's focus alone.

const celldata = [];
for (let r = 0; r <= 5; r += 1) {
  for (let c = 0; c <= 5; c += 1) {
    celldata.push({ r, c, v: { v: `r${r}c${c}`, m: `r${r}c${c}` } });
  }
}

// 10 rows by 8 columns of flowdata, so a reference past either extent has
// somewhere to be clamped to.
const sheet = { name: "Sheet1", id: "s1", celldata, row: 10, column: 8 };

describe("name box", () => {
  let ref: React.RefObject<WorkbookInstance>;
  let container: HTMLElement;

  const nameBox = () =>
    container.querySelector<HTMLInputElement>(".fortune-name-box")!;

  const rejectionText = () =>
    container.querySelector("#sr-nameBox")?.textContent ?? "";

  /** The grid's own cell alert, which now carries the clamp notice too. */
  const selectionText = () =>
    container.querySelector("#sr-selection")?.textContent ?? "";

  const selection = () => ref.current?.getSelection()?.[0];

  /** Focus, type, and press Enter — the whole commit interaction. */
  const commit = (value: string) => {
    const input = nameBox();
    act(() => {
      input.focus();
    });
    fireEvent.change(input, { target: { value } });
    fireEvent.keyDown(input, { key: "Enter" });
  };

  beforeEach(() => {
    ref = React.createRef<WorkbookInstance>();
    const view = render(<Workbook ref={ref} lang="en" data={[sheet as any]} />);
    container = view.container;
    act(() => {
      ref.current?.setSelection([{ row: [0, 0], column: [0, 0] }]);
    });
  });

  it("is an editable text control with a localised accessible name", () => {
    const input = nameBox();
    expect(input.tagName).toBe("INPUT");
    expect(input.type).toBe("text");
    expect(input.getAttribute("aria-label")).toBe("Name box");
  });

  it("takes its name and its rejection message from the active locale", () => {
    // Neither string is hardcoded in the component. Checked here rather than by
    // eye, because a screen-reader-only string that silently falls back to
    // English is invisible to review.
    const view = render(<Workbook lang="es" data={[sheet as any]} />);
    const input =
      view.container.querySelector<HTMLInputElement>(".fortune-name-box")!;
    expect(input.getAttribute("aria-label")).toBe("Cuadro de nombre");
    act(() => {
      input.focus();
    });
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(
      view.container.querySelector("#sr-nameBox")?.textContent ?? ""
    ).toContain("Referencia no reconocida.");
  });

  it("names the focus cell when the selection's extent is unresolved", () => {
    // The workbook's first selection is `row: [0, null]`, which `getRangetxt`
    // renders as "A1:NaN" — and `iscelldata` accepts that string, so Enter on
    // an untouched name box used to commit it and select the whole sheet.
    const view = render(<Workbook lang="en" data={[sheet as any]} />);
    const input =
      view.container.querySelector<HTMLInputElement>(".fortune-name-box")!;
    expect(input.value).toBe("A1");
    expect(input.value).not.toContain("NaN");
  });

  it("does not commit a range when the box is left untouched", () => {
    const view = render(<Workbook lang="en" data={[sheet as any]} />);
    const input =
      view.container.querySelector<HTMLInputElement>(".fortune-name-box")!;
    act(() => {
      input.focus();
    });
    fireEvent.keyDown(input, { key: "Enter" });
    // A1, the cell already in focus — not the whole sheet.
    expect(input.value).toBe("A1");
  });

  it("shows the reference of the current selection", () => {
    expect(nameBox().value).toBe("A1");
    act(() => {
      ref.current?.setSelection([{ row: [2, 2], column: [1, 4] }]);
    });
    expect(nameBox().value).toBe("B3:E3");
  });

  it.each(["b3", "B3"])("commits %s to the same single cell", (typed) => {
    commit(typed);
    expect(selection()).toMatchObject({ row: [2, 2], column: [1, 1] });
    // Redisplayed in the workbook's canonical form, whatever case was typed.
    expect(nameBox().value).toBe("B3");
  });

  it.each(["b3:e3", "B3:E3"])("commits %s to the same range", (typed) => {
    commit(typed);
    expect(selection()).toMatchObject({ row: [2, 2], column: [1, 4] });
    expect(nameBox().value).toBe("B3:E3");
  });

  it("lands focus where a click would, not on a control inside the grid", async () => {
    commit("B3");
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    // The cell input — exactly where `cellAreaMouseDown` leaves focus after a
    // plain click. The grid *root* was the obvious target and was wrong: it is
    // an unnamed container with focusable descendants, so a screen reader
    // landing there read into it and announced the first thing it found, which
    // is the select-all corner. Reported from a real VoiceOver pass.
    const active = document.activeElement as HTMLElement;
    expect(active.className).toContain("luckysheet-cell-input");
    expect(active.getAttribute("aria-label")).not.toBe("Select all cells");
    expect(active.className).not.toContain("fortune-left-top");
  });

  it.each(["hello", "3B", "", "Sheet2!A1", "<script>alert(1)</script>"])(
    "rejects %p without touching the selection",
    (typed) => {
      const before = selection();
      commit(typed);
      expect(selection()).toEqual(before);
      expect(nameBox().value).toBe("A1");
      expect(rejectionText()).toContain("Reference not recognised.");
    }
  );

  it("keeps focus in the box with the reverted text selected on rejection", () => {
    const input = nameBox();
    commit("hello");
    // Moving focus to the grid here would strand whoever mistyped: they would
    // have to tab back before they could correct it.
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it("re-announces a second rejection", () => {
    commit("hello");
    const first = rejectionText();
    commit("nonsense");
    const second = rejectionText();
    // A live region is silent when written the same text twice running, so the
    // text node has to differ — by a zero-width space, which adds no word.
    expect(second).not.toBe(first);
    expect(second.replace(/\u200B/g, "")).toBe(first.replace(/\u200B/g, ""));
  });

  it("clamps a reference past the sheet's extent instead of throwing", () => {
    expect(() => commit("A99999")).not.toThrow();
    expect(selection()).toMatchObject({ row: [9, 9], column: [0, 0] });
    expect(nameBox().value).toBe("A10");
    // The selection region guards against "NaN" for exactly this failure mode:
    // an index past the data reaches the geometry as undefined.
    expect(nameBox().value).not.toContain("NaN");
  });

  it("clamps a reference past the last column", () => {
    commit("ZZ1");
    expect(selection()).toMatchObject({ row: [0, 0], column: [7, 7] });
    expect(nameBox().value).toBe("H1");
  });

  // `A:A` and `3:3` are admitted by the syntax gate and resolved to a full-axis
  // range, so they are accepted rather than specially rejected. (The
  // `row_select` / `column_select` flags the commit also sets, matching
  // `selectWholeLine`, are not exposed by `getSelection`, which returns only
  // the coordinates.)
  it("accepts a whole-column reference", () => {
    commit("B:B");
    expect(selection()).toMatchObject({ row: [0, 9], column: [1, 1] });
    expect(nameBox().value).toBe("B1:B10");
  });

  it("accepts a whole-row reference", () => {
    commit("3:3");
    expect(selection()).toMatchObject({ row: [2, 2], column: [0, 7] });
    expect(nameBox().value).toBe("A3:H3");
  });

  it("leaves a multi-range selection alone when the box is untouched", () => {
    // Focusing the box seeds the draft from the *last* range, and committing
    // replaces the whole selection — so Enter on a box nobody typed into threw
    // away a Ctrl-click multi-selection with no keystroke that meant to.
    act(() => {
      ref.current?.setSelection([
        { row: [0, 0], column: [0, 0] },
        { row: [2, 2], column: [2, 2] },
      ]);
    });
    const before = ref.current?.getSelection();
    const input = nameBox();
    act(() => {
      input.focus();
    });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(ref.current?.getSelection()).toEqual(before);
    // And it does not eject the user into the grid either.
    expect(document.activeElement).toBe(input);
  });

  it("lets the user retry in place after a rejection", () => {
    // Reverting on rejection leaves the box showing the current reference, so
    // a second Enter — the natural "let me try again" — used to commit that
    // and throw focus into the grid, away from the box being corrected.
    const input = nameBox();
    commit("bogus");
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(document.activeElement).toBe(input);
  });

  it.each(["A0", "A99999"])("announces that %s was clamped", (typed) => {
    // Clamping is allowed; clamping silently is not. But the notice rides the
    // grid's own cell alert rather than the name box's polite region: a clamp
    // changes the selection, so `#sr-selection` fires in the same commit and a
    // polite write alongside it loses the race.
    commit(typed);
    expect(selectionText()).toContain("Reference is outside the sheet.");
    expect(rejectionText()).toBe("");
  });

  it("drops the clamp notice on the next selection change", () => {
    // It rides exactly one cell announcement — it must not still be attached
    // the next time the user arrows somewhere.
    commit("A99999");
    expect(selectionText()).toContain("Reference is outside the sheet.");
    act(() => {
      ref.current?.setSelection([{ row: [1, 1], column: [1, 1] }]);
    });
    expect(selectionText()).not.toContain("Reference is outside the sheet.");
  });

  it("says nothing extra when the reference needed no clamping", () => {
    commit("B3");
    expect(rejectionText()).toBe("");
    expect(selectionText()).not.toContain("Reference is outside the sheet.");
  });

  it("clears the rejection message once the user starts correcting it", () => {
    // This region sits beside the box rather than with the others at the end of
    // the grid, so anything left in it is parked in a browse-mode reader's path
    // through the formula bar.
    const input = nameBox();
    commit("hello");
    expect(rejectionText()).toContain("Reference not recognised.");
    fireEvent.change(input, { target: { value: "B" } });
    expect(rejectionText()).toBe("");
  });

  it("clears the rejection message when focus leaves the box", () => {
    const input = nameBox();
    commit("hello");
    expect(rejectionText()).toContain("Reference not recognised.");
    fireEvent.blur(input);
    expect(rejectionText()).toBe("");
  });

  it("does not write the typed reference into the formula cache", () => {
    // Resolution used to run through `getcellrange`, which memoises into
    // `ctx.formulaCache.cellTextToIndexList` — a cache nothing invalidates on
    // row insert. Navigation writing to the map the formula engine reads meant
    // a name box jump could seed what a later `=SUM(A:A)` resolved to.
    commit("A:A");
    expect(selection()).toMatchObject({ row: [0, 9], column: [0, 0] });
    act(() => {
      ref.current?.insertRowOrColumn("row", 9, 5, "rightbottom");
    });
    commit("A:A");
    // The full column of the *current* sheet, not the one cached before.
    expect(selection()).toMatchObject({ row: [0, 14], column: [0, 0] });
  });

  it("keeps a partly-typed reference when the selection moves underneath", () => {
    const input = nameBox();
    act(() => {
      input.focus();
    });
    fireEvent.change(input, { target: { value: "B" } });
    act(() => {
      ref.current?.setSelection([{ row: [4, 4], column: [4, 4] }]);
    });
    expect(input.value).toBe("B");
  });

  it("abandons the edit on Escape", () => {
    const input = nameBox();
    const before = selection();
    act(() => {
      input.focus();
    });
    fireEvent.change(input, { target: { value: "Z9" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("A1");
    expect(selection()).toEqual(before);
  });
});
