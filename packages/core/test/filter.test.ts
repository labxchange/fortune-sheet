import {
  getFilterColumnExtent,
  isColumnFilterActive,
  isFilterDropdownCell,
  isFilterStateCurrent,
  isInFilterRegion,
} from "../src/modules/filter";
import { Context } from "../src/context";

// These helpers only read `filter` and `filterOptions`, so a partial context is
// enough; the real Context is far too large to build in a unit test.
function makeContext(overrides: Partial<Context>): Context {
  return { filter: {}, ...overrides } as unknown as Context;
}

const filterOptions = {
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

const criterion = {
  caljs: {},
  rowhidden: {},
  optionstate: false,
  str: 0,
  edr: 5,
  cindex: 0,
  stc: 2,
  edc: 4,
};

describe("isColumnFilterActive", () => {
  it("returns false when no filter range exists", () => {
    const ctx = makeContext({ filter: { 0: criterion } });
    expect(isColumnFilterActive(ctx, 2)).toBe(false);
  });

  it("returns true for a column with an active criterion", () => {
    // ctx.filter is keyed relative to startCol, so key 0 === column 2.
    const ctx = makeContext({ filterOptions, filter: { 0: criterion } });
    expect(isColumnFilterActive(ctx, 2)).toBe(true);
  });

  it("returns false for a column inside the range with no criterion", () => {
    const ctx = makeContext({ filterOptions, filter: { 0: criterion } });
    expect(isColumnFilterActive(ctx, 3)).toBe(false);
    expect(isColumnFilterActive(ctx, 4)).toBe(false);
  });

  it("returns false for columns outside the filter range", () => {
    const ctx = makeContext({ filterOptions, filter: { 0: criterion } });
    expect(isColumnFilterActive(ctx, 1)).toBe(false);
    expect(isColumnFilterActive(ctx, 5)).toBe(false);
  });

  it("resolves the relative key rather than the absolute column index", () => {
    // Key 2 === column 4. Column 2 (key 0) must not report as filtered.
    const ctx = makeContext({ filterOptions, filter: { 2: criterion } });
    expect(isColumnFilterActive(ctx, 4)).toBe(true);
    expect(isColumnFilterActive(ctx, 2)).toBe(false);
  });

  it("returns false once the filter has been cleared", () => {
    const ctx = makeContext({ filterOptions, filter: {} });
    expect(isColumnFilterActive(ctx, 2)).toBe(false);
  });
});

describe("isInFilterRegion", () => {
  // Region is rows 0-5, columns 2-4.
  const ctx = makeContext({ filterOptions, filter: { 0: criterion } });

  it("returns false when no filter range exists", () => {
    expect(isInFilterRegion(makeContext({}), 2, 3)).toBe(false);
  });

  it("includes every corner of the range", () => {
    expect(isInFilterRegion(ctx, 0, 2)).toBe(true);
    expect(isInFilterRegion(ctx, 0, 4)).toBe(true);
    expect(isInFilterRegion(ctx, 5, 2)).toBe(true);
    expect(isInFilterRegion(ctx, 5, 4)).toBe(true);
  });

  it("excludes cells just outside each edge", () => {
    expect(isInFilterRegion(ctx, 0, 1)).toBe(false); // left of startCol
    expect(isInFilterRegion(ctx, 0, 5)).toBe(false); // right of endCol
    expect(isInFilterRegion(ctx, 6, 3)).toBe(false); // below endRow
  });

  it("does not depend on the column having a criterion", () => {
    // Column 3 has no entry in `filter`, but is still inside the region.
    expect(isColumnFilterActive(ctx, 3)).toBe(false);
    expect(isInFilterRegion(ctx, 2, 3)).toBe(true);
  });
});

describe("getFilterColumnExtent", () => {
  const ctx = makeContext({ filterOptions, filter: { 0: criterion } });

  it("returns null when no filter range exists", () => {
    expect(getFilterColumnExtent(makeContext({}), 2)).toBeNull();
  });

  it("spans the range's data rows for the given column, 1-based", () => {
    // Rows 0-5, announced 1-based; row 0 is the header that carries the
    // dropdown and is never hidden, so the data starts at row 1 === "2".
    expect(getFilterColumnExtent(ctx, 2)).toEqual({ start: "C2", end: "C6" });
  });

  it("names the column asked for, not the range's first column", () => {
    expect(getFilterColumnExtent(ctx, 4)).toEqual({ start: "E2", end: "E6" });
  });

  it("converts column indexes past Z", () => {
    const wide = makeContext({
      filterOptions: { ...filterOptions, startCol: 0, endCol: 30 },
      filter: {},
    });
    expect(getFilterColumnExtent(wide, 26)?.start).toBe("AA2");
  });

  it("returns null for a range with no data rows below the header", () => {
    // `createFilter` on a single cell yields row [r, r] — a header and nothing
    // to filter, so there is no extent to announce.
    const headerOnly = makeContext({
      filterOptions: { ...filterOptions, startRow: 3, endRow: 3 },
      filter: {},
    });
    expect(getFilterColumnExtent(headerOnly, 2)).toBeNull();
  });

  it("returns null for a column outside the filter range", () => {
    // Guards the helper itself rather than relying on every caller to check:
    // the bounds it would otherwise report belong to no filter at all.
    expect(getFilterColumnExtent(ctx, 1)).toBeNull();
    expect(getFilterColumnExtent(ctx, 5)).toBeNull();
  });

  it("keeps the endpoints when only middle rows are hidden", () => {
    // Rows 2-4 hidden but 1 and 5 survive, so the extent is unchanged. Asserted
    // separately from the clamping cases below, which move the endpoints — this
    // one passes with or without the clamp and is not evidence of it.
    const hidden = makeContext({
      filterOptions,
      filter: { 0: criterion },
      config: { rowhidden: { 2: 0, 3: 0, 4: 0 } },
    });
    expect(getFilterColumnExtent(hidden, 2)).toEqual({
      start: "C2",
      end: "C6",
    });
  });

  it("clamps both ends to the surviving rows", () => {
    const hidden = makeContext({
      filterOptions,
      filter: { 0: criterion },
      config: { rowhidden: { 1: 0, 2: 0, 5: 0 } },
    });
    expect(getFilterColumnExtent(hidden, 2)).toEqual({
      start: "C4",
      end: "C5",
    });
  });

  it("collapses to a single reference when one row survives", () => {
    const hidden = makeContext({
      filterOptions,
      filter: { 0: criterion },
      config: { rowhidden: { 2: 0, 3: 0, 4: 0, 5: 0 } },
    });
    expect(getFilterColumnExtent(hidden, 2)).toEqual({
      start: "C2",
      end: "C2",
    });
  });

  it("returns null when the criterion hides every data row", () => {
    const hidden = makeContext({
      filterOptions,
      filter: { 0: criterion },
      config: { rowhidden: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
    });
    expect(getFilterColumnExtent(hidden, 2)).toBeNull();
  });
});

describe("isFilterStateCurrent", () => {
  // `filterOptions` mirrors the active sheet's `filter_select`, so a sheet whose
  // own `filter_select` disagrees with it is one the mirror has not caught up to.
  const sheetWith = (
    filter_select: { row: number[]; column: number[] } | undefined,
    filter?: Record<string, any>
  ) => ({ id: "s1", filter_select, filter });

  it("is true when the range and criteria match the current sheet", () => {
    const ctx = makeContext({
      currentSheetId: "s1",
      luckysheetfile: [
        sheetWith({ row: [0, 5], column: [2, 4] }, { 0: criterion }),
      ] as any,
      filterOptions,
      filter: { 0: criterion },
    });
    expect(isFilterStateCurrent(ctx)).toBe(true);
  });

  it("is false while the mirror still holds another sheet's range", () => {
    const ctx = makeContext({
      currentSheetId: "s1",
      luckysheetfile: [sheetWith({ row: [0, 9], column: [0, 1] })] as any,
      filterOptions,
      filter: {},
    });
    expect(isFilterStateCurrent(ctx)).toBe(false);
  });

  it("is false when the ranges agree but the criteria do not", () => {
    // Two sheets can share an identical range, which the bounds alone cannot
    // tell apart — the criteria are what distinguish them.
    const ctx = makeContext({
      currentSheetId: "s1",
      luckysheetfile: [
        sheetWith({ row: [0, 5], column: [2, 4] }, { 2: criterion }),
      ] as any,
      filterOptions,
      filter: { 0: criterion },
    });
    expect(isFilterStateCurrent(ctx)).toBe(false);
  });

  it("is true for a sheet with no filter and no mirrored range", () => {
    const ctx = makeContext({
      currentSheetId: "s1",
      luckysheetfile: [sheetWith(undefined)] as any,
      filter: {},
    });
    expect(isFilterStateCurrent(ctx)).toBe(true);
  });

  it("is false when the sheet has no filter but the mirror still does", () => {
    const ctx = makeContext({
      currentSheetId: "s1",
      luckysheetfile: [sheetWith(undefined)] as any,
      filterOptions,
      filter: { 0: criterion },
    });
    expect(isFilterStateCurrent(ctx)).toBe(false);
  });

  it("is false when the current sheet cannot be resolved", () => {
    const ctx = makeContext({
      currentSheetId: "gone",
      luckysheetfile: [sheetWith(undefined)] as any,
      filter: {},
    });
    expect(isFilterStateCurrent(ctx)).toBe(false);
  });
});

describe("isFilterDropdownCell", () => {
  const ctx = makeContext({ filterOptions, filter: { 0: criterion } });

  it("returns false when no filter range exists", () => {
    expect(isFilterDropdownCell(makeContext({}), 0, 2)).toBe(false);
  });

  it("is true across the whole header row of the range", () => {
    expect(isFilterDropdownCell(ctx, 0, 2)).toBe(true);
    expect(isFilterDropdownCell(ctx, 0, 3)).toBe(true);
    expect(isFilterDropdownCell(ctx, 0, 4)).toBe(true);
  });

  it("is false for data rows below the header", () => {
    expect(isFilterDropdownCell(ctx, 1, 2)).toBe(false);
    expect(isFilterDropdownCell(ctx, 5, 2)).toBe(false);
  });

  it("is false for header-row cells outside the column range", () => {
    expect(isFilterDropdownCell(ctx, 0, 1)).toBe(false);
    expect(isFilterDropdownCell(ctx, 0, 5)).toBe(false);
  });
});
