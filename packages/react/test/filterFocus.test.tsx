import { render, act, fireEvent, screen, within } from "@testing-library/react";
import React from "react";
import Workbook, { WorkbookInstance } from "../src/components/Workbook";

// WCAG 2.4.3. Creating a filter from a popup builds new controls in the grid and
// then closes the popup, so the only focus target left is whatever
// useEscapeToClose remembered on open — the toolbar control for the toolbar
// route, and nothing at all when the popup was opened without focusing its
// trigger. Both entry points therefore name the cell the filter was built
// around, which is also the only element the grid's own keyboard handling runs
// from.
//
// The criteria popup's own buttons are covered in filter-criterion-ui.test.tsx,
// which already drives that dropdown end to end.

const cell = (v: string) => ({ v: { v, m: v, ct: { fa: "General", t: "g" } } });
const celldata = ["Fruit", "Apple", "Banana", "Cherry"].map((v, r) => ({
  r,
  c: 0,
  ...cell(v),
}));

/** focusAfterCommit defers by a task, so let that task run. */
const flushFocus = async () => {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
};

const renderSheet = (extra: Record<string, unknown> = {}) => {
  const ref = React.createRef<WorkbookInstance>();
  const { container } = render(
    <Workbook
      ref={ref}
      lang="en"
      data={[
        { name: "Sheet1", id: "s1", celldata, row: 10, column: 6, ...extra },
      ]}
    />
  );
  return { container, ref };
};

const cellInput = (container: HTMLElement) =>
  container.querySelector<HTMLElement>("#luckysheet-rich-text-editor");

const funnels = (container: HTMLElement) =>
  container.querySelectorAll(".luckysheet-filter-options");

describe("focus after creating a filter from the toolbar", () => {
  const sortAndFilterArrow = (container: HTMLElement) =>
    Array.from(
      container.querySelectorAll<HTMLElement>(".fortune-toolbar-combo-arrow")
    ).find((c) =>
      (c.getAttribute("aria-label") || "").startsWith("Sort and filter")
    )!;

  /** Opens the Sort and filter dropdown by keyboard and activates one option. */
  const activateOption = (container: HTMLElement, text: string) => {
    const arrow = sortAndFilterArrow(container);
    act(() => {
      arrow.focus();
      fireEvent.keyDown(arrow, { key: "Enter" });
    });
    const option = within(
      container.querySelector<HTMLElement>(".fortune-toolbar-combo-popup")!
    )
      .getByText(text)
      .closest('[role="button"]') as HTMLElement;
    act(() => {
      option.focus();
      fireEvent.keyDown(option, { key: "Enter" });
    });
  };

  it("puts focus on the active cell, not back on the toolbar", async () => {
    const { container, ref } = renderSheet();
    act(() => {
      ref.current?.setSelection([{ row: [0, 0], column: [0, 0] }]);
    });

    activateOption(container, "create filter");
    await flushFocus();

    expect(funnels(container).length).toBeGreaterThan(0);
    expect(document.activeElement).toBe(cellInput(container));
  });

  it("leaves focus alone when create filter declines to act", async () => {
    // createFilter bails on a multi-range selection (also on a pivot table and a
    // read-only sheet). The menu closes either way, but a command that changed
    // nothing should not also relocate the user: focus stays where the popup's
    // own restore put it, on the control that opened the menu.
    const { container, ref } = renderSheet();
    act(() => {
      ref.current?.setSelection([
        { row: [0, 0], column: [0, 0] },
        { row: [2, 2], column: [0, 0] },
      ]);
    });

    const arrow = sortAndFilterArrow(container);
    activateOption(container, "create filter");
    await flushFocus();

    expect(funnels(container)).toHaveLength(0);
    expect(document.activeElement).toBe(arrow);
  });

  it("puts focus on the active cell after clearing the filter", async () => {
    const { container, ref } = renderSheet({
      filter_select: { row: [0, 3], column: [0, 0] },
      filter: {},
    });
    act(() => {
      ref.current?.setSelection([{ row: [0, 0], column: [0, 0] }]);
    });

    activateOption(container, "Clear filter");
    await flushFocus();

    expect(funnels(container)).toHaveLength(0);
    expect(document.activeElement).toBe(cellInput(container));
  });
});

describe("focus after creating a filter from the context menu", () => {
  it("keeps focus on the active cell", async () => {
    const { container, ref } = renderSheet();
    // The whole sheet, so that wherever the synthetic right-click lands maps
    // inside the selection — handleContextMenu only reads flowdata at the
    // clicked cell when the click is *outside* the current selection, and the
    // zero-sized rects jsdom reports make that lookup land out of bounds.
    act(() => {
      ref.current?.setSelection([{ row: [0, 9], column: [0, 5] }]);
    });
    act(() => {
      cellInput(container)!.focus();
    });

    // pageX/pageY rather than clientX/clientY: handleContextMenu reads the page
    // coordinates off the native event, and jsdom leaves them undefined, which
    // turns the cell lookup into a NaN binary search.
    const rightClick = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(rightClick, "pageX", { value: 5 });
    Object.defineProperty(rightClick, "pageY", { value: 5 });
    act(() => {
      container
        .querySelector<HTMLElement>(".fortune-cell-area")!
        .dispatchEvent(rightClick);
    });

    // "Create filter", not "Filter": the action is a toggle, and the row now
    // states which half it will do (WCAG 4.1.2). Nothing is filtered here.
    const filterItem = screen
      .getByText("Create filter")
      .closest('[role="button"]') as HTMLElement;
    act(() => {
      filterItem.focus();
      fireEvent.keyDown(filterItem, { key: "Enter" });
    });
    await flushFocus();

    expect(funnels(container).length).toBeGreaterThan(0);
    expect(document.activeElement).toBe(cellInput(container));
  });
});
