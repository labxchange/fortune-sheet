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
});
