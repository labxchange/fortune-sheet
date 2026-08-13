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
  celldata,
  row: 10,
  column: 8,
  filter_select: FILTER_SELECT,
  // Keyed relative to startCol: 0 === column C, 2 === column E. Column D (key 1)
  // sits between them inside the range with no criterion.
  filter: { 0: CRITERION, 2: CRITERION },
};

describe("filter announcements in #sr-selection", () => {
  let ref: React.RefObject<WorkbookInstance>;
  let container: HTMLElement;

  const announcement = () =>
    container.querySelector("#sr-selection")?.textContent ?? "";

  /** Move the focused cell and return what the live region now says. */
  const focusCell = (row: number, column: number) => {
    act(() => {
      // setSelection takes a Range (SingleRange[]), not a single range.
      ref.current?.setSelection([
        { row: [row, row], column: [column, column] },
      ]);
    });
    return announcement();
  };

  beforeEach(() => {
    ref = React.createRef<WorkbookInstance>();
    // lang mirrors the LabXchange wrapper, which hardcodes lang={"en"}.
    const view = render(<Workbook ref={ref} lang="en" data={[sheet as any]} />);
    container = view.container;
    // Establish the baseline outside the region so the first crossing is a
    // genuine transition rather than the initial auto-selection.
    focusCell(2, 0);
  });

  it("announces entering the filtered region once", () => {
    expect(focusCell(2, 2)).toContain(
      // Column 2 is C; the range spans rows 0-5, announced 1-based.
      "Entered filtered region: C. 1 through C. 6."
    );
  });

  it("does not repeat the announcement on the next cell inside", () => {
    focusCell(2, 2);
    const next = focusCell(3, 2);
    expect(next).not.toContain("Entered filtered region");
    expect(next).not.toContain("Left filtered region.");
  });

  it("announces the new column when moving between two filtered columns", () => {
    focusCell(2, 2);
    // Column 4 also has a criterion. Membership is per-column, so this is an
    // entry into E — not a silent move within one undifferentiated region.
    const acrossColumns = focusCell(2, 4);
    expect(acrossColumns).toContain(
      "Entered filtered region: E. 1 through E. 6."
    );
    // Still inside filtered data, so there is nothing to report as left.
    expect(acrossColumns).not.toContain("Left filtered region.");
  });

  it("stays silent moving down within one filtered column", () => {
    focusCell(2, 2);
    const sameColumn = focusCell(4, 2);
    expect(sameColumn).not.toContain("Entered filtered region");
    expect(sameColumn).not.toContain("Left filtered region.");
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
      "Entered filtered region: E. 1 through E. 6."
    );
  });

  it("announces the dropdown and active filter on a filtered header cell", () => {
    const header = focusCell(0, 2);
    expect(header).toContain("Has filter dropdown.");
    expect(header).toContain("Filter active.");
  });

  it("omits the active phrase on a header with no criterion", () => {
    const header = focusCell(0, 3);
    expect(header).toContain("Has filter dropdown.");
    expect(header).not.toContain("Filter active.");
  });

  it("does not announce a transition on first render", () => {
    const { container: fresh } = render(
      <Workbook lang="en" data={[sheet as any]} />
    );
    const text = fresh.querySelector("#sr-selection")?.textContent ?? "";
    expect(text).not.toContain("Entered filtered region");
    expect(text).not.toContain("Left filtered region.");
  });

  it("leaves cells outside the region unannotated", () => {
    const outside = focusCell(3, 0);
    expect(outside).not.toContain("filter");
    expect(outside).not.toContain("region");
  });
});
