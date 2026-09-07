import { render } from "@testing-library/react";
import React from "react";
import { GRID_ROOT_CLASS } from "@fortune-sheet/core";
import Workbook from "../src/components/Workbook";

// The grid root is a `main` landmark. Landmark navigation reads a landmark by
// its accessible name, so an unnamed one announces as a bare "main" — it does
// not say the region is the sheet, and it cannot be told apart from the main
// landmark of a page embedding the workbook (WCAG 1.3.1, 2.4.1).
describe("Grid main landmark", () => {
  it("has an accessible name", () => {
    const { getByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);

    expect(getByRole("main", { name: "Spreadsheet" })).toBeTruthy();
  });

  it("names the grid root itself, not a wrapper around it", () => {
    // The name has to land on the element that carries GRID_ROOT_CLASS: that is
    // the node the landmark is, and the node focusSpreadsheet moves focus to.
    const { container, getByRole } = render(
      <Workbook data={[{ name: "Sheet1" }]} />
    );

    expect(getByRole("main", { name: "Spreadsheet" })).toBe(
      container.querySelector(`.${GRID_ROOT_CLASS}`)
    );
  });

  it("takes the name from the locale rather than hard-coding English", () => {
    const { getByRole } = render(
      <Workbook lang="es" data={[{ name: "Sheet1" }]} />
    );

    expect(getByRole("main", { name: "Hoja de cálculo" })).toBeTruthy();
  });
});
