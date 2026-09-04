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

  /** Presses a funnel; the click both opens and, pressed again, closes. */
  const pressFunnel = (columnOffset: number) =>
    act(() => {
      fireEvent.click(funnels()[columnOffset]);
    });

  /** Open a column's dropdown, toggle a value, and confirm. */
  const toggleValue = (columnOffset: number, value: string) => {
    pressFunnel(columnOffset);
    act(() => {
      fireEvent.click(screen.getByLabelText(value));
    });
    act(() => {
      fireEvent.click(screen.getByText("Confirm"));
    });
  };

  /** Values the open dropdown offers to filter on. */
  const offeredValues = (columnOffset: number) => {
    pressFunnel(columnOffset);
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
      expect(funnels().map((f) => f.getAttribute("aria-haspopup"))).toEqual([
        "menu",
        "menu",
      ]);
      // Not "Filter for column C.": a row of funnels named by letter is far
      // less use by ear than one named by the header the user reads.
      expect(funnels().map((f) => f.getAttribute("aria-label"))).toEqual([
        "Filter Fruit.",
        "Filter Color.",
      ]);
    });

    it("carries the criterion state, not just the column", () => {
      toggleValue(0, "Banana");
      expect(funnels()[0].getAttribute("aria-label")).toBe(
        "Filter Fruit. Filter active."
      );
      expect(funnels()[1].getAttribute("aria-label")).toBe("Filter Color.");
    });

    it("falls back to the column letter when the header cell is blank", () => {
      // Row 1 of column D holds "Color"; clearing it leaves the funnel with no
      // header text to borrow.
      act(() => {
        ref.current?.setCellValue(0, 3, "");
      });
      expect(funnels()[1].getAttribute("aria-label")).toBe(
        "Filter for column D."
      );
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

    it("closes the popup it opened when pressed again", () => {
      // aria-expanded below is only honest if the trigger can collapse. It used
      // to swallow the second press: showFilterContextMenu bailed when that
      // column's popup was already open, so the button reported "expanded" and
      // could do nothing about it.
      pressFunnel(0);
      expect(popup()).not.toBeNull();
      pressFunnel(0);
      expect(popup()).toBeNull();
    });

    it("moves the popup to the other column rather than closing it", () => {
      pressFunnel(0);
      pressFunnel(1);
      expect(popup()).not.toBeNull();
      expect(funnels().map((f) => f.getAttribute("aria-expanded"))).toEqual([
        "false",
        "true",
      ]);
    });

    it("reports its expanded state and points at the popup only while open", () => {
      expect(funnels().map((f) => f.getAttribute("aria-expanded"))).toEqual([
        "false",
        "false",
      ]);
      expect(funnels()[0].getAttribute("aria-controls")).toBeNull();

      pressFunnel(0);
      expect(funnels()[0].getAttribute("aria-expanded")).toBe("true");
      // The popup is rendered only while open, so a permanent reference would
      // dangle; and it has to resolve, which the id it used to carry — the
      // literal string "luckysheet-\\${menuid}-menu" — did not.
      const controls = funnels()[0].getAttribute("aria-controls");
      expect(controls).toBe("fortune-filter-menu");
      expect(document.getElementById(controls!)).toBe(popup());
    });

    it("lands on the cell after a criterion is applied, and the funnel reopens from there", async () => {
      // Confirming used to put focus back on the funnel. Ticket 1217709848562415
      // rejected that: the funnels are a row of adjacent tab stops, so landing on
      // one leaves a keyboard user tabbing sideways along the header instead of
      // back in their data. Focus goes to the cell, and the funnel stays
      // reachable from there.
      focus(0, 2);
      toggleValue(0, "Banana");
      await act(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      });
      expect(document.activeElement).toBe(
        container.querySelector("#luckysheet-rich-text-editor")
      );

      act(() => {
        fireEvent.keyDown(funnels()[0], { key: "Enter" });
      });
      expect(popup()).not.toBeNull();
    });
  });

  // WCAG 2.4.3, and ticket 1217709848562415: every route out of the popup —
  // Confirm, Cancel, Clear filter, Escape, an outside click, focus-out — puts
  // focus on the cell the popup was opened from. It used to come back to the
  // funnel button, which the audit rejected: the funnels are a row of adjacent
  // tab stops, so a keyboard user who closed the popup was left tabbing sideways
  // between filter buttons and had to traverse the header to get back to the
  // data. The funnels are never focused by hand in these tests: `fireEvent.click`
  // does not move focus, so anything but <body> at the end is focus this code
  // placed.
  describe("focus once the filter popup closes", () => {
    const cellInput = () =>
      container.querySelector<HTMLElement>("#luckysheet-rich-text-editor");

    const popup = () => container.querySelector(".fortune-filter-menu");

    /** focusAfterCommit defers by a task, so let that task run. */
    const flushFocus = async () => {
      await act(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      });
    };

    const clickButton = (text: string) =>
      act(() => {
        fireEvent.click(screen.getByText(text));
      });

    it("returns focus to the cell when a criterion is confirmed", async () => {
      focus(0, 2);
      pressFunnel(0);
      act(() => {
        fireEvent.click(screen.getByLabelText("Banana"));
      });
      clickButton("Confirm");
      await flushFocus();
      expect(document.activeElement).toBe(cellInput());
    });

    it("returns focus to the cell regardless of which column was filtered", async () => {
      // Previously asserted that the *funnel of that column* took focus, which
      // is what changed. The cell is the target now, so filtering a non-first
      // column must not leave focus on any funnel.
      focus(0, 3);
      pressFunnel(1);
      act(() => {
        fireEvent.click(screen.getByLabelText("Yellow"));
      });
      clickButton("Confirm");
      await flushFocus();
      expect(document.activeElement).toBe(cellInput());
      expect(funnels()).not.toContain(document.activeElement);
    });

    it("returns focus to the cell when the popup is cancelled", async () => {
      focus(0, 2);
      pressFunnel(0);
      clickButton("Cancel");
      await flushFocus();
      expect(document.activeElement).toBe(cellInput());
    });

    it("still reaches the cell when the funnel is hidden behind a frozen pane", async () => {
      // This case existed because the old restore aimed at the funnel and a
      // funnel rendered `display: none` cannot take focus, so it needed a
      // fallback. The target is the cell unconditionally now, which makes the
      // case trivially true — kept as a regression guard, since aiming at the
      // funnel again would reintroduce exactly this hole.
      focus(0, 2);
      pressFunnel(0);
      funnels()[0].setAttribute("style", "display: none");
      clickButton("Confirm");
      await flushFocus();
      expect(document.activeElement).toBe(cellInput());
    });

    // The three dismissal routes, which the footer cases above do not reach.
    // They split: two must restore focus, one must leave it alone, and the
    // difference is only knowable after the DOM settles — see
    // `restoreFocusIfLost` in FilterMenu.
    it("returns focus to the cell when Escape closes the popup", async () => {
      focus(0, 2);
      pressFunnel(0);
      act(() => {
        fireEvent.keyDown(document, { key: "Escape" });
      });
      await flushFocus();
      expect(popup()).toBeNull();
      expect(document.activeElement).toBe(cellInput());
    });

    it("returns focus to the cell when a press on dead chrome closes it", async () => {
      // The case a per-route `close(restore)` would strand: a mousedown on
      // non-focusable chrome moves focus nowhere, so the popup unmounts from
      // under whatever held it and focus falls to <body> unless something
      // rescues it. Indistinguishable from a press on a real control at the
      // call site, which is why the decision is deferred instead.
      focus(0, 2);
      pressFunnel(0);
      const deadChrome = container.querySelector<HTMLElement>(
        ".fortune-name-box-container"
      )!;
      act(() => {
        fireEvent.mouseDown(deadChrome, { bubbles: true });
      });
      await flushFocus();
      expect(popup()).toBeNull();
      expect(document.activeElement).toBe(cellInput());
    });

    it("leaves focus where the user tabbed when focus-out closes it", async () => {
      // The inverse, and the regression this pair guards: restoring here would
      // pull focus off the control the user just reached and throw it backwards
      // onto the cell, silently swallowing their Tab.
      focus(0, 2);
      pressFunnel(0);
      const row = popup()!.querySelector<HTMLElement>('[role="button"]')!;
      const outside = container.querySelector<HTMLElement>(
        ".fortune-toolbar [role='button']"
      )!;
      act(() => {
        outside.focus();
        fireEvent.focusOut(row, { relatedTarget: outside });
      });
      await flushFocus();
      expect(popup()).toBeNull();
      expect(document.activeElement).toBe(outside);
    });

    it("moves focus to the active cell when Clear filter removes every funnel", async () => {
      // The reported bug: clearing unmounts the funnel that focus would be
      // restored to, so the restore was skipped and focus fell to <body>,
      // stranding keyboard and screen-reader users outside the spreadsheet.
      focus(0, 2);
      toggleValue(0, "Banana");
      pressFunnel(0);
      clickButton("Clear filter");
      await flushFocus();
      expect(funnels()).toHaveLength(0);
      expect(document.activeElement).toBe(cellInput());
    });
  });
});

// A header whose text lives in `ct.s` segments rather than in `m`: seeded in
// celldata rather than written through setCellValue, which fills `m` in and so
// cannot reproduce the case.
describe("a funnel over a header with mixed inline formatting", () => {
  const inlineHeader = {
    name: "Sheet1",
    id: "s1",
    row: 10,
    column: 8,
    celldata: [
      {
        r: 0,
        c: 2,
        v: {
          ct: {
            fa: "General",
            t: "inlineStr",
            s: [
              { ff: "Arial", bl: 1, v: "Fr" },
              { ff: "Arial", bl: 0, v: "uit" },
            ],
          },
        },
      },
      { r: 1, c: 2, ...cell("Apple") },
      { r: 2, c: 2, ...cell("Banana") },
    ],
    filter_select: { row: [0, 2], column: [2, 2] },
    filter: {},
  };

  it("is named from the segments, not by its column letter", () => {
    const { container } = render(
      <Workbook lang="en" data={[inlineHeader as any]} />
    );
    const funnel = container.querySelector(".luckysheet-filter-options")!;
    expect(funnel.getAttribute("aria-label")).toBe("Filter Fruit.");
  });
});
