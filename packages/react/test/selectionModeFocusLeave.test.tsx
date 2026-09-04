import { render, fireEvent, act } from "@testing-library/react";
import React from "react";
import { GRID_ROOT_CLASS } from "@fortune-sheet/core";
import Workbook, { WorkbookInstance } from "../src/components/Workbook";

/**
 * Shift+F8 mode used to end only on Escape or a sheet change, so it outlived
 * every trip out of the grid — the toolbar, the formula bar, or the reported
 * one: build a selection, graph it, remove the graph, come back. While the flag
 * was set the arrow keys carried the anchored range instead of collapsing the
 * selection, which left the ranges the graph was built from stuck on the sheet
 * with no key that could clear them (WCAG 2.4.3).
 */
describe("Shift+F8 mode ends when focus leaves the grid", () => {
  const strays: HTMLElement[] = [];

  afterEach(() => {
    while (strays.length) strays.pop()!.remove();
    jest.restoreAllMocks();
  });

  const setup = () => {
    const ref = React.createRef<WorkbookInstance>();
    const { container } = render(
      <Workbook ref={ref} data={[{ name: "Sheet1", celldata: [] }]} />
    );
    const grid = container.querySelector(`.${GRID_ROOT_CLASS}`) as HTMLElement;
    return { ref, container, grid };
  };

  /** Stands in for the graph card, which takes focus when it mounts and is gone
   * again when the graph is removed. Registered for teardown so a stray
   * focusable node cannot follow one test into the next. */
  const outsideTarget = () => {
    const el = document.createElement("button");
    document.body.appendChild(el);
    strays.push(el);
    return el;
  };

  /** Anchors a second range and moves it, as a keyboard user building a
   * non-contiguous selection does. */
  const buildTwoRanges = (
    ref: React.RefObject<WorkbookInstance>,
    grid: HTMLElement
  ) => {
    ref.current!.focusSpreadsheet();
    fireEvent.keyDown(grid, { key: "F8", code: "F8", shiftKey: true });
    fireEvent.keyDown(grid, { key: "ArrowRight", code: "ArrowRight" });
    expect(ref.current!.getSelection()).toHaveLength(2);
  };

  it("keeps the ranges on the way out, and clears them on the next move back", () => {
    const { ref, grid } = setup();
    const outside = outsideTarget();

    buildTwoRanges(ref, grid);

    // Ending the mode writes to context, so let React flush it.
    act(() => outside.focus());

    // Preserved across the trip: the graph was built from these, and the
    // ticket asks for them to still be selected on arrival.
    expect(ref.current!.getSelection()).toHaveLength(2);

    ref.current!.focusSpreadsheet();
    fireEvent.keyDown(grid, { key: "ArrowDown", code: "ArrowDown" });

    expect(ref.current!.getSelection()).toHaveLength(1);
  });

  it("treats focus falling to the body as a departure", () => {
    // How the reported flow actually ends: the graph card is removed while it
    // holds focus, and the browser reports that as a focusout with a null
    // relatedTarget — the same shape a window blur has. Reading the null alone
    // as "the window went away" would leave the flag set in the one case this
    // handler exists to clear.
    const { ref, grid } = setup();

    buildTwoRanges(ref, grid);
    act(() => {
      fireEvent.blur(grid, { relatedTarget: null });
    });

    ref.current!.focusSpreadsheet();
    fireEvent.keyDown(grid, { key: "ArrowDown", code: "ArrowDown" });

    expect(ref.current!.getSelection()).toHaveLength(1);
  });

  it("keeps the mode when it is the window that lost focus", () => {
    // An alt-tab is not the user going elsewhere in the page, and it should
    // come back to the mode still running. `document.hasFocus()` is what tells
    // it apart from the case above, which arrives in an identical event.
    const { ref, grid } = setup();

    buildTwoRanges(ref, grid);
    const hasFocus = jest.spyOn(document, "hasFocus").mockReturnValue(false);
    act(() => {
      fireEvent.blur(grid, { relatedTarget: null });
    });
    hasFocus.mockReturnValue(true);

    ref.current!.focusSpreadsheet();
    fireEvent.keyDown(grid, { key: "ArrowDown", code: "ArrowDown" });

    // Still carrying the anchored range, not collapsing.
    expect(ref.current!.getSelection()).toHaveLength(2);
  });

  it("stays in the mode while focus is still inside the grid", () => {
    // The select-all corner is focusable and lives under the grid root, as
    // does the hidden input an edit hands off to. Neither is a departure.
    const { ref, container, grid } = setup();
    const corner = container.querySelector(".fortune-left-top") as HTMLElement;

    buildTwoRanges(ref, grid);

    corner.focus();
    ref.current!.focusSpreadsheet();
    fireEvent.keyDown(grid, { key: "ArrowDown", code: "ArrowDown" });

    expect(ref.current!.getSelection()).toHaveLength(2);
  });

  it("without leaving, the arrow keys still move the anchored range", () => {
    // The control for the first case: it is the focus departure that changes
    // the outcome, not the second arrow press.
    const { ref, grid } = setup();

    buildTwoRanges(ref, grid);
    fireEvent.keyDown(grid, { key: "ArrowDown", code: "ArrowDown" });

    expect(ref.current!.getSelection()).toHaveLength(2);
  });
});
