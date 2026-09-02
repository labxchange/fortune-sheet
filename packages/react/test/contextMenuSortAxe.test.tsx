import {
  render,
  fireEvent,
  waitFor,
  act,
  screen,
} from "@testing-library/react";
import React from "react";
import axe from "axe-core";
import Workbook from "../src/components/Workbook";

// Structural ARIA audit of the three surfaces this change touched, mainly to
// hold two judgement calls honest:
//
//  * the Filter-by-colour submenu is role="group", not role="menu", because its
//    rows are role="checkbox" and role="menu" requires menuitem* children.
//    `aria-required-children` is the rule that catches getting this wrong.
//  * the rows wrapping a text input carry no role, so `button`'s presentational-
//    children behaviour cannot strip the input from the accessibility tree.
//
// jsdom loads no stylesheets, so the colour-contrast rules are disabled rather
// than left to report a meaningless pass; the two focus-ring ratios are asserted
// numerically in customSortA11y.test.tsx by reading the CSS as text.
//
// `axe-core` is pinned exactly in the root `devDependencies`, and this test is
// why. It used to arrive only as a hoisted transitive of
// `eslint-plugin-jsx-a11y`, which left the rule set this audit runs against —
// and therefore its verdict — chosen by a lint plugin's range: bumping the
// plugin could silently change what "zero violations" means here, and dropping
// it would delete this test's dependency outright. Raise the pin deliberately,
// and re-read the results when you do.
const RULES = [
  "aria-required-children",
  "aria-required-parent",
  "aria-allowed-attr",
  "aria-allowed-role",
  "aria-valid-attr-value",
  "aria-valid-attr",
  "aria-input-field-name",
  "aria-toggle-field-name",
  "aria-dialog-name",
  "label",
  "select-name",
  "duplicate-id-aria",
];

const runAxe = async (container: HTMLElement) => {
  const results = await axe.run(container, {
    runOnly: { type: "rule", values: RULES },
  });
  return results.violations.map((v) => ({
    id: v.id,
    nodes: v.nodes.length,
    target: v.nodes[0]?.target?.join(" "),
    help: v.help,
  }));
};

const text = (v: string) => ({ v, m: v, ct: { fa: "General", t: "s" } });

const plainData = [
  {
    name: "Sheet1",
    id: "s1",
    row: 10,
    column: 6,
    celldata: ["Fruit", "Apple", "Banana"].map((v, r) => ({
      r,
      c: 0,
      v: text(v),
    })),
  },
];

const filterData = [
  {
    name: "Sheet1",
    celldata: [
      { r: 0, c: 0, v: text("Name") },
      { r: 1, c: 0, v: { ...text("a"), bg: "#ff0000" } },
      { r: 2, c: 0, v: { ...text("b"), bg: "#00ff00" } },
    ],
    filter_select: { row: [0, 2], column: [0, 0] },
  },
];

const openContextMenu = (container: HTMLElement) => {
  const rightClick = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(rightClick, "pageX", { value: 5 });
  Object.defineProperty(rightClick, "pageY", { value: 5 });
  act(() => {
    container
      .querySelector<HTMLElement>(".fortune-cell-area")!
      .dispatchEvent(rightClick);
  });
};

describe("structural a11y audit", () => {
  it("finds no violations in the open cell context menu", async () => {
    const { container } = render(<Workbook lang="en" data={plainData} />);
    openContextMenu(container);
    await waitFor(() => screen.getByText("Create filter"));

    // Covers the four newly named numeric inputs, the state-dependent filter
    // row, and the roleless rows that wrap those inputs.
    expect(await runAxe(container)).toEqual([]);
  });

  it("finds no violations in the Sort modal", async () => {
    const { container } = render(<Workbook lang="en" data={plainData} />);
    openContextMenu(container);
    const row = screen.getByText("Sort").closest('[role="button"]')!;
    act(() => {
      (row as HTMLElement).focus();
      fireEvent.keyDown(row, { key: "Enter" });
    });
    await waitFor(() => screen.getByRole("dialog"));

    // aria-dialog-name is the rule that was failing before this change, and the
    // label rules cover the radios and the header-row checkbox.
    expect(await runAxe(document.body)).toEqual([]);
  });

  it("finds no violations in the filter menu with the colour submenu open", async () => {
    render(<Workbook lang="en" data={filterData} />);
    await waitFor(() =>
      expect(
        document.querySelectorAll(".luckysheet-filter-options").length
      ).toBeGreaterThan(0)
    );
    const funnel = document.querySelector<HTMLElement>(
      ".luckysheet-filter-options"
    )!;
    act(() => {
      funnel.focus();
      fireEvent.keyDown(funnel, { key: "Enter" });
    });
    await waitFor(() => screen.getByText("Filter by color"));

    const trigger = screen
      .getByText("Filter by color")
      .closest('[role="button"]') as HTMLElement;
    act(() => {
      trigger.focus();
      fireEvent.keyDown(trigger, { key: "Enter" });
    });
    await waitFor(() =>
      expect(
        document.getElementById("fortune-filter-bycolor-submenu")
      ).not.toBeNull()
    );

    // The submenu renders outside the filter menu's container, so the audit runs
    // over the whole body rather than the workbook subtree.
    expect(await runAxe(document.body)).toEqual([]);
  });

  it("finds no violations in a sheet tab being renamed", async () => {
    const { container } = render(<Workbook lang="en" data={plainData} />);
    const caret = container.querySelector<HTMLElement>(
      ".luckysheet-sheets-item-function"
    )!;
    act(() => {
      caret.focus();
      fireEvent.keyDown(caret, { key: "Enter" });
    });
    await waitFor(() => screen.getByText("Rename"));
    const renameRow = screen.getByText("Rename").closest('[role="button"]')!;
    act(() => {
      (renameRow as HTMLElement).focus();
      fireEvent.keyDown(renameRow, { key: "Enter" });
    });
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });

    // The rename field is a role="textbox" nested inside a role="tab", which is
    // a children-presentational role. `aria-allowed-role` and the name rules are
    // what would catch that being expressed wrongly; whether a *reader* still
    // exposes it is a separate question, answered in sr-virtual.test.tsx.
    expect(
      container
        .querySelector(".luckysheet-sheets-item-name")
        ?.getAttribute("role")
    ).toBe("textbox");
    expect(await runAxe(container)).toEqual([]);
  });
});
