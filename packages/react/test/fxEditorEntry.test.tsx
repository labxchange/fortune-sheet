import { render, fireEvent } from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";

// Focusing the formula bar used to start a cell edit unconditionally, so a
// keyboard user tabbing *past* it opened an edit session that never closed —
// the grid was then in edit mode from the very next tab stop onwards, with a
// caret on whatever they reached. Verified in a real browser: edit mode turned
// on at the first Tab out of the formula bar, three stops before the cell input.
//
// Edit mode is read off the input box's z-index, which is the component's own
// expression of the state (`_.isEmpty(luckysheetCellUpdate) ? -1 : 19`) and the
// same signal the browser investigation measured.
describe("Formula bar entry does not start an edit", () => {
  const setup = () => {
    const { container } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    const fx = container.querySelector<HTMLElement>(
      "#luckysheet-functionbox-cell"
    )!;
    const inputBox = container.querySelector<HTMLElement>(
      ".luckysheet-input-box"
    )!;
    const isEditing = () =>
      (inputBox.getAttribute("style") || "").includes("z-index: 19");
    return { container, fx, isEditing };
  };

  it("does not start an edit when focus arrives from the keyboard", () => {
    const { fx, isEditing } = setup();

    fireEvent.focus(fx);

    expect(isEditing()).toBe(false);
  });

  it("starts an edit when the user points at it", () => {
    const { fx, isEditing } = setup();

    // A real click delivers pointerdown before focus; that ordering is what
    // distinguishes "I clicked in here to edit" from "focus passed through".
    fireEvent.pointerDown(fx);
    fireEvent.focus(fx);

    expect(isEditing()).toBe(true);
  });

  it("starts an edit on the first character typed after tabbing in", () => {
    const { fx, isEditing } = setup();

    fireEvent.focus(fx);
    expect(isEditing()).toBe(false);

    fireEvent.keyDown(fx, { key: "7", code: "Digit7", keyCode: 55 });

    expect(isEditing()).toBe(true);
  });

  it("does not start an edit on a navigation key", () => {
    const { fx, isEditing } = setup();

    fireEvent.focus(fx);
    fireEvent.keyDown(fx, { key: "Tab", code: "Tab", keyCode: 9 });
    expect(isEditing()).toBe(false);

    fireEvent.keyDown(fx, {
      key: "ArrowRight",
      code: "ArrowRight",
      keyCode: 39,
    });
    expect(isEditing()).toBe(false);
  });

  it("does not start an edit on a modified key", () => {
    const { fx, isEditing } = setup();

    fireEvent.focus(fx);
    fireEvent.keyDown(fx, {
      key: "c",
      code: "KeyC",
      keyCode: 67,
      ctrlKey: true,
    });

    expect(isEditing()).toBe(false);
  });

  it("leaves the pointer flag clean, so a later keyboard entry still defers", () => {
    const { container, fx, isEditing } = setup();
    const cellInput = container.querySelector<HTMLElement>(
      "#luckysheet-rich-text-editor"
    )!;

    // Point at it, edit, then end the edit and leave. Blurring the formula bar
    // is deliberately not enough on its own — it does not close an open edit,
    // which is why the reset goes through Escape on the cell input.
    fireEvent.pointerDown(fx);
    fireEvent.focus(fx);
    expect(isEditing()).toBe(true);

    fireEvent.keyDown(cellInput, {
      key: "Escape",
      code: "Escape",
      keyCode: 27,
    });
    fireEvent.blur(fx);
    expect(isEditing()).toBe(false);

    // Arriving again by keyboard must not replay the mouse behaviour: a stale
    // flag here would reintroduce the defect for anyone who had clicked once.
    fireEvent.focus(fx);

    expect(isEditing()).toBe(false);
  });
});
