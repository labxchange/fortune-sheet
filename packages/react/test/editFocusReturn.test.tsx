import { render, fireEvent, act } from "@testing-library/react";
import React from "react";
import { GRID_ROOT_CLASS } from "@fortune-sheet/core";
import Workbook, { WorkbookInstance } from "../src/components/Workbook";

/**
 * Returning to the grid, with and without a cell edit open.
 *
 * A learner editing a cell jumps away to re-read the instruction they are
 * halfway through following, then jumps back. The grid root is the region's
 * single entry point -- Tab, Ctrl+Alt+S and `focusSpreadsheet` all land there,
 * which is what stops a route parking a caret in a cell nobody asked to edit.
 * That is right for an idle grid and wrong for one already being edited: the
 * printable-key and point-mode-arrow branches of `handleGlobalKeyDown` both
 * return before the tail that parks focus on the editor, so an edit left open
 * with focus on the root could not be typed into and no key pressed in the grid
 * recovered it (WCAG 2.1.1), while arrival said nothing about which cell had
 * been reached (2.4.3, 4.1.2).
 *
 * What jsdom can and cannot settle, stated once: it implements focus, so every
 * assertion about *where* focus lands is real. It does not implement
 * contenteditable text insertion, so "the typed character appears in the cell"
 * is not assertable here at all -- for any test, not just these. The property
 * standing in for it is the one that actually broke: focus is on the
 * contenteditable with a caret in its text, which is what the browser needs in
 * order to insert. The insertion itself is covered end to end by the Playwright
 * spec in the consuming repository.
 */

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
  const ref = React.createRef<WorkbookInstance>();
  const { container } = render(
    <Workbook ref={ref} data={[{ name: "Sheet1", celldata } as any]} />
  );
  return {
    ref,
    container,
    grid: container.querySelector<HTMLElement>(`.${GRID_ROOT_CLASS}`)!,
    cellInput: container.querySelector<HTMLElement>(".luckysheet-cell-input")!,
    inputBox: container.querySelector<HTMLElement>(".luckysheet-input-box")!,
  };
};

/** Put the sheet into the editing state, the way F2 does. */
const startEditing = async (cellInput: HTMLElement) => {
  cellInput.focus();
  await tick();
  fireEvent.keyDown(cellInput, { key: "F2", keyCode: 113 });
  await tick();
};

/**
 * Whether a cell edit is open, read the way the DOM exposes it: `InputBox`
 * raises the editor's z-index only while `luckysheetCellUpdate` is non-empty.
 * Asserting on this rather than reaching into context keeps the test to what a
 * user agent can see.
 */
const isEditing = (inputBox: HTMLElement) => inputBox.style.zIndex === "19";

describe("Returning to the grid", () => {
  const strays: HTMLElement[] = [];

  afterEach(() => {
    while (strays.length) strays.pop()!.remove();
  });

  /** Somewhere outside the grid, as the task panel is in the simulation. */
  const outsideTarget = () => {
    const el = document.createElement("button");
    document.body.appendChild(el);
    strays.push(el);
    return el;
  };

  /** The reported round trip: leave the grid, then come back by shortcut. */
  const leaveAndReturn = async (ref: React.RefObject<WorkbookInstance>) => {
    const outside = outsideTarget();
    act(() => outside.focus());
    await tick();
    act(() => {
      ref.current!.focusSpreadsheet();
    });
    await tick();
  };

  describe("with an edit open", () => {
    it("lands on the cell being edited, not on the grid landmark", async () => {
      const { ref, cellInput, grid } = setup();
      await startEditing(cellInput);

      await leaveAndReturn(ref);

      expect(document.activeElement).toBe(cellInput);
      expect(document.activeElement).not.toBe(grid);
    });

    it("leaves the caret in the text, so the editor takes input", async () => {
      // Focus alone is not the fix. Without a caret the learner is focused on
      // an editor that still accepts nothing -- end-of-text is where InputBox
      // itself puts it when an edit begins.
      const { ref, cellInput } = setup();
      await startEditing(cellInput);

      await leaveAndReturn(ref);

      const anchor = document.getSelection()?.anchorNode ?? null;
      expect(anchor).not.toBeNull();
      expect(cellInput.contains(anchor)).toBe(true);
    });

    it("keeps the edit open and its text untouched across the trip", async () => {
      const { ref, cellInput, inputBox } = setup();
      await startEditing(cellInput);
      const before = cellInput.innerHTML;
      expect(isEditing(inputBox)).toBe(true);

      await leaveAndReturn(ref);

      // Neither committed nor cancelled by leaving: the half-typed formula is
      // the whole reason the learner went to re-read the instruction.
      expect(isEditing(inputBox)).toBe(true);
      expect(cellInput.innerHTML).toBe(before);
    });

    it("does not write a value to the cell", async () => {
      const { ref, cellInput } = setup();
      await startEditing(cellInput);

      await leaveAndReturn(ref);

      // A1 held 1 before the edit opened and must still hold it: a blind
      // commit on departure would be worse than the defect being fixed.
      expect(ref.current!.getCellValue(0, 0)).toBe(1);
    });

    it("keeps focus on the editor when an arrow key follows the return", async () => {
      // The point-mode arrow branch returns before the tail that parks focus on
      // the editor. That is deliberate -- it protects the formula bar -- and it
      // is why the old landing spot could never be recovered from. Focus has to
      // already be right on arrival, and stay right afterwards.
      const { ref, cellInput } = setup();
      await startEditing(cellInput);

      await leaveAndReturn(ref);
      fireEvent.keyDown(cellInput, { key: "ArrowDown", keyCode: 40 });
      await tick();

      expect(document.activeElement).toBe(cellInput);
    });
  });

  describe("however focus arrives", () => {
    it("redirects focus off the landmark to the editor while an edit is open", async () => {
      // Not via focusSpreadsheet: this is the backstop for every other route,
      // which is what makes the unusable state unreachable rather than merely
      // avoided on the one path the report came in on.
      const { cellInput, grid } = setup();
      await startEditing(cellInput);

      act(() => grid.focus());
      await tick();

      expect(document.activeElement).toBe(cellInput);
    });

    it("leaves focus alone on a control inside the grid", async () => {
      // The select-all corner is focusable and lives under the landmark, so the
      // delegated focus event fires for it too. Typing does nothing there
      // either, but it is a control the learner chose -- taking focus away
      // would be a worse defect than the one being prevented.
      const { container, cellInput } = setup();
      const corner = container.querySelector<HTMLElement>(".fortune-left-top")!;
      await startEditing(cellInput);

      act(() => corner.focus());
      await tick();

      expect(document.activeElement).toBe(corner);
    });

    it("leaves focus on the landmark alone when no edit is open", async () => {
      // Nothing to restore, so nothing to move. An embedder focusing the
      // landmark deliberately keeps what it asked for.
      const { grid } = setup();
      await tick();

      act(() => grid.focus());
      await tick();

      expect(document.activeElement).toBe(grid);
    });

    it("does not recurse", async () => {
      const { cellInput, grid } = setup();
      await startEditing(cellInput);
      let focusEvents = 0;
      const count = () => {
        focusEvents += 1;
      };
      grid.addEventListener("focusin", count);

      act(() => grid.focus());
      await tick();
      grid.removeEventListener("focusin", count);

      // One for landing on the landmark, one for the redirect to the editor,
      // and then it settles -- the editor fails the target === currentTarget
      // guard, so it cannot bounce focus back.
      expect(focusEvents).toBe(2);
      expect(document.activeElement).toBe(cellInput);
    });
  });

  describe("with no edit open", () => {
    it("lands on the grid root, keeping all three entry routes on one element", async () => {
      // Not the editor. The root is the grid's single entry point — Tab,
      // Ctrl+Alt+S and this API all land here — and taking the idle editor out
      // of that set is what stops a route parking a caret in a cell nobody
      // asked to edit. Where the learner has arrived is said by the arrival
      // region instead (spreadsheetFocusReturnAnnouncement.test.tsx), which is
      // what the landmark's own name cannot carry.
      const { ref, cellInput, grid } = setup();
      await tick();

      await leaveAndReturn(ref);

      expect(document.activeElement).toBe(grid);
      expect(document.activeElement).not.toBe(cellInput);
    });

    it("leaves the idle editor out of the tab order", async () => {
      // The other half of that rule, and the reason landing on the root is
      // safe: an idle editor that is still a tab stop would let Tab reach it
      // and start an edit nobody asked for.
      const { cellInput } = setup();
      await tick();

      expect(cellInput.getAttribute("tabindex")).toBe("-1");
    });

    it("still reports that focus landed", async () => {
      // `useSimKeyboardShortcuts` consumes this to decide whether the keystroke
      // was spoken for; a bare true would make it swallow keys it did not use.
      const { ref } = setup();
      await tick();

      let landed = false;
      act(() => {
        landed = ref.current!.focusSpreadsheet();
      });

      expect(landed).toBe(true);
    });

    it("leaves the arrow keys moving the selection", async () => {
      // The property the old grid-root target existed to protect: focus must
      // not land anywhere `handleGlobalKeyDown` treats as outside the grid. The
      // cell input is the one descendant its guard exempts.
      const { ref, cellInput } = setup();
      await tick();

      await leaveAndReturn(ref);
      fireEvent.keyDown(cellInput, { key: "ArrowDown", keyCode: 40 });
      await tick();

      expect(cellInput.getAttribute("aria-label")).toBe("A. 2");
    });
  });
});
