import { render, fireEvent, within } from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";

describe("Toolbar keyboard accessibility", () => {
  it("does not activate a disabled button (Undo, with no history) via Enter or Space", () => {
    const { getByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    const undoButton = getByRole("button", { name: "Undo" });
    const clickSpy = jest.fn();
    undoButton.addEventListener("click", clickSpy);

    undoButton.focus();
    fireEvent.keyDown(undoButton, { key: "Enter" });
    fireEvent.keyDown(undoButton, { key: " " });

    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("opens a combo with Enter, navigates with arrows, and closes with Escape restoring focus", () => {
    const { getAllByRole, queryByText } = render(
      <Workbook data={[{ name: "Sheet1" }]} />
    );
    const [formatCombo] = getAllByRole("button", { name: /^Format:/ });

    formatCombo.focus();
    fireEvent.keyDown(formatCombo, { key: "Enter" });

    const popup = document.querySelector(".fortune-toolbar-combo-popup")!;
    const automaticOption = within(popup as HTMLElement)
      .getByText("Automatic")
      .closest('[role="button"]') as HTMLElement;
    expect(document.activeElement).toBe(automaticOption);

    fireEvent.keyDown(automaticOption, { key: "ArrowDown" });
    const plainTextOption = within(popup as HTMLElement)
      .getByText("Plain text")
      .closest('[role="button"]') as HTMLElement;
    expect(document.activeElement).toBe(plainTextOption);

    fireEvent.keyDown(plainTextOption, { key: "Escape" });
    expect(queryByText("Plain text")).toBeNull();
    expect(document.activeElement).toBe(formatCombo);
  });

  it("navigates the font-color grid with arrow keys", () => {
    const { getAllByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    // index 1 is the dropdown-arrow region, which always toggles the popup
    // (the main button applies the most-recent color instead, when set)
    const [, fontColorArrow] = getAllByRole("button", {
      name: /^Font color:/,
    });

    fireEvent.click(fontColorArrow);
    const grid = document.querySelector(".fortune-toolbar-color-picker")!;
    const swatches = within(grid as HTMLElement).getAllByRole("button");
    (swatches[0] as HTMLElement).focus();
    fireEvent.keyDown(swatches[0], { key: "ArrowRight" });
    expect(document.activeElement).toBe(swatches[1]);
  });

  it("hovering the border color/style submenus does not steal focus, while keyboard opening still autofocuses and Escape restores it", () => {
    const { getAllByRole, getByRole, getByText } = render(
      <Workbook data={[{ name: "Sheet1" }]} />
    );
    // index 1 is the dropdown-arrow region, which always toggles the popup
    // (the main button applies the border directly, when clicked)
    const [, borderArrow] = getAllByRole("button", { name: /^Border:/ });
    const undoButton = getByRole("button", { name: "Undo" });

    fireEvent.click(borderArrow);

    [
      { label: "border color", menuClass: "fortune-border-select-menu" },
      { label: "border style", menuClass: "fortune-border-select-menu" },
    ].forEach(({ label, menuClass }) => {
      const trigger = getByText(label).closest(
        '[role="button"]'
      ) as HTMLElement;

      undoButton.focus();
      fireEvent.mouseEnter(trigger);
      expect(document.activeElement).toBe(undoButton);
      fireEvent.mouseLeave(trigger);
      expect(document.activeElement).toBe(undoButton);

      trigger.focus();
      fireEvent.keyDown(trigger, { key: "Enter" });
      expect(document.activeElement).not.toBe(trigger);
      expect(
        (document.activeElement as HTMLElement).closest(`.${menuClass}`)
      ).toBeTruthy();

      fireEvent.keyDown(document.activeElement!, { key: "Escape" });
      expect(document.activeElement).toBe(trigger);
    });
  });

  it("hovering the Custom-formats submenu does not steal focus, while keyboard opening still autofocuses and Escape restores it", () => {
    const { getAllByRole, getByRole } = render(
      <Workbook data={[{ name: "Sheet1" }]} />
    );
    const [formatCombo] = getAllByRole("button", { name: /^Format:/ });
    const undoButton = getByRole("button", { name: "Undo" });

    formatCombo.focus();
    fireEvent.keyDown(formatCombo, { key: "Enter" });
    const popup = document.querySelector(".fortune-toolbar-combo-popup")!;
    const customFormatsRow = within(popup as HTMLElement)
      .getByText("Custom formats")
      .closest('[role="button"]') as HTMLElement;

    undoButton.focus();
    fireEvent.mouseEnter(customFormatsRow);
    expect(document.activeElement).toBe(undoButton);
    fireEvent.mouseLeave(customFormatsRow);
    expect(document.activeElement).toBe(undoButton);

    customFormatsRow.focus();
    fireEvent.keyDown(customFormatsRow, { key: "Enter" });
    expect(document.activeElement).not.toBe(customFormatsRow);
    expect(
      (document.activeElement as HTMLElement).closest(".more-format")
    ).toBeTruthy();

    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(document.activeElement).toBe(customFormatsRow);
  });

  it("hovering the Highlight-cell-rules condition-format submenu does not steal focus, while keyboard opening still autofocuses and Escape restores it", () => {
    const { getAllByRole, getByRole } = render(
      <Workbook data={[{ name: "Sheet1" }]} />
    );
    const [conditionFormatCombo] = getAllByRole("button", {
      name: /^Conditional format:/,
    });
    const undoButton = getByRole("button", { name: "Undo" });

    fireEvent.click(conditionFormatCombo);
    const popup = document.querySelector(".fortune-toolbar-combo-popup")!;
    const highlightRow = within(popup as HTMLElement)
      .getByText("Highlight cell rules")
      .closest('[role="button"]') as HTMLElement;

    undoButton.focus();
    fireEvent.mouseEnter(highlightRow);
    expect(document.activeElement).toBe(undoButton);
    fireEvent.mouseLeave(highlightRow);
    expect(document.activeElement).toBe(undoButton);

    highlightRow.focus();
    fireEvent.keyDown(highlightRow, { key: "Enter" });
    expect(document.activeElement).not.toBe(highlightRow);
    expect(
      (document.activeElement as HTMLElement).closest(
        ".condition-format-sub-menu"
      )
    ).toBeTruthy();

    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(document.activeElement).toBe(highlightRow);
  });
});
