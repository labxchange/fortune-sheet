import { render, fireEvent } from "@testing-library/react";
import React from "react";
import { GRID_ROOT_CLASS } from "@fortune-sheet/core";
import Workbook, { WorkbookInstance } from "../src/components/Workbook";

// Jumping between the toolbar, the grid and the sheet tabs (WCAG 2.4.1),
// exposed both as imperative methods for an embedding app and as in-workbook
// shortcuts for standalone use.
describe("Region focus", () => {
  describe("imperative API", () => {
    it("enters the grid at its root, not at a control inside it", () => {
      // The grid root holds tabIndex -1 for this. Landing on the select-all
      // corner or a filter funnel instead makes handleGlobalKeyDown's grid
      // guard classify focus as outside the grid, and the arrow keys then move
      // nothing — the shortcut would look like it worked and do nothing useful.
      const ref = React.createRef<WorkbookInstance>();
      const { container } = render(
        <Workbook ref={ref} data={[{ name: "Sheet1" }]} />
      );

      expect(ref.current!.focusSpreadsheet()).toBe(true);

      const grid = container.querySelector(`.${GRID_ROOT_CLASS}`);
      expect(document.activeElement).toBe(grid);
      expect(
        (document.activeElement as HTMLElement).getAttribute("tabindex")
      ).toBe("-1");
    });

    it("enters the toolbar", () => {
      const ref = React.createRef<WorkbookInstance>();
      const { container } = render(
        <Workbook ref={ref} data={[{ name: "Sheet1" }]} />
      );

      expect(ref.current!.focusToolbar()).toBe(true);
      expect(
        container
          .querySelector(".fortune-toolbar")
          ?.contains(document.activeElement)
      ).toBe(true);
    });

    it("enters the sheet tab bar on the active tab", () => {
      const ref = React.createRef<WorkbookInstance>();
      const { container } = render(
        <Workbook ref={ref} data={[{ name: "Sheet1" }, { name: "Sheet2" }]} />
      );

      expect(ref.current!.focusSheetTabs()).toBe(true);

      const active = document.activeElement as HTMLElement;
      expect(
        container
          .querySelector(".fortune-sheettab-container-c")
          ?.contains(active)
      ).toBe(true);
      expect(active.getAttribute("aria-selected")).toBe("true");
    });
  });

  describe("in-workbook shortcuts", () => {
    const press = (container: HTMLElement, code: string) => {
      const workbook =
        container.querySelector<HTMLElement>(".fortune-container")!;
      fireEvent.keyDown(workbook, {
        key: code.replace("Key", "").toLowerCase(),
        code,
        ctrlKey: true,
        altKey: true,
      });
    };

    it("Ctrl+Alt+S enters the grid", () => {
      const { container } = render(<Workbook data={[{ name: "Sheet1" }]} />);
      press(container, "KeyS");
      expect(document.activeElement).toBe(
        container.querySelector(`.${GRID_ROOT_CLASS}`)
      );
    });

    it("Ctrl+Alt+T enters the toolbar", () => {
      const { container } = render(<Workbook data={[{ name: "Sheet1" }]} />);
      press(container, "KeyT");
      expect(
        container
          .querySelector(".fortune-toolbar")
          ?.contains(document.activeElement)
      ).toBe(true);
    });

    it("Ctrl+Alt+B enters the sheet tab bar", () => {
      const { container } = render(<Workbook data={[{ name: "Sheet1" }]} />);
      press(container, "KeyB");
      expect(
        container
          .querySelector(".fortune-sheettab-container-c")
          ?.contains(document.activeElement)
      ).toBe(true);
    });
  });
});
