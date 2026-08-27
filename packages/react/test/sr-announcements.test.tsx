import { render, act, fireEvent } from "@testing-library/react";
import React from "react";
import Workbook, { WorkbookInstance } from "../src/components/Workbook";

// Integration cover for the filter announcements: that the hook's two strings
// reach the right live regions in a real grid, and that the announcements land
// correctly across the commit sequence a real sheet switch produces. The
// crossing state machine itself is unit-tested in `useFilterAnnouncements`.

// Filter range covers rows 0-5, columns 2-4 (header row 0). `filter` is keyed
// relative to startCol, so key 0 === column 2 — the only column with a criterion.
const FILTER_SELECT = { row: [0, 5], column: [2, 4] };

const CRITERION = {
  caljs: {},
  rowhidden: {},
  optionstate: false,
  str: 0,
  edr: 5,
  cindex: 0,
  stc: 2,
  edc: 4,
};

const celldata = [];
for (let r = 0; r <= 5; r += 1) {
  for (let c = 0; c <= 5; c += 1) {
    celldata.push({ r, c, v: { v: `r${r}c${c}`, m: `r${r}c${c}` } });
  }
}

const sheet = {
  name: "Sheet1",
  id: "s1",
  celldata,
  row: 10,
  column: 8,
  filter_select: FILTER_SELECT,
  // Keyed relative to startCol: 0 === column C, 2 === column E. Column D (key 1)
  // sits between them inside the range with no criterion.
  filter: { 0: CRITERION, 2: CRITERION },
};

// A second sheet with no filter of its own, to check that the previous sheet's
// filter is not attributed to it while the mirrored state catches up.
const plainSheet = {
  name: "Sheet2",
  id: "s2",
  celldata,
  row: 10,
  column: 8,
};

// A second sheet with a filter of its own, over a different range: rows 0-5,
// columns 0-2, with a criterion on column 0 (A).
const otherFilteredSheet = {
  name: "Sheet3",
  id: "s3",
  celldata,
  row: 10,
  column: 8,
  filter_select: { row: [0, 5], column: [0, 2] },
  filter: {
    0: { ...CRITERION, cindex: 0, stc: 0, edc: 2 },
  },
};

describe("filter announcements", () => {
  let ref: React.RefObject<WorkbookInstance>;
  let container: HTMLElement;
  let rerender: (ui: React.ReactElement) => void;

  /** Cell-level filter state, announced alongside the focused cell. */
  const cellAnnouncement = () =>
    container.querySelector("#sr-selection")?.textContent ?? "";

  /**
   * Region crossings, which live in their own live region: they are one-off
   * events that land a commit after the cell text, so appending them to the
   * selection region would repeat the whole cell description.
   */
  const regionAnnouncement = () =>
    container.querySelector("#sr-filterRegion")?.textContent ?? "";

  /** Move the focused cell and return what the crossing region now says. */
  const focusCell = (row: number, column: number) => {
    act(() => {
      // setSelection takes a Range (SingleRange[]), not a single range.
      ref.current?.setSelection([
        { row: [row, row], column: [column, column] },
      ]);
    });
    return regionAnnouncement();
  };

  beforeEach(() => {
    ref = React.createRef<WorkbookInstance>();
    // lang mirrors the LabXchange wrapper, which hardcodes lang={"en"}.
    const view = render(<Workbook ref={ref} lang="en" data={[sheet as any]} />);
    container = view.container;
    rerender = view.rerender;
    // Establish the baseline outside the region so the first crossing is a
    // genuine transition rather than the initial auto-selection.
    focusCell(2, 0);
  });

  it("announces entering the filtered region in its own region", () => {
    expect(focusCell(2, 2)).toContain(
      // Column 2 is C. Row 0 is the header that carries the dropdown and is
      // never hidden, so the filtered data runs C2:C6.
      "Entered filtered region: C. 2 through C. 6."
    );
    // The crossing does not repeat the cell description.
    expect(cellAnnouncement()).not.toContain("Entered filtered region");
  });

  it("announces crossings politely rather than interrupting the cell", () => {
    // The crossing lands a commit after `#sr-selection` has the cell reference
    // and value, so an assertive region would preempt the announcement the user
    // navigated to hear.
    const region = container.querySelector("#sr-filterRegion");
    expect(region?.getAttribute("role")).toBe("status");
  });

  it("announces the dropdown and active filter on a filtered header cell", () => {
    focusCell(0, 2);
    expect(cellAnnouncement()).toContain("Has filter dropdown.");
    expect(cellAnnouncement()).toContain("Filter active.");
  });

  it("keeps the crossing announced across an unrelated re-render", () => {
    // The crossing is a one-off event held in state, not recomputed per render:
    // a re-render that leaves the selection and the filter alone must not blank
    // the region before a screen reader has read it.
    expect(focusCell(2, 2)).toContain("Entered filtered region: C. 2");
    act(() => {
      rerender(<Workbook ref={ref} lang="en" data={[sheet as any]} />);
    });
    expect(regionAnnouncement()).toContain("Entered filtered region: C. 2");
  });

  it("does not announce a transition on first render", () => {
    const { container: fresh } = render(
      <Workbook lang="en" data={[sheet as any]} />
    );
    const text = fresh.querySelector("#sr-filterRegion")?.textContent ?? "";
    expect(text).toBe("");
  });
});

describe("filter announcements across sheets", () => {
  it("does not attribute one sheet's filter to another", () => {
    const ref = React.createRef<WorkbookInstance>();
    const { container } = render(
      <Workbook ref={ref} lang="en" data={[sheet as any, plainSheet as any]} />
    );
    const cellText = () =>
      container.querySelector("#sr-selection")?.textContent ?? "";
    const regionText = () =>
      container.querySelector("#sr-filterRegion")?.textContent ?? "";

    act(() => {
      ref.current?.setSelection([{ row: [0, 0], column: [2, 2] }]);
    });
    expect(cellText()).toContain("Has filter dropdown.");

    // `filterOptions` is rebuilt by an effect one commit after the switch, so
    // the header cell of Sheet2 must not inherit Sheet1's dropdown, and moving
    // between sheets is not a region crossing.
    const beforeSwitch = regionText();
    act(() => {
      ref.current?.activateSheet({ id: "s2" });
    });
    act(() => {
      ref.current?.setSelection([{ row: [0, 0], column: [2, 2] }]);
    });
    expect(cellText()).not.toContain("Has filter dropdown.");
    expect(cellText()).not.toContain("Filter active.");
    // Sheet2 has no region to cross, so nothing new is spoken.
    expect(regionText()).toBe(beforeSwitch);
  });

  it("announces arriving inside a filtered column on another sheet", () => {
    // Activating Sheet3 commits twice: once for the switch, then again when
    // `FilterOption`'s effect rebuilds the mirrored filter state. The arrival has
    // to be judged on the second commit — the first still describes Sheet1 — and
    // must survive it rather than being consumed and erased in between.
    const ref = React.createRef<WorkbookInstance>();
    const { container } = render(
      <Workbook
        ref={ref}
        lang="en"
        data={[sheet as any, otherFilteredSheet as any]}
      />
    );
    const regionText = () =>
      container.querySelector("#sr-filterRegion")?.textContent ?? "";

    // Enter Sheet1's filtered column C first, so the baseline is a filtered
    // column and the move to Sheet3 is not simply "outside → inside".
    act(() => {
      ref.current?.setSelection([{ row: [2, 2], column: [2, 2] }]);
    });
    expect(regionText()).toContain("Entered filtered region: C. 2");

    // Sheet3's selection lands in column A, which carries its only criterion.
    act(() => {
      ref.current?.activateSheet({ id: "s3" });
    });
    expect(regionText()).toContain(
      "Entered filtered region: A. 2 through A. 6."
    );

    // And because the arrival was announced, the exit is no longer a "left" for
    // a region the user was never told they were in. Column 4 is outside
    // Sheet3's range entirely.
    act(() => {
      ref.current?.setSelection([{ row: [2, 2], column: [4, 4] }]);
    });
    expect(regionText()).toContain("Left filtered region.");
  });

  it("does not report leaving a region when switching away from it", () => {
    // The region belonged to the sheet the user is no longer on.
    const ref = React.createRef<WorkbookInstance>();
    const { container } = render(
      <Workbook ref={ref} lang="en" data={[sheet as any, plainSheet as any]} />
    );
    const regionText = () =>
      container.querySelector("#sr-filterRegion")?.textContent ?? "";

    act(() => {
      ref.current?.setSelection([{ row: [2, 2], column: [2, 2] }]);
    });
    expect(regionText()).toContain("Entered filtered region: C. 2");

    const beforeSwitch = regionText();
    act(() => {
      ref.current?.activateSheet({ id: "s2" });
    });
    // Unchanged, so nothing new is spoken — in particular not "left", which the
    // user did not do.
    expect(regionText()).toBe(beforeSwitch);
  });

  it("re-announces the same column after switching away and back", () => {
    // Switching away announces nothing, so returning to the same filtered column
    // reaches a phrase the region already holds — which a live region would not
    // speak unless the text itself differs.
    const ref = React.createRef<WorkbookInstance>();
    const { container } = render(
      <Workbook ref={ref} lang="en" data={[sheet as any, plainSheet as any]} />
    );
    const regionText = () =>
      container.querySelector("#sr-filterRegion")?.textContent ?? "";

    act(() => {
      ref.current?.setSelection([{ row: [2, 2], column: [2, 2] }]);
    });
    const entered = regionText();
    expect(entered).toContain("Entered filtered region: C. 2 through C. 6.");

    act(() => {
      ref.current?.activateSheet({ id: "s2" });
    });
    expect(regionText()).toBe(entered);

    act(() => {
      ref.current?.activateSheet({ id: "s1" });
    });
    const back = regionText();
    expect(back).toContain("Entered filtered region: C. 2 through C. 6.");
    // Changed, so it is spoken — and the difference is a zero-width space, which
    // adds no spoken word.
    expect(back).not.toBe(entered);
    expect(back.replace(/\u200B/g, "")).toBe(entered.replace(/\u200B/g, ""));
  });
});

describe("select-all announcement", () => {
  let ref: React.RefObject<WorkbookInstance>;
  let container: HTMLElement;

  const corner = () =>
    container.querySelector<HTMLElement>(".fortune-left-top")!;

  const announcement = () =>
    container.querySelector("#sr-selectAll")?.textContent ?? "";

  beforeEach(() => {
    ref = React.createRef<WorkbookInstance>();
    const view = render(<Workbook ref={ref} lang="en" data={[sheet as any]} />);
    container = view.container;
  });

  it("says nothing on first paint", () => {
    // A workbook that loads with everything selected must not announce it on
    // paint — the region baselines silently on its first observation.
    expect(announcement()).toBe("");
  });

  it("announces the outcome when the corner is clicked", () => {
    fireEvent.click(corner());
    expect(announcement()).toContain("All cells selected.");
  });

  it("announces the same way when activated from the keyboard", () => {
    act(() => {
      corner().focus();
    });
    fireEvent.keyDown(corner(), { key: "Enter" });
    expect(announcement()).toContain("All cells selected.");
  });

  it("leaves focus on the control", () => {
    act(() => {
      corner().focus();
    });
    fireEvent.keyDown(corner(), { key: "Enter" });
    // The announcement is feedback, not a destination: a user who activated it
    // has to be able to tab onward from where they were.
    expect(document.activeElement).toBe(corner());
  });

  it("is polite rather than assertive", () => {
    // `#sr-selection` is an alert and lands the cell description a commit
    // later; an assertive message here would cut it off mid-word.
    expect(container.querySelector("#sr-selectAll")?.getAttribute("role")).toBe(
      "status"
    );
  });

  it("takes the message from the active locale", () => {
    const view = render(<Workbook lang="es" data={[sheet as any]} />);
    fireEvent.click(
      view.container.querySelector<HTMLElement>(".fortune-left-top")!
    );
    expect(
      view.container.querySelector("#sr-selectAll")?.textContent ?? ""
    ).toContain("Todas las celdas seleccionadas.");
  });

  it("speaks a second activation too", () => {
    fireEvent.click(corner());
    const first = announcement();
    fireEvent.click(corner());
    const second = announcement();
    // Selecting all twice running writes an identical selection, so nothing
    // about the state changes — but a live region only speaks on a change, so
    // the text node has to differ.
    expect(second).not.toBe(first);
    expect(second.replace(/\u200B/g, "")).toBe(first.replace(/\u200B/g, ""));
  });

  it("speaks again after the selection has moved away and back", () => {
    fireEvent.click(corner());
    const first = announcement();
    act(() => {
      ref.current?.setSelection([{ row: [1, 1], column: [1, 1] }]);
    });
    // The region is not blanked on the way past. It does not need to be: a live
    // region speaks on a *change*, and the zero-width-space alternation already
    // guarantees consecutive announcements differ. Blanking would mean watching
    // the selection again, which is exactly what caused the spurious repeats.
    fireEvent.click(corner());
    expect(announcement()).toContain("All cells selected.");
    expect(announcement()).not.toBe(first);
  });

  it("stays silent through an unrelated update", () => {
    // `normalizeSelection` reassigns the range arrays on every call, so an
    // edit, a resize or a zoom hands back a new `luckysheet_select_save` for a
    // selection nobody touched. Keyed on that identity, this region announced
    // "All cells selected." again with nothing having happened — a spurious
    // announcement is its own 4.1.3 defect, not a harmless duplicate.
    fireEvent.click(corner());
    const afterSelectAll = announcement();
    expect(afterSelectAll).toContain("All cells selected.");
    act(() => {
      ref.current?.setCellValue(3, 3, "changed");
    });
    expect(announcement()).toBe(afterSelectAll);
    act(() => {
      ref.current?.setCellValue(4, 4, "changed again");
    });
    expect(announcement()).toBe(afterSelectAll);
  });

  it("says nothing for a whole-row selection that is not the whole sheet", () => {
    act(() => {
      ref.current?.setSelection([{ row: [1, 1], column: [0, 7] }]);
    });
    expect(announcement()).toBe("");
  });
});
