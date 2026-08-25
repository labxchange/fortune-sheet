import { render, fireEvent, createEvent } from "@testing-library/react";
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
        // No getModifierState override: the prototype answers false for
        // AltGraph, which is what a genuine Ctrl+Alt reports.
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

    // AltGr is delivered as Ctrl+Alt on Windows and Linux, so an AltGr-composed
    // letter is indistinguishable from a region chord by flags and code alone.
    // A synthetic event cannot *be* AltGr, but it can carry the modifier state
    // the platform sets, which is exactly what the guard reads.
    it("ignores AltGr, which reports the same ctrlKey and altKey", () => {
      const { container } = render(<Workbook data={[{ name: "Sheet1" }]} />);
      const workbook =
        container.querySelector<HTMLElement>(".fortune-container")!;
      const grid = container.querySelector(`.${GRID_ROOT_CLASS}`);

      // `getModifierState` has to be defined on the event object: fireEvent's
      // init bag silently drops it, leaving the prototype method — which
      // answers false — in place, so the test would pass either way.
      const event = createEvent.keyDown(workbook, {
        key: "ś",
        code: "KeyS",
        ctrlKey: true,
        altKey: true,
      });
      Object.defineProperty(event, "getModifierState", {
        value: (m: string) => m === "AltGraph",
      });
      fireEvent(workbook, event);

      // The identical event without AltGraph focuses the grid root — that is
      // the test above — so this asserts the branch did not run at all.
      expect(document.activeElement).not.toBe(grid);
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
