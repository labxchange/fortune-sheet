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

  it("starts an edit when pasted text arrives, even though Ctrl+V never passes isTextProducingKey", () => {
    const { fx, isEditing } = setup();

    fireEvent.focus(fx);
    expect(isEditing()).toBe(false);

    // A real paste fires a modified keydown (ctrlKey, so isTextProducingKey
    // rejects it) and then the browser mutates the DOM directly -- the
    // content change itself, not the keydown, is what onChange has to open an
    // edit session on. jsdom doesn't implement `.innerText` as a live
    // reflection of the DOM (it's a plain expando once assigned), so both are
    // set here: `innerHTML` is what ContentEditable's change detection reads,
    // `innerText` is what handleFormulaInput reads once onChange runs.
    fireEvent.keyDown(fx, {
      key: "v",
      code: "KeyV",
      keyCode: 86,
      ctrlKey: true,
    });
    fx.innerHTML = "pasted value";
    fx.innerText = "pasted value";
    fireEvent.input(fx);

    expect(isEditing()).toBe(true);
  });

  it("returns before the kcode-gated mirror can run a stale second handleFormulaInput pass", () => {
    const { container, fx, isEditing } = setup();
    const cellInput = container.querySelector<HTMLElement>(
      "#luckysheet-rich-text-editor"
    )!;

    fireEvent.focus(fx);
    expect(isEditing()).toBe(false);

    // Manufacture a stale recentText: a real keydown captures the editor's
    // current text before this key's own effect applies, so this Ctrl+V sets
    // recentText.current to "=OLD" -- exactly the `preText` a second,
    // kcode-gated handleFormulaInput pass would use if the fallback below did
    // not `return` before reaching it.
    fx.innerHTML = "=OLD";
    fx.innerText = "=OLD";
    fireEvent.keyDown(fx, {
      key: "v",
      code: "KeyV",
      keyCode: 86,
      ctrlKey: true,
    });

    // The paste changes the content to something with a character
    // escapeHTMLTag treats differently ("<"), and to something that does not
    // start with "=" -- the one case the two passes disagree on. This pass
    // (preText omitted, so value1txt === value) takes the plain-mirror
    // branch and escapes it. A stale second pass (value1txt = "=OLD", which
    // *does* start with "=") would instead take handleFormulaInput's
    // "transitioning out of formula" branch, which writes $copyTo.innerHTML
    // = value **unescaped** -- overwriting this pass's correctly-escaped
    // result with raw "A<B" markup.
    fx.innerHTML = "A<B";
    fx.innerText = "A<B";
    fireEvent.input(fx);

    expect(isEditing()).toBe(true);
    expect(cellInput.innerHTML).toBe("A&lt;B");
  });

  it("starts an edit on a composed IME character, whose keydown key is not a producible character", () => {
    const { fx, isEditing } = setup();

    fireEvent.focus(fx);
    expect(isEditing()).toBe(false);

    // During composition the keydown key is the pseudo-key "Process"
    // (keyCode 229), which isTextProducingKey's single-character check
    // rejects -- the composed text still has to open an edit session once it
    // actually lands.
    fireEvent.keyDown(fx, { key: "Process", keyCode: 229 });
    fx.innerHTML = "こんにちは";
    fx.innerText = "こんにちは";
    fireEvent.input(fx);

    expect(isEditing()).toBe(true);
  });

  it("mirrors a context-menu paste into the grid's cell input, even with no preceding keydown at all", () => {
    const { container, fx, isEditing } = setup();
    const cellInput = container.querySelector<HTMLElement>(
      "#luckysheet-rich-text-editor"
    )!;

    fireEvent.focus(fx);
    expect(isEditing()).toBe(false);

    // A context-menu paste (or a drop) fires no keydown at all -- unlike
    // Ctrl+V, lastKeyDownEventRef.current is still null when onChange runs,
    // so the kcode-gated mirror below can't be relied on to sync the grid's
    // own cell-input overlay. Without a direct mirror, the formula bar would
    // show the new text while the grid still shows whatever was there before.
    fx.innerHTML = "pasted from the menu";
    fx.innerText = "pasted from the menu";
    fireEvent.input(fx);

    expect(isEditing()).toBe(true);
    expect(cellInput.innerHTML).toContain("pasted from the menu");
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
