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
});
