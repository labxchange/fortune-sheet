import {
  render,
  fireEvent,
  createEvent,
  waitFor,
  act,
  screen,
} from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";

// B2 from the EDA QA pass: clicking a filter value's text closed the whole
// popup. Same root cause as menuButtonPointerFocus, one layer in — the value
// text is not focusable, so a mousedown on it falls through to the nearest
// focusable ancestor. In LabXchange's sim that is the tabIndex=-1 workbook
// wrapper, outside the popup, and closeOnFocusOut dismisses the popup out from
// under the press. This package's own Storybook has no such ancestor, so focus
// goes nowhere and the handler returns early on the null relatedTarget — which
// is why it reproduced only in the embedder.
//
// jsdom implements neither focus-on-mousedown nor layout, so — as in
// menuButtonPointerFocus — these assert the property that removes the stray
// focus move at its source: the container claims the mousedown default on its
// own chrome, and leaves it alone on the real controls inside it.

const text = (v: string) => ({ v, m: v, ct: { fa: "General", t: "s" } });

const data = [
  {
    name: "Sheet1",
    celldata: [
      { r: 0, c: 0, v: text("Name") },
      { r: 1, c: 0, v: text("apple") },
      { r: 2, c: 0, v: text("banana") },
    ],
    filter_select: { row: [0, 2], column: [0, 0] },
  },
];

// The colour list only renders when a column has more than one background.
const dataWithColors = [
  {
    name: "Sheet1",
    celldata: [
      { r: 0, c: 0, v: text("Name") },
      { r: 1, c: 0, v: { ...text("apple"), bg: "#ff0000" } },
      { r: 2, c: 0, v: { ...text("banana"), bg: "#00ff00" } },
      { r: 3, c: 0, v: { ...text("cherry"), bg: "#0000ff" } },
    ],
    filter_select: { row: [0, 3], column: [0, 0] },
  },
];

const SUBMENU_ID = "fortune-filter-bycolor-submenu";

const funnels = () =>
  Array.from(
    document.querySelectorAll<HTMLElement>(".luckysheet-filter-options")
  );

const filterMenu = () =>
  document.querySelector<HTMLElement>(".fortune-filter-menu");

const submenu = () => document.getElementById(SUBMENU_ID);

/** Opens the filter dropdown for column A from the keyboard. */
const openFilterMenu = async (sheet: unknown[] = data) => {
  render(<Workbook lang="en" data={sheet} />);
  await waitFor(() => expect(funnels().length).toBeGreaterThan(0));
  const [first] = funnels();
  act(() => {
    first.focus();
    fireEvent.keyDown(first, { key: "Enter" });
  });
  await waitFor(() => screen.getByText("Check all"));
};

/** Opens the filter menu and then its Filter-by-colour submenu. */
const openColorSubmenu = async () => {
  await openFilterMenu(dataWithColors);
  const trigger = screen
    .getByText("Filter by color")
    .closest('[role="button"]') as HTMLElement;
  act(() => {
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });
  });
  await waitFor(() => expect(submenu()).not.toBeNull());
};

/** Returns the event so the test can ask whether the default was claimed. */
const pressMouse = (el: HTMLElement) => {
  const event = createEvent.mouseDown(el, { bubbles: true, cancelable: true });
  fireEvent(el, event);
  return event;
};

describe("filter menu pointer focus", () => {
  it("claims the default when a value's text is pressed, and stays open", async () => {
    await openFilterMenu();
    const menu = filterMenu()!;
    // The value rows populate from a useEffect keyed on the opened column, a
    // render after the menu itself mounts.
    await waitFor(() =>
      expect(menu.querySelector(".select-item")).not.toBeNull()
    );
    // The `<div>{item.text}</div>` beside each checkbox: a direct div child of
    // a .select-item row, not the checkbox and not the count span.
    const valueText = menu.querySelector<HTMLElement>(".select-item > div")!;
    expect(valueText.textContent).toBeTruthy();

    const event = pressMouse(valueText);

    expect(event.defaultPrevented).toBe(true);
    expect(filterMenu()).not.toBeNull();
  });

  it("leaves the default alone on a value checkbox", async () => {
    await openFilterMenu();
    const menu = filterMenu()!;
    const checkbox = menu.querySelector<HTMLInputElement>(
      "input.filter-checkbox"
    )!;

    const event = pressMouse(checkbox);

    expect(event.defaultPrevented).toBe(false);
  });

  it("leaves the default alone on the value search box", async () => {
    await openFilterMenu();
    const menu = filterMenu()!;
    const search = menu.querySelector<HTMLInputElement>('input[type="text"]')!;

    const event = pressMouse(search);

    expect(event.defaultPrevented).toBe(false);
  });

  it("leaves the default alone on the footer buttons", async () => {
    await openFilterMenu();
    const menu = filterMenu()!;
    const confirm = screen
      .getByText("Confirm")
      .closest("button") as HTMLButtonElement;
    expect(menu.contains(confirm)).toBe(true);

    const event = pressMouse(confirm);

    expect(event.defaultPrevented).toBe(false);
  });

  // The colour submenu renders as a sibling of the main container, so it carries
  // its own copy of the guard.
  it("claims the default on the colour submenu's own chrome", async () => {
    await openColorSubmenu();
    const title = submenu()!.querySelector<HTMLElement>(".title")!;
    expect(title.textContent).toBeTruthy();

    const event = pressMouse(title);

    expect(event.defaultPrevented).toBe(true);
    expect(submenu()).not.toBeNull();
  });

  it("leaves the default alone on a colour row", async () => {
    await openColorSubmenu();
    const row = submenu()!.querySelector<HTMLElement>('[role="checkbox"]')!;

    const event = pressMouse(row);

    expect(event.defaultPrevented).toBe(false);
  });
});
