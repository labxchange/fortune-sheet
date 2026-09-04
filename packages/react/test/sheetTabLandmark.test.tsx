import { render, within } from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";

/**
 * The sheet strip as a landmark (WCAG 1.3.1).
 *
 * Every other region of the workbook chrome is one already — the toolbar is a
 * banner, the formula bar and the zoom control are complementary, the grid is
 * main — but the sheet controls sat between `main` and the zoom aside in no
 * landmark at all. A screen-reader user listing the page's landmarks to jump
 * to the sheet switcher found nothing to jump to, and had to walk the whole
 * grid to reach it.
 *
 * `region` rather than `navigation`: it is what the ticket asks for by name,
 * and the strip holds a command that is not navigation at all — the button
 * that creates a sheet. A region is only a landmark once it has an accessible
 * name, so the name is the fix as much as the role is, which is why every case
 * here queries by name.
 */
describe("Sheet tab landmark", () => {
  const renderTabs = (props: Record<string, unknown> = {}) =>
    render(<Workbook data={[{ name: "Sheet1" }]} {...props} />);

  it("exposes the sheet controls as a named landmark", () => {
    const { getByRole } = renderTabs();

    expect(getByRole("region", { name: "Sheet tabs" })).toBeTruthy();
  });

  it("puts the sheet switcher and the add-sheet button inside it", () => {
    const { getByRole } = renderTabs();
    const landmark = within(getByRole("region", { name: "Sheet tabs" }));

    // The two things the ticket names: the controls for switching sheets, and
    // the one for adding a sheet. Asserted through the landmark rather than the
    // page, so wrapping some *other* element cannot satisfy this.
    expect(landmark.getByRole("tablist")).toBeTruthy();
    expect(landmark.getByRole("button", { name: "New sheet" })).toBeTruthy();
  });

  it("leaves the zoom control out of it", () => {
    const { getByRole } = renderTabs();
    const landmark = within(getByRole("region", { name: "Sheet tabs" }));

    // The zoom control is a sibling of the sheet controls and already carries
    // its own "Zoom settings" landmark. Wrapping their common parent would put
    // one landmark inside another and make this one's name a lie, so this is
    // what pins the landmark to the sheet controls alone.
    expect(landmark.queryByRole("button", { name: "Zoom in" })).toBeNull();
  });

  it("takes its name from the active locale rather than falling back", () => {
    // `locale()` resolves every key through English, so a name added to en
    // alone still *renders* — in English, silently, for every other reader.
    // Nothing shows this string on screen, so the omission would be invisible
    // both by eye and to tsc.
    const { getByRole } = renderTabs({ lang: "zh" });

    expect(getByRole("region", { name: "工作表标签" })).toBeTruthy();
  });
});
