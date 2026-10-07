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
// The guard lives in useEscapeToClose, attached whenever closeOnFocusOut is on,
// so every popup with the same chrome gets it; this exercises it end to end
// through the filter menu and its sibling colour submenu (one listener covers
// both via the menu's withinRefs). Each press checks two things: that the
// mousedown default is claimed on chrome and left alone on real controls, and —
// rendering the workbook inside the sim's tabIndex=-1 wrapper and emulating the
// browser's uncancelled-mousedown default by hand (jsdom implements neither
// focus-on-mousedown nor layout) — that the popup actually survives the press.

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
  // The tabIndex=-1 wrapper is the sim's topology: it is what the browser's
  // uncancelled-mousedown default would hand focus to, so the bug can reproduce.
  render(
    <div tabIndex={-1} data-testid="embedder">
      <Workbook lang="en" data={sheet} />
    </div>
  );
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

/**
 * Emulate what a real browser does with an *uncancelled* mousedown on a popup's
 * non-focusable chrome: the default focuses the nearest focusable ancestor — the
 * embedder's tabIndex=-1 wrapper — firing a focusout off whatever control inside
 * the popup held focus. jsdom delivers neither (see `tabTo` in
 * popupFocusOutDismissal), so when the guard did *not* cancel, do both by hand,
 * exactly as the browser would. With the guard in place this is a no-op and the
 * popup survives; drop the guard and the focusout fires, closeOnFocusOut
 * dismisses the popup, and the following stay-open assertion fails.
 */
const emulateUncancelledEscape = (event: Event, within: HTMLElement) => {
  if (event.defaultPrevented) return;
  const embedder = screen.getByTestId("embedder");
  const held =
    document.activeElement && within.contains(document.activeElement)
      ? (document.activeElement as HTMLElement)
      : within;
  act(() => {
    embedder.focus();
    fireEvent.focusOut(held, { relatedTarget: embedder });
  });
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
    emulateUncancelledEscape(event, menu);
    await waitFor(() => expect(filterMenu()).not.toBeNull());
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

  // The colour submenu renders as a sibling of the main container; the menu's
  // single guard listener covers it through `withinRefs: [subMenuRef]`.
  it("claims the default on the colour submenu's own chrome, and stays open", async () => {
    await openColorSubmenu();
    const sub = submenu()!;
    const title = sub.querySelector<HTMLElement>(".title")!;
    expect(title.textContent).toBeTruthy();

    const event = pressMouse(title);

    expect(event.defaultPrevented).toBe(true);
    emulateUncancelledEscape(event, sub);
    await waitFor(() => expect(filterMenu()).not.toBeNull());
    expect(submenu()).not.toBeNull();
  });

  it("leaves the default alone on a colour row", async () => {
    await openColorSubmenu();
    const row = submenu()!.querySelector<HTMLElement>('[role="checkbox"]')!;

    const event = pressMouse(row);

    expect(event.defaultPrevented).toBe(false);
  });

  // The guard is shared by every closeOnFocusOut popup, so it must also leave
  // roving items alone: ColorPicker's inactive swatches are tabIndex=-1 and move
  // the tab stop in their onFocus. Cancelling the press left the tab stop on the
  // previous swatch while the popup stayed open.
  it("leaves the default alone on an inactive swatch in the sheet-tab colour menu", async () => {
    render(
      <div tabIndex={-1} data-testid="embedder">
        <Workbook lang="en" data={data} />
      </div>
    );
    const sheetOptions = screen.getByRole("button", { name: "Sheet options" });
    act(() => {
      sheetOptions.focus();
      fireEvent.keyDown(sheetOptions, { key: "Enter" });
    });
    const colorRow = screen
      .getByText("Change color")
      .closest('[role="button"]') as HTMLElement;
    act(() => {
      colorRow.focus();
      fireEvent.keyDown(colorRow, { key: "Enter" });
    });
    const swatch = await waitFor(() => {
      const el = document.querySelector<HTMLElement>(
        '[role="option"][tabindex="-1"]'
      );
      expect(el).not.toBeNull();
      return el!;
    });

    const event = pressMouse(swatch);

    expect(event.defaultPrevented).toBe(false);
  });
});
