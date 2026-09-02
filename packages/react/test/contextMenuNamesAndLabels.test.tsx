import React from "react";
import { render, screen } from "@testing-library/react";
import { defaultContext, defaultSettings, Context } from "@fortune-sheet/core";
import WorkbookContext from "../src/context";
import { ModalProvider } from "../src/context/modal";
import ContextMenu from "../src/components/ContextMenu";

// Two audit findings on the context menu's static markup:
//
//  * the numeric inputs (insert column/row, row height, column width) carried
//    only a `placeholder` — a last-resort fallback for the accessible name, and
//    reported by axe (WCAG 3.3.2, 4.1.2). The ticket named insert-column; the
//    other three are the identical defect.
//  * the filter row read "Filter" whether it would create or remove one, so the
//    user could not tell which (WCAG 4.1.2).
//
// The menu takes its items from `settings.cellContextMenu`, so each case can ask
// for just the rows it needs rather than right-clicking a grid jsdom never lays
// out.

const makeRefs = () => ({
  globalCache: { undoList: [], redoList: [] },
  cellInput: React.createRef<HTMLDivElement | null>(),
  fxInput: React.createRef<HTMLDivElement | null>(),
  canvas: React.createRef<HTMLCanvasElement | null>(),
  scrollbarX: React.createRef<HTMLDivElement | null>(),
  scrollbarY: React.createRef<HTMLDivElement | null>(),
  cellArea: React.createRef<HTMLDivElement | null>(),
  workbookContainer: React.createRef<HTMLDivElement | null>(),
});

type Options = {
  items: string[];
  filterApplied?: boolean;
  /** set-column-width renders only for a column-header selection. */
  columnSelect?: boolean;
  /** set-row-height renders only for a row-header selection. */
  rowSelect?: boolean;
};

const renderMenu = ({
  items,
  filterApplied,
  columnSelect,
  rowSelect,
}: Options) => {
  const ctx = defaultContext(makeRefs() as any) as Context;
  ctx.currentSheetId = "sheet-1";
  ctx.luckysheetfile = [
    { id: "sheet-1", name: "Sheet1", data: [[{ v: "a" }, { v: "b" }]] },
  ] as any;
  ctx.luckysheet_select_save = [
    {
      row: [0, 1],
      column: [0, 1],
      // set-row-height / set-column-width each render only for their own kind
      // of header selection, and insert-column is suppressed by row_select.
      row_select: !!rowSelect,
      column_select: !!columnSelect,
    },
  ] as any;
  // Non-empty, or the component returns null.
  ctx.contextMenu = { x: 0, y: 0 } as any;
  if (filterApplied) {
    ctx.luckysheet_filter_save = { row: [0, 1], column: [0, 1] } as any;
  }

  const value = {
    context: ctx,
    setContext: () => {},
    settings: { ...defaultSettings, cellContextMenu: items },
    refs: makeRefs() as any,
    handleUndo: () => {},
    handleRedo: () => {},
  };

  return render(
    <WorkbookContext.Provider value={value as any}>
      <ModalProvider>
        <ContextMenu />
      </ModalProvider>
    </WorkbookContext.Provider>
  );
};

describe("context menu input accessible names", () => {
  it("names the insert-column inputs and distinguishes the two directions", () => {
    const { container } = renderMenu({ items: ["insert-column"] });

    // Both rows render from one `.map`, so a single shared name would leave two
    // different controls announcing identically. The direction word is what
    // separates them.
    const inputs = Array.from(container.querySelectorAll("input"));
    expect(inputs).toHaveLength(2);
    const names = inputs.map((el) => el.getAttribute("aria-label"));
    expect(names[0]).toMatch(/Number of columns to insert/);
    expect(names[1]).toMatch(/Number of columns to insert/);
    expect(names[0]).not.toBe(names[1]);
  });

  it("names the insert-row inputs and distinguishes the two directions", () => {
    const { container } = renderMenu({ items: ["insert-row"] });

    const inputs = Array.from(container.querySelectorAll("input"));
    expect(inputs).toHaveLength(2);
    const names = inputs.map((el) => el.getAttribute("aria-label"));
    expect(names[0]).toMatch(/Number of rows to insert/);
    expect(names[1]).not.toBe(names[0]);
  });

  it("names the row-height input", () => {
    // `{row}{height}` renders as two adjacent words with no separator, so the
    // name states the unit instead of being assembled from the fragments.
    renderMenu({ items: ["set-row-height"], rowSelect: true });
    expect(screen.getByRole("spinbutton", { name: /Row height/ })).toBeTruthy();
  });

  it("names the column-width input", () => {
    renderMenu({ items: ["set-column-width"], columnSelect: true });
    expect(
      screen.getByRole("spinbutton", { name: /Column width/ })
    ).toBeTruthy();
  });

  it("does not rely on placeholder for the name", () => {
    const { container } = renderMenu({ items: ["insert-column"] });
    const input = container.querySelector("input")!;

    // The placeholder stays as a visual affordance; what changed is that it is
    // no longer the only thing naming the control.
    expect(input.getAttribute("placeholder")).toBe("Number");
    expect(input.getAttribute("aria-label")).not.toBe("Number");
  });

  it("keeps the guards that stop a keypress activating the row", () => {
    // activateOnEnterOrSpace on the row would otherwise submit while the user
    // is still typing a count; adding a name must not disturb it.
    const { container } = renderMenu({ items: ["insert-column"] });
    const input = container.querySelector("input")!;
    expect(input.tabIndex).toBe(0);
    expect(input.classList.contains("luckysheet-mousedown-cancel")).toBe(true);
  });
});

describe("context menu filter row label", () => {
  it("offers to create a filter when none is applied", () => {
    renderMenu({ items: ["filter"] });

    const row = screen.getByRole("button", { name: "Create filter" });
    // Visible text and accessible name are the same string: no aria-label to
    // drift from what is on screen (WCAG 2.5.3).
    expect(row.getAttribute("aria-label")).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove filter" })).toBeNull();
  });

  it("offers to remove the filter when one is applied", () => {
    renderMenu({ items: ["filter"], filterApplied: true });

    const row = screen.getByRole("button", { name: "Remove filter" });
    expect(row.getAttribute("aria-label")).toBeNull();
    expect(screen.queryByRole("button", { name: "Create filter" })).toBeNull();
  });

  it("no longer labels the row with the state-blind string", () => {
    // This row was `rightclick.filterSelection`'s only reader, so the key is now
    // unused in `packages/` — the toolbar's filter button renders `filter.filter`
    // (`Toolbar/index.tsx`), not this one. It stays in the six locale files
    // regardless: they are the fork's public string table, a consumer may read
    // it, and deleting a translated key to save six lines is not worth the
    // breakage. The guard is that this row stopped rendering it.
    renderMenu({ items: ["filter"] });
    expect(screen.queryByText("Filter")).toBeNull();
  });
});
