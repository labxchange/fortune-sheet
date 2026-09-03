import { render, fireEvent, act } from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";

// Tab while editing has two jobs, and exactly one of them may run per
// keystroke: accept the highlighted formula suggestion, or commit the edit and
// move to the next cell. InputBox used to take the key unconditionally, which
// made Tab dead in edit mode whenever no suggestion was open.
describe("Tab while a cell is being edited", () => {
  const setup = () => {
    const { container } = render(
      <Workbook lang="en" data={[{ name: "Sheet1" } as any]} />
    );
    const cellInput = container.querySelector<HTMLElement>(
      "#luckysheet-rich-text-editor"
    )!;
    const fx = container.querySelector<HTMLElement>(
      "#luckysheet-functionbox-cell"
    )!;
    // Start a real edit the way pointing at the formula bar does.
    act(() => {
      fireEvent.pointerDown(fx);
      fireEvent.focus(fx);
    });
    return { container, cellInput };
  };

  const createTab = () =>
    new KeyboardEvent("keydown", {
      key: "Tab",
      code: "Tab",
      bubbles: true,
      cancelable: true,
    });

  /** Stand in for an open suggestion list with a highlighted entry. */
  const openSuggestion = () => {
    const item = document.createElement("div");
    item.className = "luckysheet-formula-search-item-active";
    const name = document.createElement("div");
    name.className = "luckysheet-formula-search-func";
    name.textContent = "SUM";
    item.appendChild(name);
    document.body.appendChild(item);
    return () => item.remove();
  };

  it("is left to the grid when no suggestion is open", () => {
    const { cellInput } = setup();

    const event = createTab();
    cellInput.dispatchEvent(event);

    // InputBox must not consume it: swallowing the key here is what stopped
    // the grid ever seeing it.
    expect(event.defaultPrevented).toBe(false);
  });

  it("is consumed when a suggestion is open, so the cell does not also move", () => {
    const { cellInput } = setup();
    const close = openSuggestion();

    const event = createTab();
    cellInput.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    close();
  });

  it("is left to the grid when the active item has no function-name node", () => {
    const { cellInput } = setup();
    // An "active" suggestion item that selectActiveFormula has nothing to act
    // on -- the same latent mismatch openSuggestion's real case hides. If
    // consuming Tab here ever drifted back to matching on the active item
    // alone rather than on selectActiveFormula's own answer, this would
    // swallow the key with no effect: the dead-Tab-in-edit-mode bug this
    // whole feature exists to fix, reached by a narrower route.
    const item = document.createElement("div");
    item.className = "luckysheet-formula-search-item-active";
    document.body.appendChild(item);

    const event = createTab();
    cellInput.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    item.remove();
  });

  // The grid side of Tab -- moving the selection, and committing an open edit
  // before it does -- is covered directly in
  // packages/core/test/events/keyboard.test.js ("tab in edit mode"), where
  // handleGlobalKeyDown is invoked without the react layer in between. Asserting
  // it again from here would be testing jsdom's event plumbing, not the grid.
});
