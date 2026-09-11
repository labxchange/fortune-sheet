import { act, fireEvent, render } from "@testing-library/react";
import React from "react";
import Workbook, { WorkbookInstance } from "../src/components/Workbook";

// Entering the grid used to depend on which direction you arrived from.
//
// The grid root carried `tabIndex={-1}`, so it was not in the tab order at all,
// while the cell editor — permanently mounted, `contenteditable`, and given a
// hardcoded `tabIndex={0}` by `ContentEditable` — was the grid's only forward
// tab stop. Tab from the toolbar therefore ran past the name box and the fx
// input and landed *in a cell*, with a caret and a screen reader announcing an
// editable textbox; Ctrl+Alt+S and Shift+Tab landed on the root, with neither.
// Same region, two states.
//
// Both halves are needed, and the second is the one that is easy to miss: the
// tail of `handleGlobalKeyDown` used to focus the cell editor unconditionally,
// so even after landing on the root correctly, the first arrow key put the
// caret back.

describe("entering the grid lands on one element, in either direction", () => {
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
    const press = async (init: Record<string, unknown>) => {
      await act(async () => {
        fireEvent.keyDown(gridRoot, init);
      });
      await flush();
    };
    return { ref, gridRoot, editor, press };
  };

  it("makes the grid root the tab stop, and the idle cell editor not one", async () => {
    const { gridRoot, editor } = await setup();

    expect(gridRoot.getAttribute("tabindex")).toBe("0");
    // -1, so Tab cannot reach it while no edit is open. This also pins
    // `ContentEditable` forwarding the prop: it used to hardcode `tabIndex={0}`
    // *after* its own prop spread, which silently discarded any value passed
    // in, and this assertion is what goes red if that returns.
    expect(editor.getAttribute("tabindex")).toBe("-1");
  });

  it("keeps the editor programmatically focusable while it is not a tab stop", async () => {
    const { editor } = await setup();

    // tabIndex -1 removes it from the *tab sequence* only. Every route that
    // deliberately puts focus in a cell — starting an edit, committing one, the
    // toolbar's focus return — is a `.focus()` call and must still work.
    act(() => {
      editor.focus();
    });

    expect(document.activeElement).toBe(editor);
  });

  it("leaves focus on the root when an arrow key only moves the selection", async () => {
    const { ref, gridRoot, editor, press } = await setup();

    act(() => {
      gridRoot.focus();
    });
    expect(document.activeElement).toBe(gridRoot);

    await press({ key: "ArrowRight", code: "ArrowRight", keyCode: 39 });

    // The positive control, and the reason the focus assertion below means
    // anything: the selection actually moved, so the handler ran and reached
    // its tail. Without this, "focus did not move into the editor" would pass
    // just as well if the key had been ignored entirely.
    expect(ref.current?.getSelection()).toMatchObject([
      { row: [0, 0], column: [1, 1] },
    ]);
    expect(document.activeElement).toBe(gridRoot);
    expect(document.activeElement).not.toBe(editor);
  });

  it("still moves focus into the editor when a keystroke starts an edit", async () => {
    const { gridRoot, editor, press } = await setup();

    act(() => {
      gridRoot.focus();
    });

    // The counter-path to the case above. The tail was not deleted, it was
    // gated on an edit session existing — type-to-edit sets `luckysheetCellUpdate`
    // before the tail runs, so this still lands in the cell.
    await press({ key: "7", code: "Digit7", keyCode: 55 });

    expect(document.activeElement).toBe(editor);
    // And it becomes a tab stop for the duration of the edit, so Tab out of a
    // cell being edited still behaves as it always did.
    expect(editor.getAttribute("tabindex")).toBe("0");
  });

  it("still moves focus into the editor on F2", async () => {
    const { gridRoot, editor, press } = await setup();

    act(() => {
      gridRoot.focus();
    });

    await press({ key: "F2", code: "F2", keyCode: 113 });

    expect(document.activeElement).toBe(editor);
    expect(editor.getAttribute("tabindex")).toBe("0");
  });
});
