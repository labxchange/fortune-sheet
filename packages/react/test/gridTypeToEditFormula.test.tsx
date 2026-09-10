import { act, fireEvent, render } from "@testing-library/react";
import React from "react";
import Workbook, { WorkbookInstance } from "../src/components/Workbook";

// Typing "=" in a cell has two halves, in two layers, and they were only ever
// connected by luck.
//
// Core's type-to-edit branch opens the edit session and focuses the editor, but
// it runs *before* the browser has inserted the character, so the editor is
// still empty and nothing about the formula can be known yet. The pass that
// tokenises the text, mirrors it into the formula bar and arms point mode is
// `handleFormulaInput`, driven by the `input` event that follows -- and
// `InputBox.onChange` would only run it if it could identify the keystroke
// behind that event, which it did by remembering keydowns *it* had received.
//
// It receives none for type-to-edit. The keydown goes to whatever has focus in
// the grid, and once the grid root became the grid's tab stop (so that Tab no
// longer parks a caret in a cell) that is not the editor. Its remembered key
// was then either nothing at all, or the previous edit session's -- typically
// the `Enter` that committed it, which its own gate filters out as a
// non-character. Either way the first character of the edit never reached the
// pipeline, and for "=" that character is the entire formula: the cell showed
// a bare "=", the formula bar stayed empty, and no arrow key could pick a
// reference because nothing had told core a formula was being written.
//
// It survived review because every existing test dispatches its keydown at the
// editor, which is the one route that was never broken.

describe("typing a formula into a cell from the grid", () => {
  const flush = async () => {
    await act(async () => {
      await Promise.resolve();
    });
  };

  const setup = async () => {
    const ref = React.createRef<WorkbookInstance>();
    const { container } = render(
      <Workbook
        ref={ref}
        lang="en"
        data={[{ name: "Sheet1", id: "s1", row: 10, column: 6 }]}
      />
    );
    await flush();

    const gridRoot = container.querySelector<HTMLElement>(
      ".fortune-sheet-overlay"
    )!;
    const editor = container.querySelector<HTMLElement>(
      "#luckysheet-rich-text-editor"
    )!;
    const fx = container.querySelector<HTMLElement>(
      "#luckysheet-functionbox-cell"
    )!;

    await act(async () => {
      ref.current?.setSelection([{ row: [1, 1], column: [0, 0] }]);
    });
    await flush();

    return { ref, gridRoot, editor, fx };
  };

  /**
   * A whole keystroke, in the order a browser produces one: the key is
   * dispatched to whatever holds focus, and only afterwards is the character
   * inserted into the editor and `input` fired. `target` is the point of the
   * test -- the grid root and the editor are different answers.
   */
  const type = async (
    target: HTMLElement,
    editor: HTMLElement,
    text: string
  ) => {
    await act(async () => {
      fireEvent.keyDown(target, { key: "=", code: "Equal", keyCode: 187 });
    });
    await flush();
    await act(async () => {
      editor.textContent = text;
      fireEvent.input(editor);
    });
    await flush();
  };

  it("processes the first character of an edit started from the grid root", async () => {
    const { gridRoot, editor, fx } = await setup();

    await type(gridRoot, editor, "=");

    // Tokenised markup rather than the raw character: `handleFormulaInput`
    // rebuilding the text into spans is what proves the pipeline ran, and the
    // empty formula bar is the half the reporter could see.
    expect(editor.innerHTML).toContain("<span");
    expect(editor.innerText).toBe("=");
    expect(fx.innerText).toBe("=");
  });

  it("processes it again on the next cell, after an Enter commit", async () => {
    // The reported shape, and the one a single-shot test misses: the first
    // formula of a session worked (focus was in the editor, because a click
    // puts it there), and every one after it did not. By this point the
    // editor's own last keydown is the `Enter` that committed the previous
    // cell -- keyCode 13, which the character gate drops -- so a handler that
    // trusts it is worse off than one with no key at all.
    const { gridRoot, editor, fx } = await setup();

    await type(editor, editor, "=");
    await act(async () => {
      fireEvent.keyDown(editor, { key: "Enter", code: "Enter", keyCode: 13 });
    });
    await flush();

    await type(gridRoot, editor, "=");

    // Tokenised markup rather than the raw character: `handleFormulaInput`
    // rebuilding the text into spans is what proves the pipeline ran, and the
    // empty formula bar is the half the reporter could see.
    expect(editor.innerHTML).toContain("<span");
    expect(editor.innerText).toBe("=");
    expect(fx.innerText).toBe("=");
  });

  it("processes a second formula when every keystroke reaches the editor", async () => {
    // Isolates the second cause from the first, on the one route that existed
    // before the grid root became the tab stop: the keydown lands on the
    // editor, so `lastKeyDownEventRef` is fresh and the key is attributed
    // correctly. All that is left to drop the keystroke is `ContentEditable`
    // suppressing it as unchanged markup -- the editor was cleared between the
    // two edits, so the second "=" reproduces the string recorded during the
    // first, and every formula begins with one.
    //
    // Written this way so it can be run against `origin/master` to say whether
    // that cause is a regression or predates the branch.
    const { editor, fx } = await setup();

    await type(editor, editor, "=");
    await act(async () => {
      fireEvent.keyDown(editor, { key: "Enter", code: "Enter", keyCode: 13 });
    });
    await flush();

    await type(editor, editor, "=");

    expect(editor.innerHTML).toContain("<span");
    expect(editor.innerText).toBe("=");
    expect(fx.innerText).toBe("=");
  });

  it("still processes a keystroke that does reach the editor", async () => {
    // The mouse route: `onMouseDown` focuses the editor, so the keydown lands
    // there and `InputBox` sees it itself. This is the path that was working,
    // and the handoff must not displace it.
    const { editor, fx } = await setup();

    await type(editor, editor, "=");

    // Tokenised markup rather than the raw character: `handleFormulaInput`
    // rebuilding the text into spans is what proves the pipeline ran, and the
    // empty formula bar is the half the reporter could see.
    expect(editor.innerHTML).toContain("<span");
    expect(editor.innerText).toBe("=");
    expect(fx.innerText).toBe("=");
  });
});
