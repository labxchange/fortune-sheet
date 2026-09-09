import { render } from "@testing-library/react";
import React from "react";
import { GRID_ROOT_CLASS } from "@fortune-sheet/core";
import Workbook from "../src/components/Workbook";
import { GRID_INTRO_ID_SUFFIX } from "../src/components/SheetOverlay";

// The grid root is a `main` landmark. Landmark navigation reads a landmark by
// its accessible name, so an unnamed one announces as a bare "main" — it does
// not say the region is the sheet, and it cannot be told apart from the main
// landmark of a page embedding the workbook (WCAG 1.3.1, 2.4.1).
describe("Grid main landmark", () => {
  it("has an accessible name", () => {
    const { getByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);

    expect(getByRole("main", { name: "Spreadsheet" })).toBeTruthy();
  });

  it("names the grid root itself, not a wrapper around it", () => {
    // The name has to land on the element that carries GRID_ROOT_CLASS: that is
    // the node the landmark is, and the node focusSpreadsheet moves focus to.
    const { container, getByRole } = render(
      <Workbook data={[{ name: "Sheet1" }]} />
    );

    expect(getByRole("main", { name: "Spreadsheet" })).toBe(
      container.querySelector(`.${GRID_ROOT_CLASS}`)
    );
  });

  it("takes the name from the locale rather than hard-coding English", () => {
    const { getByRole } = render(
      <Workbook lang="es" data={[{ name: "Sheet1" }]} />
    );

    expect(getByRole("main", { name: "Hoja de cálculo" })).toBeTruthy();
  });

  // The grid paints to <canvas>, so there is no per-cell node for a screen
  // reader to walk and VO+Arrow steps straight back out of the sheet. Arrow
  // keys are the only way through the cells, and nothing said so. The gesture
  // rides the landmark's *description* rather than a live region because a
  // VoiceOver cursor arriving fires no DOM event to hang a handler on.
  describe("the arrow-key description", () => {
    const describedText = (container: HTMLElement) => {
      const main = container.querySelector(`.${GRID_ROOT_CLASS}`)!;
      const id = main.getAttribute("aria-describedby");
      if (!id) throw new Error("grid root has no aria-describedby");
      // Resolved the way an AT resolves it -- through the IDREF -- so an
      // attribute pointing at nothing fails here rather than passing.
      return { main, id, node: container.querySelector(`#${CSS.escape(id)}`) };
    };

    it("tells the user arrow keys move between cells", () => {
      const { container } = render(<Workbook data={[{ name: "Sheet1" }]} />);

      const { node } = describedText(container);
      expect(node?.textContent).toBe(
        "Use the arrow keys to move between cells."
      );
    });

    it("takes the description from the locale rather than hard-coding English", () => {
      const { container } = render(
        <Workbook lang="es" data={[{ name: "Sheet1" }]} />
      );

      expect(describedText(container).node?.textContent).toBe(
        "Use las teclas de flecha para moverse entre celdas."
      );
    });

    it("describes the landmark without disturbing its name", () => {
      // A describedby added by reaching for aria-labelledby instead would fold
      // the hint into the name, so the landmark would announce as
      // "Spreadsheet Use the arrow keys..." in every landmark list.
      const { getByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);

      expect(getByRole("main", { name: "Spreadsheet" })).toBeTruthy();
    });

    it("is not a live region", () => {
      // It is read as part of landing on the landmark, never announced by
      // mutation. A role or an aria-live here would make it re-announce on
      // re-render, which is the opposite of what a description is for.
      const { container } = render(<Workbook data={[{ name: "Sheet1" }]} />);

      const { node } = describedText(container);
      expect(node?.getAttribute("role")).toBeNull();
      expect(node?.getAttribute("aria-live")).toBeNull();
    });

    it("gives each workbook on a page its own description node", () => {
      // The counter-path, and the defect this id's `useId()` exists to stop:
      // with a fixed id every instance's `aria-describedby` resolved to the
      // *first* instance's node. Containment is the assertion that names it --
      // two ids can differ while both spans sit in one subtree.
      const { container } = render(
        <>
          <Workbook data={[{ name: "Sheet1" }]} />
          <Workbook data={[{ name: "Sheet1" }]} />
        </>
      );

      const roots = Array.from(
        container.querySelectorAll(`.${GRID_ROOT_CLASS}`)
      );
      expect(roots).toHaveLength(2);

      const ids = roots.map((r) => r.getAttribute("aria-describedby"));
      expect(ids.every(Boolean)).toBe(true);
      expect(new Set(ids).size).toBe(2);

      roots.forEach((root, i) => {
        const own = container.querySelector(`#${CSS.escape(ids[i]!)}`);
        expect(own).not.toBeNull();
        // Resolves inside its own workbook, not a sibling's.
        expect(root.contains(own)).toBe(true);
        expect(own!.id.endsWith(`-${GRID_INTRO_ID_SUFFIX}`)).toBe(true);
      });
    });
  });
});
