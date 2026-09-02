import { render, fireEvent, act } from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";

// A computed cell announces its result and nothing else, so "3" sounds exactly
// like a 3 somebody typed. A sighted user has the formula bar and the sheet's own
// cues; a screen-reader user has neither, and cannot tell a derived value from a
// literal one before deciding whether to overwrite it (WCAG 1.3.1, 4.1.2).
//
// The marker has to reach both channels, because they speak in different
// situations: `#sr-selection` is an alert tied to the selection *changing*, and
// the cell input's name is what is read when focus arrives without the selection
// moving — back from the formula bar, or when the user asks what is focused.

const tick = () =>
  act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });

// A1 and A2 are typed numbers; A3 is their sum, so it carries an `f` while its
// `m` is indistinguishable from a literal. B1 is text, to pin that the marker is
// about the formula and not about the cell being non-empty.
const celldata = [
  { r: 0, c: 0, v: { v: 1, m: "1", ct: { fa: "General", t: "n" } } },
  { r: 1, c: 0, v: { v: 2, m: "2", ct: { fa: "General", t: "n" } } },
  {
    r: 2,
    c: 0,
    v: { v: 3, f: "=A1+A2", m: "3", ct: { fa: "General", t: "n" } },
  },
  { r: 0, c: 1, v: { v: "text", m: "text", ct: { fa: "General", t: "s" } } },
];

const setup = (lang?: string) => {
  const { container } = render(
    <Workbook lang={lang} data={[{ name: "Sheet1", celldata } as any]} />
  );
  return {
    container,
    cellInput: container.querySelector<HTMLElement>(".luckysheet-cell-input")!,
    selectionText: () =>
      container.querySelector("#sr-selection")?.textContent ?? "",
  };
};

/** Arrow down `times` rows from A1, letting each move commit. */
const moveDown = async (cellInput: HTMLElement, times: number) => {
  for (let i = 0; i < times; i += 1) {
    fireEvent.keyDown(cellInput, { key: "ArrowDown", keyCode: 40 });
    // eslint-disable-next-line no-await-in-loop
    await tick();
  }
};

describe("Formula presence is announced", () => {
  describe("#sr-selection", () => {
    it("marks a formula cell, alongside its computed value", async () => {
      const { cellInput, selectionText } = setup();
      await tick();

      await moveDown(cellInput, 2);

      // The value still leads — the marker qualifies it rather than replacing it.
      expect(selectionText()).toContain("A. 3 3");
      expect(selectionText()).toContain("Has formula.");
    });

    it("leaves a typed value unmarked", async () => {
      const { cellInput, selectionText } = setup();
      await tick();

      await moveDown(cellInput, 1);

      expect(selectionText()).toContain("A. 2 2");
      expect(selectionText()).not.toContain("Has formula.");
    });

    it("leaves a text cell unmarked", async () => {
      // Guards against keying the marker off "the cell has content" rather than
      // off its `f`.
      const { cellInput, selectionText } = setup();
      await tick();

      fireEvent.keyDown(cellInput, { key: "ArrowRight", keyCode: 39 });
      await tick();

      expect(selectionText()).toContain("text");
      expect(selectionText()).not.toContain("Has formula.");
    });

    it("drops the marker again on moving off the formula cell", async () => {
      // The marker is a property of the focused cell, so it must not stick to
      // the announcement the way a one-off event would.
      const { cellInput, selectionText } = setup();
      await tick();

      await moveDown(cellInput, 2);
      expect(selectionText()).toContain("Has formula.");

      fireEvent.keyDown(cellInput, { key: "ArrowUp", keyCode: 38 });
      await tick();

      expect(selectionText()).not.toContain("Has formula.");
    });
  });

  describe("the cell input's accessible name", () => {
    it("marks a formula cell", async () => {
      const { cellInput } = setup();
      await tick();

      await moveDown(cellInput, 2);

      expect(cellInput.getAttribute("aria-label")).toBe("A. 3 3 Has formula.");
    });

    it("leaves a typed value unmarked", async () => {
      const { cellInput } = setup();
      await tick();

      await moveDown(cellInput, 1);

      expect(cellInput.getAttribute("aria-label")).toBe("A. 2 2");
    });

    it("drops the marker while an edit is open", async () => {
      // The field then holds the formula source itself, leading `=` and all, so
      // saying it is a formula repeats what the user is already hearing.
      const { cellInput } = setup();
      await tick();
      await moveDown(cellInput, 2);

      fireEvent.keyDown(cellInput, { key: "F2", keyCode: 113 });
      await tick();

      expect(cellInput.getAttribute("aria-label")).toBe("A. 3");
    });
  });

  it("takes the phrase from the locale rather than hard-coding English", async () => {
    const { cellInput, selectionText } = setup("es");
    await tick();

    await moveDown(cellInput, 2);

    expect(selectionText()).toContain("Tiene fórmula.");
    expect(cellInput.getAttribute("aria-label")).toContain("Tiene fórmula.");
  });
});
