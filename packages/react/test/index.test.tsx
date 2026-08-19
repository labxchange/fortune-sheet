import { fireEvent, render } from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";

describe("Worksheet", () => {
  it("should render", async () => {
    const { queryByText, container } = render(
      <Workbook data={[{ name: "Sheet1" }]} />
    );
    expect(container.querySelector(".fortune-sheet-container")).toBeTruthy();
    expect(queryByText("Sheet1")).toBeTruthy();
  });

  it("should not announce a sheet focus lock", async () => {
    const { container } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    // #sr-selection stays the single announcement channel for the grid; the
    // focus-lock live region and its shortcut entry are gone.
    expect(container.querySelector("#sr-selection")).toBeTruthy();
    expect(container.querySelector("#sr-sheetFocus")).toBeNull();
    expect(container.querySelector("#shortcut-list")?.textContent).not.toMatch(
      /focus lock/i
    );
  });

  // The core-level scoping tests build their own overlay, so they cannot catch a
  // grid root that stops matching what core looks for. This one goes through the
  // real SheetOverlay markup: if GRID_ROOT_CLASS and the rendered class name ever
  // part ways, the guard treats every target as out-of-grid and the grid goes
  // keyboard-dead -- silently, everywhere but here.
  it("moves the cell selection with Tab through the real grid DOM", () => {
    const { container } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    const cellInput = container.querySelector<HTMLElement>(
      ".luckysheet-cell-input"
    )!;
    // Before any key is pressed the grid announces its A1 intro; afterwards it
    // announces the focused cell, spelled out for a screen reader ("B. 1").
    expect(container.querySelector("#sr-selection")?.textContent).toContain(
      "A1."
    );

    cellInput.focus();
    fireEvent.keyDown(cellInput, { key: "Tab", code: "Tab" });

    expect(container.querySelector("#sr-selection")?.textContent).toContain(
      "B. 1"
    );
  });

  // Both controls are focusable with an onClick and no key handling of their own,
  // and grid keys no longer fall through to the grid on their behalf, so each has
  // to activate on Enter/Space itself (WCAG 2.1.1).
  it("selects the whole sheet when the select-all corner is activated by keyboard", () => {
    const { container } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    const corner = container.querySelector<HTMLElement>(".fortune-left-top")!;

    corner.focus();
    fireEvent.keyDown(corner, { key: "Enter", code: "Enter" });

    // selectAll() spans the sheet, which the grid announces as the A1:<last>
    // range rather than a single cell.
    expect(container.querySelector("#sr-selection")?.textContent).toContain(
      "A. 1:"
    );
  });

  it("opens the column-header menu when the caret is activated by keyboard", () => {
    const { container } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    // The caret only renders while a column header is hovered, so drive the
    // hover first and then activate the caret it puts on screen.
    fireEvent.mouseMove(
      container.querySelector<HTMLElement>(".fortune-col-header")!,
      { pageX: 60, pageY: 5, clientX: 60, clientY: 5 }
    );
    const caret = container.querySelector<HTMLElement>(".header-arrow");
    if (!caret) {
      throw new Error("no column-header caret rendered to activate");
    }

    caret.focus();
    fireEvent.keyDown(caret, { key: " ", code: "Space" });

    expect(container.querySelector(".fortune-context-menu")).toBeTruthy();
  });
});
