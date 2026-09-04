import { render } from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";

// The in-cell editor is the only element in the DOM that stands for a cell —
// the sheet itself is a canvas — so focus rests on it and it carries the cell's
// name. Declaring `role="textbox"` to make that name announceable also makes a
// promise: that what is typed into it arrives. These pin the state that has to
// travel with the role wherever it does not.

const cellInput = (container: HTMLElement) =>
  container.querySelector<HTMLElement>(".luckysheet-cell-input")!;

const sheet = {
  name: "Sheet1",
  id: "s1",
  row: 10,
  column: 6,
  celldata: [{ r: 0, c: 0, v: { v: "1", m: "1" } }],
};

describe("the cell input's read-only state", () => {
  it("is a plain text field on a workbook that can be edited", () => {
    const { container } = render(<Workbook lang="en" data={[sheet as any]} />);

    expect(cellInput(container).getAttribute("role")).toBe("textbox");
    expect(cellInput(container).getAttribute("aria-readonly")).toBe("false");
  });

  it("reports itself read-only on a read-only workbook", () => {
    // The case the old predicate got wrong, and the one with the clearest
    // failure mode. It read
    //   !((colReadOnly[c] || rowReadOnly[r]) && context.allowEdit === true)
    // so a workbook rendered `allowEdit={false}` with no per-row/column config
    // evaluated `(undefined || undefined) && false` -> falsy -> `edit === true`,
    // and this element announced itself as an editable multi-line field. Every
    // text-entry key meanwhile returns early in `core/events/keyboard.ts` on
    // `!isAllowEdit(ctx)`, so what the user got was a field that swallowed
    // everything they typed while saying it accepted it (WCAG 4.1.2).
    const { container } = render(
      <Workbook lang="en" allowEdit={false} data={[sheet as any]} />
    );

    expect(cellInput(container).getAttribute("role")).toBe("textbox");
    expect(cellInput(container).getAttribute("aria-readonly")).toBe("true");
  });

  it("reports itself read-only on a read-only row", () => {
    // The case the old expression did answer, kept so the new predicate cannot
    // lose it: `isAllowEdit` folds row and column read-only in alongside
    // `allowEdit` and cell locking.
    const { container } = render(
      <Workbook
        lang="en"
        data={[{ ...sheet, config: { rowReadOnly: { 0: 1 } } } as any]}
      />
    );

    expect(cellInput(container).getAttribute("aria-readonly")).toBe("true");
  });

  it("keeps its name either way, because focus still rests here", () => {
    // Dropping the role and the name on a read-only cell would leave focus on
    // an unnamed generic div, which is the defect the name was added to fix. A
    // read-only textbox is still a textbox.
    const { container } = render(
      <Workbook lang="en" allowEdit={false} data={[sheet as any]} />
    );

    expect(cellInput(container).getAttribute("aria-label")).toBeTruthy();
  });
});
