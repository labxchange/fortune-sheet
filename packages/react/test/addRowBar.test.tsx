import { render } from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";

// The bottom add-row strip. It is always in the DOM — `allowEdit` toggles an
// inline `display` rather than gating rendering — so these cases need no
// editable-state setup first, and the by-role queries below still respect the
// `display: none`, which is what the last case turns on. `lang` defaults to
// null, which `locale()` resolves to English, so English strings are what
// render unless a case passes `lang`.
//
// Scroll behaviour moved to cellAreaScroll.test.tsx: the overlap this strip was
// reported for is a grid-core scroll defect, not a property of the strip.
describe("Add-row bar accessibility", () => {
  const renderBar = () => render(<Workbook data={[{ name: "Sheet1" }]} />);

  it("gives the row-count input an accessible name", () => {
    const { getByRole } = renderBar();

    // A placeholder is not an accessible name: without the aria-label this
    // field announces only as "edit text", so a screen reader user cannot tell
    // what the number means. getByRole throws when the name does not match.
    expect(
      getByRole("textbox", { name: "Number of rows to add" })
    ).toBeTruthy();
  });

  it("names the unit the number is counting", () => {
    const { getByText } = renderBar();

    // English left `info.row` empty — as do es, hi and ru; only zh and zh_tw
    // filled it — so the strip read "Add [50]  (more rows at bottom)" with no
    // noun anywhere.
    expect(getByText("rows")).toBeTruthy();
  });

  it("styles the hint through a class rather than an inline colour", () => {
    const { getByText } = renderBar();
    const hint = getByText("(more rows at bottom)");

    // The colour was inline `#9c9c9c` — 2.75:1 on white, failing WCAG 1.4.3.
    // Asserting the inline style is empty is what catches a re-introduction:
    // the class's own value lives in CSS that jsdom never loads.
    expect(hint.className).toBe("fortune-add-row-hint");
    expect(hint.style.color).toBe("");
  });

  it("translates the accessible name rather than falling back to English", () => {
    const { getByRole } = render(
      <Workbook lang="zh" data={[{ name: "Sheet1" }]} />
    );

    // `locale()` merges each language over English per key, so a key added to
    // en alone still *resolves* — in English, silently, for every non-English
    // reader. Nothing renders this string visibly, so a gap here is invisible
    // by eye and invisible to tsc. Asserting one non-English locale is what
    // makes the omission fail a build instead of shipping.
    expect(getByRole("textbox", { name: "要添加的行数" })).toBeTruthy();
  });

  it("exposes no add-row control when editing is off", () => {
    const { queryByRole } = render(
      <Workbook allowEdit={false} data={[{ name: "Sheet1" }]} />
    );

    // `allowEdit` hides the strip with an inline `display: none` rather than
    // unmounting it. Giving the input a name is what makes that distinction
    // matter: a named control still in the accessibility tree is one a screen
    // reader user can reach and act on in a sheet they cannot edit.
    expect(
      queryByRole("textbox", { name: "Number of rows to add" })
    ).toBeNull();
  });
});
