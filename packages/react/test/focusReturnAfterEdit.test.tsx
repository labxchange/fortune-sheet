import { render, fireEvent, act } from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";

// Where focus and identity sit when a cell edit ends.
//
// The sheet is painted on a canvas, so no cell is focusable in its own right.
// The cell input is the DOM's stand-in for one: `InputBox` positions it over the
// focused cell and `handleGlobalKeyDown` parks focus on it. It used to be
// unnamed, so committing an edit left a keyboard user on a bare "edit text" with
// nothing said about where they were (WCAG 2.4.3, 4.1.2). Naming it for the cell
// is what makes focus resting there correct; the formula bar, which is a genuinely
// different element, hands focus back to it.

const tick = () =>
  act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });

const celldata = [
  { r: 0, c: 0, v: { v: 1, m: "1", ct: { fa: "General", t: "n" } } },
  { r: 1, c: 0, v: { v: 2, m: "2", ct: { fa: "General", t: "n" } } },
];

const setup = () => {
  const { container } = render(
    <Workbook data={[{ name: "Sheet1", celldata } as any]} />
  );
  return {
    cellInput: container.querySelector<HTMLElement>(".luckysheet-cell-input")!,
    fxInput: container.querySelector<HTMLElement>(
      "#luckysheet-functionbox-cell"
    )!,
  };
};

/** Put the sheet into the editing state both handlers guard on. */
const startEditing = async (cellInput: HTMLElement) => {
  cellInput.focus();
  await tick();
  fireEvent.keyDown(cellInput, { key: "F2", keyCode: 113 });
  await tick();
};

describe("Cell identity and focus when an edit ends", () => {
  describe("the cell input names the cell it sits on", () => {
    it("announces the reference of the cell it sits on", async () => {
      const { cellInput } = setup();
      await tick();

      // The reference is spaced for speech ("A. 1") by the shared
      // `formatRefForSr`, the same convention `#sr-selection` reads — but built
      // from the focus cell, not the selected range, since that is what the
      // input sits on.
      //
      // The reference and nothing else. A1 holds 1, and the name used to say so
      // — but `#sr-selection` says so too, in the same commit, on the ordinary
      // arrow-key move, and a name change on the focused element is
      // re-announced. The alert reads the content; this answers "where am I".
      expect(cellInput.getAttribute("aria-label")).toBe("A. 1");
    });

    it("is unchanged by an edit opening, since it never held the value", async () => {
      // The field's own text is the value while editing, and the name is the
      // reference either way. What does drop is the formula marker, which
      // `formulaAnnouncement.test.tsx` pins.
      const { cellInput } = setup();
      await startEditing(cellInput);

      expect(cellInput.getAttribute("aria-label")).toBe("A. 1");
    });

    it("carries a role, so the name is not discarded", async () => {
      // aria-label is prohibited on a role-less div, so without this the name
      // above never reaches the accessibility tree (axe: aria-prohibited-attr).
      const { cellInput } = setup();
      await tick();

      expect(cellInput.getAttribute("role")).toBe("textbox");
    });

    it("declares itself multi-line, because it is", async () => {
      // Alt+Enter and Meta+Enter insert a newline in the cell, so a bare
      // role="textbox" understates it: a screen reader would present the field
      // as single-line and give no hint that a line break is available.
      const { cellInput } = setup();
      await tick();

      expect(cellInput.getAttribute("aria-multiline")).toBe("true");
    });

    it("follows the selection", async () => {
      const { cellInput } = setup();
      await tick();

      fireEvent.keyDown(cellInput, { key: "ArrowDown", keyCode: 40 });
      await tick();

      expect(cellInput.getAttribute("aria-label")).toBe("A. 2");
    });
  });

  describe("in-cell editor", () => {
    it("keeps focus on the cell input through a commit", async () => {
      // Nothing should move: the element focus is already on *is* the cell.
      const { cellInput } = setup();
      await startEditing(cellInput);
      expect(document.activeElement).toBe(cellInput);

      fireEvent.keyDown(cellInput, { key: "Enter", keyCode: 13 });
      await tick();

      expect(document.activeElement).toBe(cellInput);
    });

    it("names the cell Enter moved to, not the one just left", async () => {
      const { cellInput } = setup();
      await startEditing(cellInput);

      fireEvent.keyDown(cellInput, { key: "Enter", keyCode: 13 });
      await tick();

      expect(cellInput.getAttribute("aria-label")).toBe("A. 2");
    });
  });

  describe("formula bar", () => {
    it("hands focus back to the cell input on Enter", async () => {
      const { cellInput, fxInput } = setup();
      await startEditing(cellInput);

      fxInput.focus();
      await tick();
      expect(document.activeElement).toBe(fxInput);

      fireEvent.keyDown(fxInput, { key: "Enter", keyCode: 13 });
      await tick();

      expect(document.activeElement).toBe(cellInput);
    });

    it("hands focus back to the cell input on Escape", async () => {
      const { cellInput, fxInput } = setup();
      await startEditing(cellInput);

      fxInput.focus();
      await tick();

      fireEvent.keyDown(fxInput, { key: "Escape", keyCode: 27 });
      await tick();

      expect(document.activeElement).toBe(cellInput);
    });

    it("restores focus without scrolling the page to it", async () => {
      // The cell input is parked at left: -10000 whenever it has no selection to
      // sit on, so a plain focus() lets the browser scroll the nearest
      // scrollable ancestor to reveal it — dragging an embedder's layout
      // sideways on what should be a no-op restore.
      const { cellInput, fxInput } = setup();
      await startEditing(cellInput);

      fxInput.focus();
      await tick();
      const focusSpy = jest.spyOn(cellInput, "focus");

      fireEvent.keyDown(fxInput, { key: "Enter", keyCode: 13 });
      await tick();

      expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
      focusSpy.mockRestore();
    });

    it("leaves focus alone for a key that does not end the edit", async () => {
      const { cellInput, fxInput } = setup();
      await startEditing(cellInput);

      fxInput.focus();
      await tick();

      fireEvent.keyDown(fxInput, { key: "a", keyCode: 65 });
      await tick();

      expect(document.activeElement).toBe(fxInput);
    });
  });
});
