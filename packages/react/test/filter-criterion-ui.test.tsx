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

  // WCAG 2.1.1 and 4.1.2. The funnel is reachable by Tab — the grid's key
  // handling is scoped away from focusable controls inside the grid — so it has
  // to be operable and named once focus lands on it, which the focus work below
  // makes routine rather than incidental.
  describe("the funnel as a keyboard control", () => {
    const popup = () => container.querySelector(".fortune-filter-menu");

    it("is a button named after the column's header cell", () => {
      expect(funnels().map((f) => f.getAttribute("role"))).toEqual([
        "button",
        "button",
      ]);
      // Not "Filter column C": a row of funnels named by letter is far less
      // use by ear than one named by the header the user reads.
      expect(funnels().map((f) => f.getAttribute("aria-label"))).toEqual([
        "Filter Fruit",
        "Filter Color",
      ]);
    });

    it("falls back to the column letter when the header cell is blank", () => {
      // Row 1 of column D holds "Color"; clearing it leaves the funnel with no
      // header text to borrow.
      act(() => {
        ref.current?.setCellValue(0, 3, "");
      });
      expect(funnels()[1].getAttribute("aria-label")).toBe("Filter column D");
    });

    it("opens the dropdown on Enter and on Space", () => {
      ["Enter", " "].forEach((key) => {
        expect(popup()).toBeNull();
        act(() => {
          fireEvent.keyDown(funnels()[0], { key });
        });
        expect(popup()).not.toBeNull();
        act(() => {
          fireEvent.keyDown(document.activeElement!, { key: "Escape" });
        });
      });
    });

    it("reopens from the funnel focus is returned to after a criterion is applied", async () => {
      // The pair the ticket cares about: confirming a criterion puts focus back
      // on the funnel, and from there the keyboard has to be able to get into
      // the dropdown again without a mouse.
      focus(0, 2);
      toggleValue(0, "Banana");
      await act(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      });
      expect(document.activeElement).toBe(funnels()[0]);

      act(() => {
        fireEvent.keyDown(document.activeElement!, { key: "Enter" });
      });
      expect(popup()).not.toBeNull();
    });
  });

  // WCAG 2.4.3. Every button here closes the popup, and the funnels are rebuilt
  // (or removed) by the same action — so the focus restore in useEscapeToClose
  // cannot be relied on, and each button names its own target instead. The
  // funnels are never focused by hand in these tests: `fireEvent.click` does not
  // move focus, so anything but <body> at the end is focus this code placed.
  describe("focus once the filter popup closes", () => {
    const cellInput = () =>
      container.querySelector<HTMLElement>("#luckysheet-rich-text-editor");

    /** focusAfterCommit defers by a task, so let that task run. */
    const flushFocus = async () => {
      await act(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      });
    };

    const openFunnel = (columnOffset: number) =>
      act(() => {
        fireEvent.click(funnels()[columnOffset]);
      });

    const clickButton = (text: string) =>
      act(() => {
        fireEvent.click(screen.getByText(text));
      });

    it("returns focus to the funnel it was opened from when a criterion is confirmed", async () => {
      focus(0, 2);
      openFunnel(0);
      act(() => {
        fireEvent.click(screen.getByLabelText("Banana"));
      });
      clickButton("Confirm");
      await flushFocus();
      // Re-queried, because confirming rebuilds the funnel list.
      expect(document.activeElement).toBe(funnels()[0]);
    });

    it("returns focus to the funnel of the column that was filtered, not the first one", async () => {
      focus(0, 3);
      openFunnel(1);
      act(() => {
        fireEvent.click(screen.getByLabelText("Yellow"));
      });
      clickButton("Confirm");
      await flushFocus();
      expect(document.activeElement).toBe(funnels()[1]);
      // The funnel is addressed by absolute column index rather than by its
      // position in the list, which the frozen-pane handling can reorder.
      expect(document.activeElement?.getAttribute("data-filter-col")).toBe("3");
    });

    it("returns focus to the funnel when the popup is cancelled", async () => {
      focus(0, 2);
      openFunnel(0);
      clickButton("Cancel");
      await flushFocus();
      expect(document.activeElement).toBe(funnels()[0]);
    });

    it("moves focus to the active cell when Clear filter removes every funnel", async () => {
      // The reported bug: clearing unmounts the funnel that focus would be
      // restored to, so the restore was skipped and focus fell to <body>,
      // stranding keyboard and screen-reader users outside the spreadsheet.
      focus(0, 2);
      toggleValue(0, "Banana");
      openFunnel(0);
      clickButton("Clear filter");
      await flushFocus();
      expect(funnels()).toHaveLength(0);
      expect(document.activeElement).toBe(cellInput());
    });
  });
});
