import {
  render,
  fireEvent,
  waitFor,
  act,
  screen,
} from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";

// WCAG 2.1.1. Activating "Filter by color" displayed the submenu but left focus
// on the trigger, so a keyboard user could see the options and never reach them.
// The submenu was also anonymous in the accessibility tree: no id, no role, and
// nothing on the trigger tying the two together.

const text = (v: string) => ({ v, m: v, ct: { fa: "General", t: "s" } });

// The colour list only renders when a column has more than one background —
// with fewer, the submenu shows a tip instead and has no rows to focus.
const dataWithColors = [
  {
    name: "Sheet1",
    celldata: [
      { r: 0, c: 0, v: text("Name") },
      { r: 1, c: 0, v: { ...text("a"), bg: "#ff0000" } },
      { r: 2, c: 0, v: { ...text("b"), bg: "#00ff00" } },
      { r: 3, c: 0, v: { ...text("c"), bg: "#0000ff" } },
    ],
    filter_select: { row: [0, 3], column: [0, 0] },
  },
];

const SUBMENU_ID = "fortune-filter-bycolor-submenu";

const funnels = () =>
  Array.from(
    document.querySelectorAll<HTMLElement>(".luckysheet-filter-options")
  );

/** Open the filter dropdown for column A from the keyboard. */
const openFilterMenu = async () => {
  render(<Workbook lang="en" data={dataWithColors} />);
  await waitFor(() => expect(funnels().length).toBeGreaterThan(0));
  const [first] = funnels();
  act(() => {
    first.focus();
    fireEvent.keyDown(first, { key: "Enter" });
  });
  await waitFor(() => screen.getByText("Filter by color"));
};

const trigger = () =>
  screen.getByText("Filter by color").closest('[role="button"]') as HTMLElement;

const submenu = () => document.getElementById(SUBMENU_ID);

const colorRows = () =>
  Array.from(
    submenu()?.querySelectorAll<HTMLElement>('[role="checkbox"]') ?? []
  );

describe("Filter by color submenu", () => {
  it("ties the trigger to the submenu it discloses", async () => {
    await openFilterMenu();

    // Closed to begin with, and the relationship is declared before the submenu
    // exists — aria-controls may name an element that is not in the DOM yet.
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(trigger().getAttribute("aria-controls")).toBe(SUBMENU_ID);
  });

  it("reflects the open state on the trigger", async () => {
    await openFilterMenu();

    act(() => {
      trigger().focus();
      fireEvent.keyDown(trigger(), { key: "Enter" });
    });

    await waitFor(() => expect(submenu()).not.toBeNull());
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
  });

  it("exposes the submenu as a named group", async () => {
    await openFilterMenu();
    act(() => {
      trigger().focus();
      fireEvent.keyDown(trigger(), { key: "Enter" });
    });
    await waitFor(() => expect(submenu()).not.toBeNull());

    // Not role="menu": the colour rows are role="checkbox", and role="menu"
    // requires menuitem/menuitemcheckbox/menuitemradio children — declaring it
    // would trade this ticket's failure for an aria-required-children one.
    expect(submenu()!.getAttribute("role")).toBe("group");
    expect(submenu()!.getAttribute("aria-label")).toBe("Filter by color");
  });

  it("moves focus into the submenu when opened from the keyboard", async () => {
    await openFilterMenu();

    act(() => {
      trigger().focus();
      fireEvent.keyDown(trigger(), { key: "Enter" });
    });
    await waitFor(() => expect(submenu()).not.toBeNull());

    // The point of the ticket: arrow keys and Tab now operate on the submenu
    // rather than the row behind it.
    const rows = colorRows();
    expect(rows.length).toBeGreaterThan(0);
    await waitFor(() => expect(document.activeElement).toBe(rows[0]));
    expect(submenu()!.contains(document.activeElement)).toBe(true);
  });

  it("does not move focus when opened by hover", async () => {
    await openFilterMenu();
    const row = trigger();
    act(() => {
      row.focus();
    });

    act(() => {
      fireEvent.mouseEnter(row.parentElement!);
    });
    await waitFor(() => expect(submenu()).not.toBeNull());

    // Pulling focus out from under the pointer would fight the user.
    expect(document.activeElement).toBe(row);
  });

  it("does not move focus on a hover-open that follows a keyboard-open", async () => {
    await openFilterMenu();
    const row = trigger();

    // Open from the keyboard, which marks the open as keyboard-initiated.
    act(() => {
      row.focus();
      fireEvent.keyDown(row, { key: "Enter" });
    });
    await waitFor(() => expect(submenu()).not.toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(colorRows()[0]));

    // Close it again. The mark has to be cleared here, not left set.
    act(() => {
      fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    });
    await waitFor(() => expect(submenu()).toBeNull());

    // Now reopen with the pointer. A stale mark would pull focus into the
    // submenu under the cursor — the exact thing the hover path avoids.
    act(() => {
      fireEvent.mouseEnter(row.parentElement!);
    });
    await waitFor(() => expect(submenu()).not.toBeNull());

    expect(document.activeElement).toBe(row);
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    await openFilterMenu();
    act(() => {
      trigger().focus();
      fireEvent.keyDown(trigger(), { key: "Enter" });
    });
    await waitFor(() => expect(submenu()).not.toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(colorRows()[0]));

    act(() => {
      fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    });

    await waitFor(() => expect(submenu()).toBeNull());
    // Back on the row that opened it, not on <body>.
    expect(document.activeElement).toBe(trigger());
    // And only one layer closed — the filter menu behind it is still up. That is
    // what the shared open-instance stack buys.
    expect(screen.getByText("Filter by color")).toBeTruthy();
  });
});
