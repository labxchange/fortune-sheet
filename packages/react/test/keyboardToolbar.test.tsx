import { render, fireEvent, within } from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";
import Button from "../src/components/Toolbar/Button";

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

    fireEvent.mouseDown(fontColorArrow);
    const grid = document.querySelector(".fortune-toolbar-color-picker")!;
    const swatches = within(grid as HTMLElement).getAllByRole("button");
    (swatches[0] as HTMLElement).focus();
    fireEvent.keyDown(swatches[0], { key: "ArrowRight" });
    expect(document.activeElement).toBe(swatches[1]);
  });

  it("closes a Combo dropdown (Format) when its own trigger is clicked again", () => {
    const { getAllByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    const [formatCombo] = getAllByRole("button", { name: /^Format:/ });

    // A real browser click dispatches mousedown, mouseup, then click as
    // separate events — fireEvent.click() alone only dispatches a single
    // synthetic click and can't reproduce the race this guards against
    // (useOutsideClick closes the popup on mousedown; the toggle used to
    // run on click, reading the just-closed state and reopening it).
    fireEvent.mouseDown(formatCombo);
    fireEvent.mouseUp(formatCombo);
    fireEvent.click(formatCombo);
    expect(document.querySelector(".fortune-toolbar-combo-popup")).toBeTruthy();

    fireEvent.mouseDown(formatCombo);
    fireEvent.mouseUp(formatCombo);
    fireEvent.click(formatCombo);
    expect(document.querySelector(".fortune-toolbar-combo-popup")).toBeNull();
  });

  it("Font color's arrow toggles the picker via mousedown; its main button still applies the last color directly instead of toggling", () => {
    const { getAllByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    const [fontColorMain, fontColorArrow] = getAllByRole("button", {
      name: /^Font color:/,
    });

    // main button has a custom onClick (apply the last-used color) — a
    // real click on it must not open the picker
    fireEvent.mouseDown(fontColorMain);
    fireEvent.mouseUp(fontColorMain);
    fireEvent.click(fontColorMain);
    expect(document.querySelector(".fortune-toolbar-color-picker")).toBeNull();

    // the arrow always toggles the picker, and does so on mousedown
    fireEvent.mouseDown(fontColorArrow);
    fireEvent.mouseUp(fontColorArrow);
    fireEvent.click(fontColorArrow);
    expect(
      document.querySelector(".fortune-toolbar-color-picker")
    ).toBeTruthy();

    fireEvent.mouseDown(fontColorArrow);
    fireEvent.mouseUp(fontColorArrow);
    fireEvent.click(fontColorArrow);
    expect(document.querySelector(".fortune-toolbar-color-picker")).toBeNull();
  });

  it("hovering the border color/style submenus does not steal focus, while keyboard opening still autofocuses and Escape restores it", () => {
    const { getAllByRole, getByRole, getByText } = render(
      <Workbook data={[{ name: "Sheet1" }]} />
    );
    // index 1 is the dropdown-arrow region, which always toggles the popup
    // (the main button applies the border directly, when clicked)
    const [, borderArrow] = getAllByRole("button", { name: /^Border:/ });
    const undoButton = getByRole("button", { name: "Undo" });

    fireEvent.mouseDown(borderArrow);

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
      // the submenu must be a sibling of the role="button" trigger, not a
      // descendant of it, or its contents are invisible to screen readers
      const submenuId = trigger.getAttribute("aria-controls");
      expect(submenuId).toBeTruthy();
      const submenu = document.getElementById(submenuId!)!;
      expect(submenu.getAttribute("role")).toBe("menu");
      expect(trigger.contains(submenu)).toBe(false);

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
    const submenuId = customFormatsRow.getAttribute("aria-controls");
    expect(submenuId).toBeTruthy();
    const submenu = document.getElementById(submenuId!)!;
    expect(submenu.getAttribute("role")).toBe("menu");
    expect(customFormatsRow.contains(submenu)).toBe(false);

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

    fireEvent.mouseDown(conditionFormatCombo);
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
    const submenuId = highlightRow.getAttribute("aria-controls");
    expect(submenuId).toBeTruthy();
    const submenu = document.getElementById(submenuId!)!;
    expect(submenu.getAttribute("role")).toBe("menu");
    expect(highlightRow.contains(submenu)).toBe(false);

    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(document.activeElement).toBe(highlightRow);
  });
});

describe("Toolbar Button disabled state", () => {
  // aria-disabled tells the user the control is inert; every activation path
  // has to agree with that, or a mouse user gets the action a keyboard user
  // was denied and a screen-reader user was told not to expect.
  it("ignores click, mousedown, Enter and Space when disabled", () => {
    const onClick = jest.fn();
    const { getByRole } = render(
      <Button tooltip="Undo" iconId="undo" disabled onClick={onClick} />
    );
    const button = getByRole("button", { name: "Undo" });

    fireEvent.click(button);
    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent.keyDown(button, { key: " " });

    expect(onClick).not.toHaveBeenCalled();
  });

  it("ignores mousedown, Enter and Space when disabled in onMouseDown mode", () => {
    const onMouseDown = jest.fn();
    const { getByRole } = render(
      <Button tooltip="More" iconId="more" disabled onMouseDown={onMouseDown} />
    );
    const button = getByRole("button", { name: "More" });

    fireEvent.mouseDown(button);
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent.keyDown(button, { key: " " });

    expect(onMouseDown).not.toHaveBeenCalled();
  });

  it("activates once per click and once per Enter when not disabled", () => {
    const onClick = jest.fn();
    const { getByRole } = render(
      <Button tooltip="Undo" iconId="undo" onClick={onClick} />
    );
    const button = getByRole("button", { name: "Undo" });

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(button, { key: "Enter" });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  // The grid's own keydown handler is bound on .fortune-container, an ancestor
  // of the toolbar, so an Enter that merely "does nothing" here would still
  // bubble into handleGlobalEnter and move the selection.
  it("does not let Enter or Space bubble past a disabled button", () => {
    const onAncestorKeyDown = jest.fn();
    const { getByRole } = render(
      <div onKeyDown={onAncestorKeyDown}>
        <Button tooltip="Undo" iconId="undo" disabled />
      </div>
    );
    const button = getByRole("button", { name: "Undo" });

    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent.keyDown(button, { key: " " });

    expect(onAncestorKeyDown).not.toHaveBeenCalled();
  });

  it("lets unrelated keys bubble past a disabled button", () => {
    const onAncestorKeyDown = jest.fn();
    const { getByRole } = render(
      <div onKeyDown={onAncestorKeyDown}>
        <Button tooltip="Undo" iconId="undo" disabled />
      </div>
    );

    fireEvent.keyDown(getByRole("button", { name: "Undo" }), { key: "a" });

    expect(onAncestorKeyDown).toHaveBeenCalledTimes(1);
  });
});
