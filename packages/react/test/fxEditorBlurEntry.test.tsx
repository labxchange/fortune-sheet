import { render, act, fireEvent } from "@testing-library/react";
import React from "react";
import Workbook, { WorkbookInstance } from "../src/components/Workbook";
import ContentEditable from "../src/components/SheetOverlay/ContentEditable";

/**
 * Leaving the formula bar without having typed in it must not start an edit.
 *
 * It did, and the cost landed on the grid rather than on the formula bar: with
 * an edit session open, `onGridFocus` forwards focus off the grid root and into
 * the cell input, so the next Tab stop showed its focus ring for one frame and
 * then handed focus to a caret inside the cell. The arrow keys from there walked
 * that caret through the text instead of moving the selection — `handleArrowKey`
 * returns early while `luckysheetCellUpdate` is non-empty — so the name box
 * never changed. Reported as "arrow keys put the cell into edit mode"; the
 * arrows were the symptom and the Tab out of the formula bar was the cause.
 *
 * The blur path is guarded by comparing the markup against `lastHtml`, which is
 * exactly the right test and was reading a stale baseline: `lastHtml` is written
 * only by `fnEmitChange`, while the formula bar's content is assigned directly
 * whenever the selected cell changes, and assigning `innerHTML` raises no
 * `input`. So the ref still held a previous session's string — `""` at mount —
 * and the comparison reported a change nobody made.
 *
 * Edit mode is read off the input box's z-index, the component's own expression
 * of the state (`_.isEmpty(luckysheetCellUpdate) ? -1 : 19`), matching the
 * sibling tests and the signal the browser investigation measured.
 */
describe("Leaving the formula bar does not start an edit", () => {
  const A1 = "less_18";
  const B1 = "more_65";

  const sheet = {
    name: "Sheet1",
    id: "s1",
    celldata: [
      { r: 0, c: 0, v: { v: A1, m: A1 } },
      { r: 0, c: 1, v: { v: B1, m: B1 } },
    ],
    row: 10,
    column: 10,
  };

  let ref: React.RefObject<WorkbookInstance>;
  let container: HTMLElement;

  const fxInput = () =>
    container.querySelector<HTMLElement>("#luckysheet-functionbox-cell")!;
  const cellInput = () =>
    container.querySelector<HTMLElement>("#luckysheet-rich-text-editor")!;
  const isEditing = () =>
    (
      container
        .querySelector<HTMLElement>(".luckysheet-input-box")!
        .getAttribute("style") || ""
    ).includes("z-index: 19");

  const select = (column: number) => {
    act(() => {
      ref.current?.setSelection([{ row: [0, 0], column: [column, column] }]);
    });
  };

  beforeEach(() => {
    ref = React.createRef<WorkbookInstance>();
    container = render(
      <Workbook ref={ref} lang="en" data={[sheet as any]} />
    ).container;
    select(0);
  });

  it("shows the selected cell's value in the formula bar", () => {
    // Guards the fixture: an empty formula bar would make the cases below pass
    // for the wrong reason, because the stale baseline is itself "".
    expect(fxInput().innerText || fxInput().textContent).toBe(A1);
  });

  it("does not start an edit when focus passes through without typing", () => {
    fireEvent.focus(fxInput());
    expect(isEditing()).toBe(false);

    fireEvent.blur(fxInput());

    expect(isEditing()).toBe(false);
  });

  it("does not start one after the selection moves to a cell with different content", () => {
    // The baseline has to be re-taken on every arrival, not seeded once. The
    // first blur below writes `lastHtml`, and changing cells then rewrites the
    // formula bar behind its back — which is precisely how the ref went stale
    // in the first place, so a fix that only covers the first visit re-breaks
    // here, on the second.
    fireEvent.focus(fxInput());
    fireEvent.blur(fxInput());
    expect(isEditing()).toBe(false);

    select(1);
    expect(fxInput().innerText || fxInput().textContent).toBe(B1);

    fireEvent.focus(fxInput());
    fireEvent.blur(fxInput());

    expect(isEditing()).toBe(false);
  });

  it("still starts an edit when the user typed before leaving", () => {
    // The guard covers "nothing happened", not "leaving". Content that really
    // did change still has to open a session and reach the grid's cell input,
    // or the keystrokes are dropped on the way out.
    fireEvent.focus(fxInput());
    fireEvent.keyDown(fxInput(), { key: "9", code: "Digit9", keyCode: 57 });
    expect(isEditing()).toBe(true);

    fireEvent.blur(fxInput());

    expect(isEditing()).toBe(true);
    expect(cellInput().innerHTML).toContain(A1);
  });

  it("still starts an edit for a paste that arrives with no keydown at all", () => {
    // A context-menu paste or a drop produces a content change and nothing
    // else, so the `input` path is the only signal it has. Taking a baseline on
    // focus must not reach that path — `fnEmitChange` applies the unchanged
    // test to blur alone — and the pasted text must survive the blur that
    // follows it.
    fireEvent.focus(fxInput());
    expect(isEditing()).toBe(false);

    fxInput().innerHTML = "pasted value";
    fxInput().innerText = "pasted value";
    fireEvent.input(fxInput());
    expect(isEditing()).toBe(true);

    fireEvent.blur(fxInput());

    expect(isEditing()).toBe(true);
    expect(cellInput().innerHTML).toContain("pasted value");
  });

  it("passes the focus event on to the caller's own handler", () => {
    // `onFocus` is wrapped now, so it no longer reaches the element through the
    // prop spread and has to be forwarded by hand. Two callers pass one and
    // would fail silently: FxEditor's decides whether this focus is a click
    // that should start an edit, and NotationBoxes' records which comment box
    // is being edited, with no other way to learn it.
    const onFocus = jest.fn();
    const { container: local } = render(
      <ContentEditable id="ce-passthrough" onFocus={onFocus} />
    );

    fireEvent.focus(local.querySelector<HTMLElement>("#ce-passthrough")!);

    expect(onFocus).toHaveBeenCalledTimes(1);
  });
});
