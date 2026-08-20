import { render, fireEvent, waitFor, within } from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";

describe("Sheet tab keyboard accessibility", () => {
  it("Enter/Space activates the Add sheet button", async () => {
    const { getByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    const addSheetButton = getByRole("button", { name: "New sheet" });

    expect(document.querySelectorAll(".luckysheet-sheets-item")).toHaveLength(
      1
    );

    addSheetButton.focus();
    fireEvent.keyDown(addSheetButton, { key: "Enter" });

    await waitFor(() =>
      expect(document.querySelectorAll(".luckysheet-sheets-item")).toHaveLength(
        2
      )
    );
  });

  it("Arrow keys move focus between tabs without switching the active sheet, Enter switches it", () => {
    const { getByText } = render(
      <Workbook data={[{ name: "Sheet1" }, { name: "Sheet2" }]} />
    );
    const tab1 = getByText("Sheet1").closest(
      ".luckysheet-sheets-item"
    ) as HTMLElement;
    const tab2 = getByText("Sheet2").closest(
      ".luckysheet-sheets-item"
    ) as HTMLElement;

    expect(tab1.className).toContain("luckysheet-sheets-item-active");

    tab1.focus();
    fireEvent.keyDown(tab1, { key: "ArrowRight" });
    expect(document.activeElement).toBe(tab2);
    // focus moved, but the active sheet has not changed yet
    expect(tab1.className).toContain("luckysheet-sheets-item-active");

    fireEvent.keyDown(tab2, { key: "Enter" });
    expect(tab2.className).toContain("luckysheet-sheets-item-active");
  });

  it("exposes the sheet strip as a tablist with a roving tabindex", () => {
    const { getByText, getAllByRole, getByRole } = render(
      <Workbook data={[{ name: "Sheet1" }, { name: "Sheet2" }]} />
    );

    // the arrow-key behaviour above is only half the manual-activation tabs
    // pattern; without these a screen reader hears the tab text and nothing
    // else — no "tab", no position, no selected state
    expect(getByRole("tablist")).toBeTruthy();
    const tabs = getAllByRole("tab");
    expect(tabs).toHaveLength(2);

    const tab1 = getByText("Sheet1").closest(".luckysheet-sheets-item")!;
    const tab2 = getByText("Sheet2").closest(".luckysheet-sheets-item")!;

    // Named explicitly, because a tab computes its name from its contents and
    // would otherwise pick up the options caret's "Sheet options" label —
    // every tab announcing "Sheet1 Sheet options". Asserted on the attribute
    // rather than via getAllByRole({ name }), which can't see the difference:
    // dom-accessibility-api omits the nested label here where Chrome includes
    // it, so a name query passes either way.
    expect(tab1.getAttribute("aria-label")).toBe("Sheet1");
    expect(tab2.getAttribute("aria-label")).toBe("Sheet2");
    // and the caret is still its own control inside the tab
    expect(
      within(tab1 as HTMLElement).getByRole("button", { name: "Sheet options" })
    ).toBeTruthy();

    expect(tab1.getAttribute("aria-selected")).toBe("true");
    expect(tab2.getAttribute("aria-selected")).toBe("false");
    // exactly one tab stop for the whole strip, however many sheets there are
    expect(tab1.getAttribute("tabindex")).toBe("0");
    expect(tab2.getAttribute("tabindex")).toBe("-1");

    fireEvent.keyDown(tab1 as HTMLElement, { key: "ArrowRight" });
    fireEvent.keyDown(tab2 as HTMLElement, { key: "Enter" });

    // aria-selected follows the active sheet, not merely focus
    expect(tab1.getAttribute("aria-selected")).toBe("false");
    expect(tab2.getAttribute("aria-selected")).toBe("true");
    expect(tab1.getAttribute("tabindex")).toBe("-1");
    expect(tab2.getAttribute("tabindex")).toBe("0");
  });

  it("opens the sheet options menu via keyboard anchored to the trigger, not a stale mouse position", () => {
    const { getByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    const sheetOptionsButton = getByRole("button", { name: "Sheet options" });

    jest.spyOn(sheetOptionsButton, "getBoundingClientRect").mockReturnValue({
      left: 500,
      right: 512,
      top: 100,
      bottom: 130,
      width: 12,
      height: 24,
      x: 500,
      y: 100,
      toJSON: () => {},
    } as DOMRect);

    sheetOptionsButton.focus();
    fireEvent.keyDown(sheetOptionsButton, { key: "Enter" });

    const menu = document.querySelector(".fortune-context-menu") as HTMLElement;
    expect(menu).toBeTruthy();
    // A keyboard-forwarded click has no real pageX/pageY (both 0), so if the
    // menu were still positioned from the click event's coordinates instead
    // of the trigger's own rect, this would render at 0 instead of ~500.
    expect(parseFloat(menu.style.left)).toBeCloseTo(500);
  });

  it("announces the sheet options menu's expanded state and wires it to the menu", () => {
    const { getByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    const sheetOptionsButton = getByRole("button", { name: "Sheet options" });

    // aria-haspopup tells the user a menu is coming; aria-expanded is what
    // makes the collapse/expand transition audible at all. Without it the
    // trigger reads identically open and closed.
    expect(sheetOptionsButton.getAttribute("aria-haspopup")).toBe("menu");
    expect(sheetOptionsButton.getAttribute("aria-expanded")).toBe("false");
    // referencing an id that isn't in the DOM yet is invalid, so it is only
    // set while the menu exists
    expect(sheetOptionsButton.getAttribute("aria-controls")).toBeNull();

    sheetOptionsButton.focus();
    fireEvent.keyDown(sheetOptionsButton, { key: "Enter" });

    expect(sheetOptionsButton.getAttribute("aria-expanded")).toBe("true");
    const menuId = sheetOptionsButton.getAttribute("aria-controls");
    expect(menuId).toBeTruthy();
    const menu = document.getElementById(menuId!)!;
    expect(menu).toBeTruthy();
    expect(menu.getAttribute("role")).toBe("menu");
    expect(menu.classList.contains("luckysheet-cols-menu")).toBe(true);

    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(sheetOptionsButton.getAttribute("aria-expanded")).toBe("false");
  });

  it("returns focus to the sheet options trigger, once, when the menu closes", () => {
    const { getByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    const sheetOptionsButton = getByRole("button", { name: "Sheet options" });

    sheetOptionsButton.focus();
    fireEvent.keyDown(sheetOptionsButton, { key: "Enter" });
    expect(document.activeElement).not.toBe(sheetOptionsButton);

    // Menu used to focus the first row itself, from a document-wide
    // querySelector in a per-instance mount effect: one call per row, and all
    // of them ran before useEscapeToClose captured the element to restore to,
    // so it recorded a menu row. That row is gone by the time the menu
    // closes, so the restore was skipped and focus fell to <body> — leaving
    // the screen reader to resync from nothing.
    const focusSpy = jest.fn();
    sheetOptionsButton.addEventListener("focus", focusSpy);

    fireEvent.keyDown(document.activeElement!, { key: "Escape" });

    expect(document.activeElement).toBe(sheetOptionsButton);
    expect(document.body).not.toBe(document.activeElement);
    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  it("closes the sheet options menu when its own trigger is pressed again", () => {
    const { getByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    const sheetOptionsButton = getByRole("button", { name: "Sheet options" });

    // aria-expanded is a promise that the trigger toggles. Same mousedown /
    // click race as the All-sheets trigger below: useOutsideClick closed the
    // menu on mousedown and the click handler then read that just-closed
    // state and reopened it, so a second press appeared to do nothing.
    fireEvent.mouseDown(sheetOptionsButton);
    fireEvent.mouseUp(sheetOptionsButton);
    fireEvent.click(sheetOptionsButton);
    expect(document.querySelector(".luckysheet-cols-menu")).toBeTruthy();
    expect(sheetOptionsButton.getAttribute("aria-expanded")).toBe("true");

    fireEvent.mouseDown(sheetOptionsButton);
    fireEvent.mouseUp(sheetOptionsButton);
    fireEvent.click(sheetOptionsButton);
    expect(document.querySelector(".luckysheet-cols-menu")).toBeNull();
    expect(sheetOptionsButton.getAttribute("aria-expanded")).toBe("false");
  });

  it("toggles the sheet options menu closed with Enter as well as the mouse", () => {
    const { getByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    const sheetOptionsButton = getByRole("button", { name: "Sheet options" });

    sheetOptionsButton.focus();
    fireEvent.keyDown(sheetOptionsButton, { key: "Enter" });
    expect(document.querySelector(".luckysheet-cols-menu")).toBeTruthy();

    sheetOptionsButton.focus();
    fireEvent.keyDown(sheetOptionsButton, { key: "Enter" });
    expect(document.querySelector(".luckysheet-cols-menu")).toBeNull();
  });

  it("hovering the Change-color submenu does not steal focus, while keyboard opening still autofocuses and Escape restores it", () => {
    const { getByRole, getByText } = render(
      <Workbook data={[{ name: "Sheet1" }]} />
    );
    const sheetOptionsButton = getByRole("button", { name: "Sheet options" });

    sheetOptionsButton.focus();
    fireEvent.keyDown(sheetOptionsButton, { key: "Enter" });

    const colorRow = getByText("Change color").closest(
      '[role="button"]'
    ) as HTMLElement;

    sheetOptionsButton.focus();
    fireEvent.mouseEnter(colorRow);
    expect(document.activeElement).toBe(sheetOptionsButton);
    fireEvent.mouseLeave(colorRow);
    expect(document.activeElement).toBe(sheetOptionsButton);

    colorRow.focus();
    fireEvent.keyDown(colorRow, { key: "Enter" });
    // the submenu must be a sibling of the role="button" row, not a
    // descendant of it, or its contents are invisible to screen readers
    // (role="button" flattens all descendant content into its own name)
    const submenuId = colorRow.getAttribute("aria-controls");
    expect(submenuId).toBeTruthy();
    const submenu = document.getElementById(submenuId!)!;
    expect(submenu.getAttribute("role")).toBe("menu");
    expect(colorRow.contains(submenu)).toBe(false);
    const submenuButtons = within(submenu).getAllByRole("button");
    expect(document.activeElement).toBe(submenuButtons[0]);

    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(document.activeElement).toBe(colorRow);
  });

  it("closes the sheet list when its own trigger is clicked again", () => {
    const { getByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    const allSheetsButton = getByRole("button", { name: "All sheets" });

    // A real browser click dispatches mousedown, mouseup, then click as
    // separate events — fireEvent.click() alone only dispatches a single
    // synthetic click and can't reproduce the race this guards against
    // (useOutsideClick closes the list on mousedown; the toggle used to
    // run on click, reading the just-closed state and reopening it).
    fireEvent.mouseDown(allSheetsButton);
    fireEvent.mouseUp(allSheetsButton);
    fireEvent.click(allSheetsButton);
    expect(document.querySelector(".fortune-sheet-list")).toBeTruthy();

    fireEvent.mouseDown(allSheetsButton);
    fireEvent.mouseUp(allSheetsButton);
    fireEvent.click(allSheetsButton);
    expect(document.querySelector(".fortune-sheet-list")).toBeNull();
  });
});
