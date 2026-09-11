import { render, fireEvent, act } from "@testing-library/react";
import React from "react";
import Workbook, { WorkbookInstance } from "../src/components/Workbook";

/**
 * What a learner is told when focus arrives back at the grid.
 *
 * The jump itself moves focus without moving the selection, so `#sr-selection`
 * -- built from the selection -- renders the text it already held and never
 * fires. Arrival announced the grid's landmark name and nothing about which
 * cell had been reached, leaving a screen-reader user to discover it with an
 * arrow key (WCAG 4.1.2, 4.1.3).
 */

const tick = () =>
  act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });

const celldata = [
  { r: 0, c: 0, v: { v: 1, m: "1", ct: { fa: "General", t: "n" } } },
  { r: 1, c: 0, v: { v: 2, m: "2", ct: { fa: "General", t: "n" } } },
];

const setup = () => {
  const ref = React.createRef<WorkbookInstance>();
  const { container } = render(
    <Workbook ref={ref} data={[{ name: "Sheet1", celldata } as any]} />
  );
  return {
    ref,
    container,
    cellInput: container.querySelector<HTMLElement>(".luckysheet-cell-input")!,
    region: container.querySelector<HTMLElement>("#sr-spreadsheetFocusReturn")!,
  };
};

const startEditing = async (cellInput: HTMLElement) => {
  cellInput.focus();
  await tick();
  fireEvent.keyDown(cellInput, { key: "F2", keyCode: 113 });
  await tick();
};

/**
 * What the region would actually be read as, with the zero-width space
 * `markAsRepeat` appends stripped — it exists to make the text node differ, not
 * to be spoken. Written as an escape rather than the literal character so the
 * source stays greppable and lint-clean.
 */
const spoken = (region: HTMLElement) =>
  (region.textContent ?? "").replace(/\u200B/g, "");

describe("Arrival at the grid is announced", () => {
  const strays: HTMLElement[] = [];

  afterEach(() => {
    while (strays.length) strays.pop()!.remove();
  });

  const leaveAndReturn = async (ref: React.RefObject<WorkbookInstance>) => {
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    strays.push(outside);
    act(() => outside.focus());
    await tick();
    act(() => {
      ref.current!.focusSpreadsheet();
    });
    await tick();
  };

  it("is a live region that does not take focus", async () => {
    const { region } = setup();
    await tick();

    expect(region).toBeTruthy();
    expect(region.getAttribute("role")).toBe("alert");
    expect(region.hasAttribute("tabindex")).toBe(false);
  });

  it("says nothing before anything has arrived", async () => {
    // A workbook restored mid-session with a non-zero count must not announce
    // on paint.
    const { region } = setup();
    await tick();

    expect(spoken(region)).toBe("");
  });

  it("names the cell and its value on arrival", async () => {
    const { ref, region, cellInput } = setup();
    await tick();
    fireEvent.keyDown(cellInput, { key: "ArrowDown", keyCode: 40 });
    await tick();

    await leaveAndReturn(ref);

    // The same words `#sr-selection` uses for the same cell -- the reference
    // spaced for speech, then the value -- so one location is described one way
    // however it was reached.
    expect(spoken(region)).toBe("A. 2 2");
  });

  it("carries the extent of a multi-cell selection", async () => {
    // The one thing the focus move cannot say: the editor is named for the
    // focus cell alone, so without this a learner returning to a range hears a
    // single cell and has no way to know the rest is still selected.
    const { ref, region } = setup();
    await tick();
    act(() => {
      ref.current!.setSelection([{ row: [0, 1], column: [0, 0] }]);
    });
    await tick();

    await leaveAndReturn(ref);

    expect(spoken(region)).toContain(":");
  });

  it("announces every arrival, including a repeat at the same place", async () => {
    // Two arrivals at an unmoved selection produce identical words. A live
    // region is read from its text *changing*, so without the alternating
    // zero-width space the second would be silent and the learner could not
    // tell whether the jump had worked.
    const { ref, region, cellInput } = setup();
    await tick();
    fireEvent.keyDown(cellInput, { key: "ArrowDown", keyCode: 40 });
    await tick();

    await leaveAndReturn(ref);
    const first = region.textContent;
    await leaveAndReturn(ref);
    const second = region.textContent;

    expect(spoken(region)).toBe("A. 2 2");
    expect(second).not.toBe(first);
  });

  it("stays silent when an edit is open", async () => {
    // Focus landing on the editor already announces the cell, that it is
    // editable, and the text entered so far. A region written in the same
    // moment would only compete with it.
    const { ref, region, cellInput } = setup();
    await startEditing(cellInput);

    await leaveAndReturn(ref);

    expect(spoken(region)).toBe("");
  });

  it("introduces no new translatable text", async () => {
    // The message is the cell reference and the cell's own displayed value.
    // Nothing authored, so nothing to add to the six locale files.
    const { ref, region, cellInput } = setup();
    await tick();
    fireEvent.keyDown(cellInput, { key: "ArrowDown", keyCode: 40 });
    await tick();

    await leaveAndReturn(ref);

    expect(spoken(region)).toBe(
      `${cellInput.getAttribute("aria-label")} ${ref
        .current!.getCellValue(1, 0)
        ?.toString()}`
    );
  });
});
