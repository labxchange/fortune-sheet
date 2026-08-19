import { renderHook } from "@testing-library/react";
import { Context, locale } from "@fortune-sheet/core";
import { useFilterAnnouncements } from "../src/hooks/useFilterAnnouncements";

const { info } = locale({ lang: "en" } as unknown as Context);

// Filter over rows 0-5, columns 2-4, header on row 0. `filter` is keyed relative
// to startCol, so key 0 === column C and key 2 === column E; column D (key 1)
// sits between them inside the range with no criterion of its own.
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

const FILTER_OPTIONS = {
  startRow: 0,
  endRow: 5,
  startCol: 2,
  endCol: 4,
  left: 0,
  top: 0,
  width: 0,
  height: 0,
  items: [],
};

const SHEET1 = {
  id: "s1",
  filter_select: FILTER_SELECT,
  filter: { 0: CRITERION, 2: CRITERION },
};

// A sheet with no filter of its own.
const PLAIN_SHEET = { id: "s2" };

// A sheet whose filter covers a different range: rows 0-5, columns 0-2, with the
// only criterion on column A.
const SHEET3 = {
  id: "s3",
  filter_select: { row: [0, 5], column: [0, 2] },
  filter: { 0: { ...CRITERION, cindex: 0, stc: 0, edc: 2 } },
};
const SHEET3_OPTIONS = { ...FILTER_OPTIONS, startCol: 0, endCol: 2 };

type State = {
  sheetId?: string;
  row: number;
  column: number;
  /**
   * Omitted to model the window right after a sheet switch, when the mirrored
   * filter state has not been rebuilt yet and still describes the sheet the user
   * has left.
   */
  mirror?: { options: any; filter: any };
  rowhidden?: Record<string, number>;
};

/**
 * The hook reads a narrow slice of Context: the selection's focus, the mirrored
 * filter state, hidden rows, and the current sheet. Building that slice directly
 * exercises the crossing state machine without a mounted grid.
 */
function makeContext({
  sheetId = "s1",
  row,
  column,
  mirror = { options: FILTER_OPTIONS, filter: SHEET1.filter },
  rowhidden = {},
}: State): Context {
  return {
    currentSheetId: sheetId,
    luckysheetfile: [SHEET1, PLAIN_SHEET, SHEET3],
    luckysheet_select_save: [
      {
        row: [row, row],
        column: [column, column],
        row_focus: row,
        column_focus: column,
      },
    ],
    filterOptions: mirror.options,
    filter: mirror.filter,
    config: { rowhidden },
  } as unknown as Context;
}

/** Drive the hook through a sequence of states, returning it and a `move`. */
function driveFrom(initial: State) {
  const { result, rerender } = renderHook(
    ({ state }: { state: State }) =>
      useFilterAnnouncements(makeContext(state), info),
    { initialProps: { state: initial } }
  );
  return {
    result,
    move: (next: State) => {
      rerender({ state: next });
      return result.current.regionAnnouncement;
    },
  };
}

describe("useFilterAnnouncements crossings", () => {
  // Baseline outside the region, so the first move is a genuine transition
  // rather than the initial observation.
  const drive = () => driveFrom({ row: 2, column: 0 });

  it("announces entering a filtered column once", () => {
    // Row 0 is the header that carries the dropdown and is never hidden, so the
    // filtered data in column C runs C2:C6.
    expect(drive().move({ row: 2, column: 2 })).toContain(
      "Entered filtered region: C. 2 through C. 6."
    );
  });

  it("stays silent moving down within one filtered column", () => {
    const { move } = drive();
    const entered = move({ row: 2, column: 2 });
    expect(move({ row: 4, column: 2 })).toBe(entered);
  });

  it("announces the new column when moving between two filtered columns", () => {
    const { move } = drive();
    move({ row: 2, column: 2 });
    const across = move({ row: 2, column: 4 });
    // Membership is per-column, so this is an entry into E rather than a silent
    // move within one undifferentiated region.
    expect(across).toContain("Entered filtered region: E. 2 through E. 6.");
    expect(across).not.toContain("Left filtered region.");
  });

  it("announces leaving for an unfiltered column inside the range", () => {
    const { move } = drive();
    move({ row: 2, column: 2 });
    // Column D is inside the filter block but carries no criterion.
    expect(move({ row: 2, column: 3 })).toContain("Left filtered region.");
  });

  it("announces leaving the filtered region entirely", () => {
    const { move } = drive();
    move({ row: 2, column: 2 });
    expect(move({ row: 2, column: 0 })).toContain("Left filtered region.");
  });

  it("does not announce anything on the first observation", () => {
    // Content already present in a live region at first paint is not announced
    // anyway, and firing one on load is noise.
    const { result } = driveFrom({ row: 2, column: 2 });
    expect(result.current.regionAnnouncement).toBe("");
  });

  it("reports the extent of the rows a criterion leaves reachable", () => {
    const hidden = { 2: 0, 3: 0, 4: 0 };
    const { move } = driveFrom({ row: 2, column: 0, rowhidden: hidden });
    // Rows 2-4 hidden, so the data a user can reach in column C is C2 and C6.
    expect(move({ row: 1, column: 2, rowhidden: hidden })).toContain(
      "Entered filtered region: C. 2 through C. 6."
    );
    const narrower = { 2: 0, 3: 0, 4: 0, 5: 0 };
    const { move: move2 } = driveFrom({
      row: 2,
      column: 0,
      rowhidden: narrower,
    });
    expect(move2({ row: 1, column: 2, rowhidden: narrower })).toContain(
      "Entered filtered region: C. 2 through C. 2."
    );
  });

  it("re-announces a phrase the region already holds", () => {
    // A live region speaks on content change, so an identical string twice
    // running would be swallowed. The switch branches announce nothing, so
    // crossings do not reliably alternate: leaving a sheet and coming back to
    // the same filtered column reaches the same phrase with nothing in between.
    const { move } = drive();
    const entered = move({ row: 2, column: 2 });
    expect(entered).toContain("Entered filtered region: C. 2 through C. 6.");

    // Switch away — the region belonged to the sheet being left, so nothing is
    // announced and the phrase stays put.
    move({ sheetId: "s2", row: 2, column: 2 });
    const afterSwitch = move({
      sheetId: "s2",
      row: 2,
      column: 2,
      mirror: { options: undefined, filter: {} },
    });
    expect(afterSwitch).toBe(entered);

    // Switch back, cursor still in column C. The phrase is the same, so the
    // announcement has to differ some other way to be spoken at all.
    move({ sheetId: "s1", row: 2, column: 2, mirror: undefined });
    const back = move({ row: 2, column: 2 });
    expect(back).toContain("Entered filtered region: C. 2 through C. 6.");
    expect(back).not.toBe(afterSwitch);
    // The difference is inaudible: a zero-width space, no spoken word added.
    expect(back.replace(/\u200B/g, "")).toBe(
      afterSwitch.replace(/\u200B/g, "")
    );
  });

  it("announces arriving inside a filtered column on another sheet", () => {
    const { move } = drive();
    move({ row: 2, column: 2 });
    // The switch commits before the mirrored filter state is rebuilt; that
    // window still describes Sheet1, so the arrival is judged on the commit
    // after it rather than being consumed and erased in between.
    const stale = move({ sheetId: "s3", row: 2, column: 0 });
    expect(stale).toContain("Entered filtered region: C. 2");
    expect(
      move({
        sheetId: "s3",
        row: 2,
        column: 0,
        mirror: { options: SHEET3_OPTIONS, filter: SHEET3.filter },
      })
    ).toContain("Entered filtered region: A. 2 through A. 6.");
  });

  it("does not report leaving a region when switching away from it", () => {
    const { move } = drive();
    const entered = move({ row: 2, column: 2 });
    move({ sheetId: "s2", row: 2, column: 2 });
    // Sheet2 has no filter, so its mirrored state is empty. The user did not
    // leave the region — they left the sheet that had one.
    expect(
      move({
        sheetId: "s2",
        row: 2,
        column: 2,
        mirror: { options: undefined, filter: {} },
      })
    ).toBe(entered);
  });

  it("does not attribute one sheet's filter to another", () => {
    // While the mirror is stale nothing is reported, so a plain sheet never
    // borrows the previous sheet's dropdown.
    const { result, move } = drive();
    move({ sheetId: "s2", row: 0, column: 2 });
    expect(result.current.cellAnnouncement).toBe("");
  });
});

describe("useFilterAnnouncements cell state", () => {
  const cellAt = (row: number, column: number) =>
    renderHook(() => useFilterAnnouncements(makeContext({ row, column }), info))
      .result.current.cellAnnouncement;

  it("announces the dropdown and active filter on a filtered header cell", () => {
    expect(cellAt(0, 2)).toContain("Has filter dropdown.");
    expect(cellAt(0, 2)).toContain("Filter active.");
  });

  it("omits the active phrase on a header with no criterion", () => {
    expect(cellAt(0, 3)).toContain("Has filter dropdown.");
    expect(cellAt(0, 3)).not.toContain("Filter active.");
  });

  it("says nothing for data cells inside a filtered column", () => {
    // Repeating the filter state on every cell would make it noise; the
    // crossing announcement carries it once instead.
    expect(cellAt(2, 2)).toBe("");
  });

  it("says nothing for cells outside the filter range", () => {
    expect(cellAt(2, 0)).toBe("");
  });
});
