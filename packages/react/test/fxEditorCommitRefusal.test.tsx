import { render, fireEvent } from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";

// The formula bar is the THIRD path that commits an edit and then moves the
// caret. The grid's Enter and Tab branches (`core/events/keyboard.ts`) were
// taught to hold the caret when data verification refuses the write; this one
// was not, so the reported defect stayed reachable from the formula bar --
// same rejection, same warning dialog, caret still stepping down.
//
// The counter-path for T23: the core suite drives `handleGlobalEnter` and
// `handleGlobalKeyDown` directly, i.e. the grid's own routes. This drives the
// formula bar's `onKeyDown`, which reaches `updateCell` through its own
// `setContext` producer and never touches those functions.
describe("Formula bar commit refused by data verification", () => {
  // `type: "dropdown"` with `prohibitInput`, matching the core fixture: its
  // failure text is a fixed string, so no `optionLabel_*` table is needed.
  const setup = () => {
    const { container } = render(
      <Workbook
        lang="en"
        data={[
          {
            name: "Sheet1",
            id: "s1",
            row: 10,
            column: 8,
            celldata: [
              { r: 0, c: 0, v: { v: "yes", m: "yes" } },
              { r: 1, c: 0, v: { v: "yes", m: "yes" } },
            ],
            dataVerification: {
              "0_0": {
                type: "dropdown",
                value1: "yes,no",
                prohibitInput: true,
              },
            },
          },
        ]}
      />
    );
    const fx = container.querySelector<HTMLElement>(
      "#luckysheet-functionbox-cell"
    )!;
    const nameBox = () =>
      container.querySelector<HTMLInputElement>(".fortune-name-box")!;
    return { container, fx, nameBox };
  };

  const commitFromFormulaBar = (fx: HTMLElement, text: string) => {
    // Pointer-then-focus is what opens an edit session from the formula bar;
    // a bare focus deliberately does not (see fxEditorEntry.test.tsx).
    fireEvent.pointerDown(fx);
    fireEvent.focus(fx);
    fx.innerText = text;
    fireEvent.input(fx);
    fireEvent.keyDown(fx, { key: "Enter", code: "Enter" });
  };

  // Positive control, and it runs first on purpose: if the formula bar stopped
  // committing at all, the refusal case below would pass for the wrong reason.
  it("still steps down when the value is accepted", () => {
    const { fx, nameBox } = setup();
    expect(nameBox().value).toBe("A1");

    commitFromFormulaBar(fx, "no");

    expect(nameBox().value).toBe("A2");
  });

  it("leaves the caret on the refused cell", () => {
    const { fx, nameBox } = setup();
    expect(nameBox().value).toBe("A1");

    commitFromFormulaBar(fx, "maybe");

    expect(nameBox().value).toBe("A1");
  });

  // Paired with the assertion above so it cannot pass against a formula bar
  // that refuses every write: the cell must be genuinely unwritten, and the
  // user must have been told why.
  it("does not write the refused value, and warns", () => {
    const { container, fx } = setup();

    commitFromFormulaBar(fx, "maybe");

    expect(container.querySelector(".fortune-message-box")).toBeTruthy();
    expect(fx.innerText).not.toBe("");
  });
});
