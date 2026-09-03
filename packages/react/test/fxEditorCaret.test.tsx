import { render, act, fireEvent } from "@testing-library/react";
import React from "react";
import Workbook, { WorkbookInstance } from "../src/components/Workbook";

/**
 * Where the caret lands when the formula bar ("Current cell input") takes
 * focus.
 *
 * It landed at offset 0, in front of the existing value, so continuing an edit
 * meant first travelling to the end — by End, or by arrowing through the whole
 * string with a screen reader reading every character (WCAG 2.4.3). Nothing
 * placed it: `moveToEnd` is called from `InputBox` alone, and only when
 * `globalCache.doNotFocus` is unset — which `FxEditor.onFocus` sets, on purpose,
 * to stop the cell input pulling focus back out of the formula bar. So the
 * caret was left wherever the browser puts it in a freshly focused
 * contenteditable, which is the start.
 *
 * jsdom does not reproduce that default — it leaves a focused contenteditable
 * with no selection at all — so these read the caret through a range rather
 * than trusting an offset, and the pre-fix state shows up as "no caret" rather
 * than "caret at 0". Either way it is not the end, which is what is asserted.
 */
describe("Current cell input caret", () => {
  const VALUE = "convinient";

  // H3, the cell in the bug report.
  const sheet = {
    name: "Sheet1",
    id: "s1",
    celldata: [{ r: 2, c: 7, v: { v: VALUE, m: VALUE } }],
    row: 10,
    column: 10,
  };

  let ref: React.RefObject<WorkbookInstance>;
  let container: HTMLElement;

  const fxInput = () =>
    container.querySelector<HTMLElement>("#luckysheet-functionbox-cell")!;

  /**
   * The caret's offset in characters from the start of the formula bar's
   * content, or -1 when there is no collapsed caret in it.
   *
   * Measured by spanning a range from the start of the content to the caret and
   * taking its text length, rather than reading `anchorOffset` directly: the
   * same caret position is expressible as either `(textNode, 10)` or
   * `(container, 1)`, and `moveToEnd` produces one or the other depending on
   * which of its two branches runs. This is indifferent to that.
   */
  const caretOffset = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount !== 1) return -1;
    const range = selection.getRangeAt(0);
    if (!range.collapsed) return -1;
    if (!fxInput().contains(range.startContainer)) return -1;
    const upToCaret = document.createRange();
    upToCaret.selectNodeContents(fxInput());
    upToCaret.setEnd(range.startContainer, range.startOffset);
    return upToCaret.toString().length;
  };

  beforeEach(() => {
    window.getSelection()?.removeAllRanges();
    ref = React.createRef<WorkbookInstance>();
    const view = render(<Workbook ref={ref} lang="en" data={[sheet as any]} />);
    container = view.container;
    act(() => {
      ref.current?.setSelection([{ row: [2, 2], column: [7, 7] }]);
    });
  });

  it("shows the cell's value in the formula bar", () => {
    // Guards the fixture rather than the fix: every case below asserts a
    // position *within* this value, so an empty field would make them pass for
    // the wrong reason.
    expect(fxInput().innerText || fxInput().textContent).toBe(VALUE);
  });

  it("puts the caret at the end of the value when focus arrives", () => {
    act(() => {
      fxInput().focus();
    });

    expect(caretOffset()).toBe(VALUE.length);
  });

  it("leaves the caret alone when focus arrives from a pointer", () => {
    // A click carries its own caret position — the character the user aimed at
    // — and the browser applies it as the default action of the mousedown,
    // after the focus event has been dispatched. Forcing the end on every focus
    // would therefore throw away the click target and make the formula bar
    // impossible to click into mid-word, so pointer focus is left untouched.
    //
    // jsdom performs no such placement, so what this can assert is the half
    // that belongs to this component: focus preceded by a mousedown must not
    // move the caret itself.
    fireEvent.mouseDown(fxInput());
    act(() => {
      fxInput().focus();
    });

    expect(caretOffset()).not.toBe(VALUE.length);
  });

  it("puts the caret at the end again on a later keyboard focus", () => {
    // The pointer flag must not latch. A mousedown that is never followed by a
    // matching focus — a click on an already-focused field, or one that ends up
    // somewhere else entirely — would otherwise leave the next Tab into the
    // formula bar behaving like a click, which is the original bug back again
    // and only on the second visit.
    fireEvent.mouseDown(fxInput());
    act(() => {
      fxInput().focus();
    });
    act(() => {
      fxInput().blur();
    });

    act(() => {
      fxInput().focus();
    });

    expect(caretOffset()).toBe(VALUE.length);
  });

  it("does not place a caret when there is nothing to edit", () => {
    // An empty cell: `moveToEnd`'s own guard treats "" specially, and the
    // formula bar is emptied by the same effect that fills it. Focusing must
    // not throw.
    act(() => {
      ref.current?.setSelection([{ row: [5, 5], column: [5, 5] }]);
    });

    expect(() => {
      act(() => {
        fxInput().focus();
      });
    }).not.toThrow();
    expect(caretOffset()).toBeLessThanOrEqual(0);
  });
});
