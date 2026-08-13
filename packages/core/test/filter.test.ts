import {
  getFilterColumnExtent,
  isColumnFilterActive,
  isFilterDropdownCell,
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

  it("spans the range's rows for the given column, 1-based", () => {
    // Rows 0-5 are announced as 1-6; column 2 is C.
    expect(getFilterColumnExtent(ctx, 2)).toEqual({ start: "C1", end: "C6" });
  });

  it("names the column asked for, not the range's first column", () => {
    expect(getFilterColumnExtent(ctx, 4)).toEqual({ start: "E1", end: "E6" });
  });

  it("converts column indexes past Z", () => {
    const wide = makeContext({
      filterOptions: { ...filterOptions, startCol: 0, endCol: 30 },
      filter: {},
    });
    expect(getFilterColumnExtent(wide, 26)?.start).toBe("AA1");
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
