import { render } from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";

describe("Worksheet", () => {
  it("should render", async () => {
    const { queryByText, container } = render(
      <Workbook data={[{ name: "Sheet1" }]} />
    );
    expect(container.querySelector(".fortune-sheet-container")).toBeTruthy();
    expect(queryByText("Sheet1")).toBeTruthy();
  });

  it("should not announce a sheet focus lock", async () => {
    const { container } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    // #sr-selection stays the single announcement channel for the grid; the
    // focus-lock live region and its shortcut entry are gone.
    expect(container.querySelector("#sr-selection")).toBeTruthy();
    expect(container.querySelector("#sr-sheetFocus")).toBeNull();
    expect(container.querySelector("#shortcut-list")?.textContent).not.toMatch(
      /focus lock/i
    );
  });
});
