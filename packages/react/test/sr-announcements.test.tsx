import { render, act } from "@testing-library/react";
import React from "react";
import Workbook, { WorkbookInstance } from "../src/components/Workbook";

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
   * Region crossings, which live in their own alert region: they are one-off
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

  it("announces entering the filtered region once", () => {
    expect(focusCell(2, 2)).toContain(
      // Column 2 is C. Row 0 is the header that carries the dropdown and is
      // never hidden, so the filtered data runs C2:C6.
      "Entered filtered region: C. 2 through C. 6."
    );
  });

  it("does not repeat the announcement on the next cell inside", () => {
    // The region keeps the phrase it already holds; role="alert" speaks on
    // content change, so leaving it in place says nothing a second time — and
    // unlike clearing it, cannot erase a phrase still being read.
    const entered = focusCell(2, 2);
    expect(focusCell(3, 2)).toBe(entered);
  });

  it("announces the new column when moving between two filtered columns", () => {
    focusCell(2, 2);
    // Column 4 also has a criterion. Membership is per-column, so this is an
    // entry into E — not a silent move within one undifferentiated region.
    const acrossColumns = focusCell(2, 4);
    expect(acrossColumns).toContain(
      "Entered filtered region: E. 2 through E. 6."
    );
    // Still inside filtered data, so there is nothing to report as left.
    expect(acrossColumns).not.toContain("Left filtered region.");
  });

  it("stays silent moving down within one filtered column", () => {
    const entered = focusCell(2, 2);
    expect(focusCell(4, 2)).toBe(entered);
  });

  it("announces leaving when moving to an unfiltered column in the range", () => {
    focusCell(2, 2);
    // Column 3 is inside the filter block but has no criterion — an exit, since
    // membership is per-column rather than per-block.
    expect(focusCell(2, 3)).toContain("Left filtered region.");
  });

  it("announces leaving the filtered region entirely", () => {
    focusCell(2, 2);
    expect(focusCell(2, 0)).toContain("Left filtered region.");
  });

  it("names the entered column in the extent", () => {
    focusCell(2, 0);
    // Entering at column 4 (E) announces E's extent, not the range's first column.
    expect(focusCell(2, 4)).toContain(
      "Entered filtered region: E. 2 through E. 6."
    );
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

  it("announces the dropdown and active filter on a filtered header cell", () => {
    focusCell(0, 2);
    expect(cellAnnouncement()).toContain("Has filter dropdown.");
    expect(cellAnnouncement()).toContain("Filter active.");
  });

  it("omits the active phrase on a header with no criterion", () => {
    focusCell(0, 3);
    expect(cellAnnouncement()).toContain("Has filter dropdown.");
    expect(cellAnnouncement()).not.toContain("Filter active.");
  });

  it("does not announce a transition on first render", () => {
    const { container: fresh } = render(
      <Workbook lang="en" data={[sheet as any]} />
    );
    const text = fresh.querySelector("#sr-filterRegion")?.textContent ?? "";
    expect(text).toBe("");
  });

  it("leaves cells outside the region unannotated", () => {
    // Baseline is already outside, so no crossing has ever been announced.
    focusCell(3, 0);
    expect(cellAnnouncement()).not.toContain("filter");
    expect(regionAnnouncement()).toBe("");
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
});
