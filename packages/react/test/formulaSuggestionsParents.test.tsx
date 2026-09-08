import React from "react";
import { render, fireEvent } from "@testing-library/react";
import Workbook from "../src/components/Workbook";

// Counts the typing pipeline, so an accept can be asserted NOT to re-enter it.
// Everything else in core is the real implementation.
const formulaInputCalls = { n: 0 };
jest.mock("@fortune-sheet/core", () => {
  // A proxy, not a spread: core's build exposes its exports as getters, and
  // spreading them into a fresh object drops the interop the bundle relies on
  // (`getSheetIndex is not a function` on the very first render).
  const actual: any = jest.requireActual("@fortune-sheet/core");
  return new Proxy(actual, {
    get(target, prop) {
      if (prop === "handleFormulaInput") {
        return (...args: any[]) => {
          formulaInputCalls.n += 1;
          return target.handleFormulaInput(...args);
        };
      }
      return target[prop];
    },
  });
});

// `FormulaSearch` has two parents, and which editor an accept writes into is
// the parent's answer, not the list's. `InputBox` renders it under the cell,
// where the editor is `cellInput`; `FxEditor` renders the same component under
// the formula bar, where it is `fxInput`.
//
// Reading `refs.cellInput` from inside the component made the bar's list write
// into the cell — and, because `acceptFormulaSuggestion` ends in `moveToEnd`,
// whose first branch calls `focus()`, it also moved focus out of the field
// being typed in. `preventDefault` on the mousedown stops the browser moving
// focus; it cannot stop a programmatic `focus()`. Nothing announced the move
// (WCAG 2.4.3).
//
// Driven through the real `<Workbook>` on purpose: the defect was in what each
// render site passes, so a test that hands `FormulaSearch` its props directly
// could not have caught it.
describe("formula suggestions: which editor each parent accepts into", () => {
  const setup = () => {
    const { container } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    const fx = container.querySelector<HTMLElement>(
      "#luckysheet-functionbox-cell"
    )!;
    const cell = container.querySelector<HTMLElement>(
      "#luckysheet-rich-text-editor"
    )!;
    return { container, fx, cell };
  };

  /** Type a formula fragment into a contenteditable the way the editors see it. */
  const type = (editor: HTMLElement, text: string) => {
    fireEvent.keyDown(editor, { key: "R", code: "KeyR", keyCode: 82 });
    editor.textContent = text;
    fireEvent.input(editor);
  };

  const options = () =>
    Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'));

  it("accepts the bar's list into the bar, and leaves focus there", () => {
    const { fx, cell } = setup();

    fireEvent.pointerDown(fx);
    fireEvent.focus(fx);
    fx.focus();
    type(fx, "=AVER");

    const average = options().find((o) => o.dataset.func === "AVERAGE");
    expect(average).toBeTruthy();

    const inputs: string[] = [];
    const record = (e: Event) =>
      inputs.push((e.target as HTMLElement).innerText);
    document.addEventListener("input", record);
    fireEvent.mouseDown(average!);
    document.removeEventListener("input", record);

    // The accept closes the list. Also the observable end of the second
    // `handleFormulaInput` the announcement would otherwise trigger here: the
    // bar's `onChange` is a new reader of that `input` event now that the bar
    // accepts into itself, and without `ignoreNextInput` it re-enters the
    // kcode gate with the stale keydown and re-derives the editor from text
    // that has already been replaced.
    expect(document.querySelector('[role="listbox"]')).toBeNull();

    // The field the user was typing in keeps focus and holds the result...
    expect(document.activeElement).toBe(fx);
    expect(fx.innerText).toBe("=AVERAGE(");
    // ...and the cell is the mirror, not the target.
    expect(cell.innerText).toBe("=AVERAGE(");
    // Exactly one announcement to the host, carrying the accepted text — the
    // signal a consuming app validates an in-progress formula against.
    expect(inputs).toEqual(["=AVERAGE("]);
  });

  // The `input` event an accept dispatches for the host's benefit reaches the
  // bar's own `onChange` now that the bar accepts into itself. Without
  // `ignoreNextInput` it falls through to the kcode gate carrying the last
  // typed character's code and runs the typing pipeline a second time for a
  // change that is already complete — a whole identifier replaced at once,
  // which is precisely the multi-character diff `handleFormulaInput`'s caret
  // restore cannot survive. jsdom shows no symptom (there is no real caret to
  // corrupt), so this asserts the re-entry itself rather than its consequence.
  it("does not re-run the typing pipeline on the accept's announcement", () => {
    const { fx } = setup();

    fireEvent.pointerDown(fx);
    fireEvent.focus(fx);
    fx.focus();
    type(fx, "=AVER");

    const average = options().find((o) => o.dataset.func === "AVERAGE");
    const before = formulaInputCalls.n;

    fireEvent.mouseDown(average!);

    expect(formulaInputCalls.n).toBe(before);
  });

  it("accepts the cell's list into the cell", () => {
    const { fx, cell } = setup();

    cell.focus();
    type(cell, "=AVER");

    const average = options().find((o) => o.dataset.func === "AVERAGE");
    expect(average).toBeTruthy();

    fireEvent.mouseDown(average!);

    expect(document.activeElement).toBe(cell);
    expect(cell.innerText).toBe("=AVERAGE(");
    expect(fx.innerText).toBe("=AVERAGE(");
  });
});
