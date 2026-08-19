import { render, act, fireEvent, screen } from "@testing-library/react";
import React from "react";
import Workbook, { WorkbookInstance } from "../src/components/Workbook";

// Drives the real filter dropdown — `FilterOption`'s funnel button, the value
// checkboxes, and Confirm — rather than seeding `config.rowhidden` by hand, so
// the announcements are checked against rows an actual criterion hid.

const cell = (v: string) => ({ v: { v, m: v, ct: { fa: "General", t: "g" } } });
const fruit = ["Fruit", "Apple", "Banana", "Apple", "Cherry", "Banana"];
const color = ["Color", "Red", "Yellow", "Green", "Red", "Yellow"];

const celldata: any[] = [];
for (let r = 0; r <= 5; r += 1) {
  celldata.push({ r, c: 0, ...cell(`a${r}`) }); // column A, outside the range
  celldata.push({ r, c: 2, ...cell(fruit[r]) }); // column C
  celldata.push({ r, c: 3, ...cell(color[r]) }); // column D
}

// Filter range C1:D6, header on row 1, and no criterion applied yet.
const sheet = {
  name: "Sheet1",
  id: "s1",
  celldata,
  row: 10,
  column: 8,
  filter_select: { row: [0, 5], column: [2, 3] },
  filter: {},
};

describe("filter criteria applied through the dropdown", () => {
  let ref: React.RefObject<WorkbookInstance>;
  let container: HTMLElement;

  const region = () =>
    container.querySelector("#sr-filterRegion")?.textContent ?? "";
  const selection = () =>
    container.querySelector("#sr-selection")?.textContent ?? "";

  /** 0-based, as the selection API takes them. Row 1 === spreadsheet row 2. */
  const focus = (row: number, column: number) =>
    act(() => {
      ref.current?.setSelection([
        { row: [row, row], column: [column, column] },
      ]);
    });

  const funnels = () =>
    Array.from(container.querySelectorAll(".luckysheet-filter-options"));
  const isActive = () =>
    funnels().map((f) =>
      f.className.includes("luckysheet-filter-options-active")
    );

  /** Open a column's dropdown, toggle a value, and confirm. */
  const toggleValue = (columnOffset: number, value: string) => {
    act(() => {
      fireEvent.click(funnels()[columnOffset]);
    });
    act(() => {
      fireEvent.click(screen.getByLabelText(value));
    });
    act(() => {
      fireEvent.click(screen.getByText("Confirm"));
    });
  };

  /** Values the open dropdown offers to filter on. */
  const offeredValues = (columnOffset: number) => {
    act(() => {
      fireEvent.click(funnels()[columnOffset]);
    });
    return Array.from(container.querySelectorAll("input.filter-checkbox")).map(
      (i) => i.getAttribute("aria-label")
    );
  };

  beforeEach(() => {
    ref = React.createRef<WorkbookInstance>();
    container = render(
      <Workbook ref={ref} lang="en" data={[sheet as any]} />
    ).container;
  });

  it("puts a dropdown on every column of the filter range", () => {
    expect(funnels()).toHaveLength(2);
    expect(isActive()).toEqual([false, false]);
  });

  it("stays silent entering a column that has a dropdown but no criterion", () => {
    // A dropdown alone is not a filtered region: there is no filtered subset to
    // describe until a criterion hides something. The header cell still reports
    // the dropdown, without "Filter active."
    focus(2, 0);
    focus(2, 2);
    expect(region()).toBe("");
    focus(0, 2);
    expect(selection()).toContain("Has filter dropdown.");
    expect(selection()).not.toContain("Filter active.");
  });

  it("announces the criterion on the header cell once applied", () => {
    toggleValue(0, "Banana");
    expect(isActive()).toEqual([true, false]);
    focus(0, 2);
    expect(selection()).toContain("Has filter dropdown.");
    expect(selection()).toContain("Filter active.");
  });

  it("clamps the announced extent to the rows the criterion leaves visible", () => {
    // Unchecking "Banana" hides spreadsheet rows 3 and 6, leaving 2, 4 and 5 —
    // so the extent ends at row 5, not at the range's row 6.
    toggleValue(0, "Banana");
    focus(2, 0);
    focus(1, 2);
    expect(region()).toContain("Entered filtered region: C. 2 through C. 5.");
  });

  it("keeps criteria on two columns at once", () => {
    toggleValue(0, "Banana");
    // Column D's dropdown offers only values from rows C's criterion left
    // visible — rows 2, 4 and 5, so Red and Green but not Yellow.
    expect(offeredValues(1)).toEqual(["Red", "Green"]);
    act(() => {
      fireEvent.click(screen.getByLabelText("Green"));
    });
    act(() => {
      fireEvent.click(screen.getByText("Confirm"));
    });
    expect(isActive()).toEqual([true, true]);

    focus(0, 3);
    expect(selection()).toContain("Filter active.");
    focus(2, 0);
    focus(1, 3);
    expect(region()).toContain("Entered filtered region: D. 2 through D. 5.");
  });

  it("drops the criterion when the dropdown is confirmed with nothing hidden", () => {
    // `FilterMenu` passes `optionState = hiddenRows.length > 0`, and
    // `labelFilterOptionState` deletes the entry when that is false — so
    // re-checking the only unchecked value removes the filter rather than
    // widening it, and the column stops counting as filtered.
    toggleValue(0, "Banana");
    expect(isActive()).toEqual([true, false]);
    toggleValue(0, "Banana");
    expect(isActive()).toEqual([false, false]);
    focus(0, 2);
    expect(selection()).not.toContain("Filter active.");
  });
});
