import { render, fireEvent, act } from "@testing-library/react";
import React from "react";
import { GRID_ROOT_CLASS } from "@fortune-sheet/core";
import Workbook, { WorkbookInstance } from "../src/components/Workbook";

/**
 * Escape out of a formula-bar edit must leave the selection exactly as the edit
 * found it. The Escape handler collapses the highlight back onto the focus cell
 * by calling `moveHighlightCell` with a zero step, and that helper drops every
 * range but the last unless the caller asks it not to -- the behaviour ordinary
 * arrow keys rely on to clear a multi-range selection (WCAG 2.4.3). Cancelling
 * an edit is not a move, so this caller passes `keepSelection`.
 *
 * The core suite exercises the helper directly, always with the flag set, so it
 * cannot see a caller that also calls it *without* the flag first. Only a test
 * driving the real Escape handler can, which is what this one does.
 */
describe("Escape in the formula bar keeps a multi-range selection", () => {
  const setup = () => {
    const ref = React.createRef<WorkbookInstance>();
    const { container } = render(
      <Workbook ref={ref} data={[{ name: "Sheet1", celldata: [] }]} />
    );
    const fxInput = container.querySelector(
      "#luckysheet-functionbox-cell"
    ) as HTMLElement;
    return { ref, container, fxInput };
  };

  /** Two disjoint ranges, as a ctrl-click selection leaves them -- ordinary
   * ranges, with none of Shift+F8's `selectionModeActive` exemption behind
   * them. */
  const selectTwoRanges = (ref: React.RefObject<WorkbookInstance>) => {
    act(() => {
      ref.current!.setSelection([
        { row: [0, 0], column: [0, 0] },
        { row: [4, 4], column: [2, 2] },
      ]);
    });
    expect(ref.current!.getSelection()).toHaveLength(2);
  };

  /** Opens an edit session the way a pointer user does: press into the field,
   * take focus, then type. The Escape branch does nothing while
   * `luckysheetCellUpdate` is empty, so the session has to exist first. */
  const beginEditing = (fxInput: HTMLElement) => {
    fireEvent.pointerDown(fxInput);
    act(() => {
      fxInput.focus();
    });
    fireEvent.keyDown(fxInput, { key: "1" });
  };

  it("leaves both ranges selected when the edit is cancelled", () => {
    const { ref, fxInput } = setup();
    selectTwoRanges(ref);
    beginEditing(fxInput);

    fireEvent.keyDown(fxInput, { key: "Escape" });

    expect(ref.current!.getSelection()).toHaveLength(2);
  });

  it("keeps them through a second edit and cancellation", () => {
    // A single surviving Escape would also be explained by the ranges being
    // rebuilt from somewhere; running the whole cycle twice rules that out and
    // pins the case the report describes -- the user goes back for another try.
    const { ref, fxInput } = setup();
    selectTwoRanges(ref);

    beginEditing(fxInput);
    fireEvent.keyDown(fxInput, { key: "Escape" });
    beginEditing(fxInput);
    fireEvent.keyDown(fxInput, { key: "Escape" });

    expect(ref.current!.getSelection()).toHaveLength(2);
  });

  it("still collapses the selection when an arrow key moves the grid", () => {
    // The control. `keepSelection` is scoped to the Escape caller, so the
    // ordinary keyboard move it was carved out of must go on collapsing -- a
    // blanket keep here would resurrect the WCAG 2.4.3 bug the flag was added
    // for.
    const { ref, container } = setup();
    selectTwoRanges(ref);

    ref.current!.focusSpreadsheet();
    const grid = container.querySelector(`.${GRID_ROOT_CLASS}`) as HTMLElement;
    fireEvent.keyDown(grid, { key: "ArrowDown", code: "ArrowDown" });

    expect(ref.current!.getSelection()).toHaveLength(1);
  });
});
