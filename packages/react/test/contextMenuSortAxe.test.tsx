import {
  render,
  fireEvent,
  waitFor,
  act,
  screen,
  within,
} from "@testing-library/react";
import React from "react";
import axe from "axe-core";
import Workbook from "../src/components/Workbook";

// Structural ARIA audit of the four surfaces this change touched, mainly to
// hold three judgement calls honest:
//
//  * the Filter-by-colour submenu is role="group", not role="menu", because its
//    rows are role="checkbox" and role="menu" requires menuitem* children.
//    `aria-required-children` is the rule that catches getting this wrong.
//  * the rows wrapping a text input carry no role, so `button`'s presentational-
//    children behaviour cannot strip the input from the accessibility tree.
//  * the rename field is a role="textbox" inside a role="tab".
//    `nested-interactive` is the rule for that, and its answer is recorded on
//    `SHEET_TAB_CARET` below: the only thing it objects to in the tab strip is
//    the pre-existing options caret, not the rename markup.
//
// jsdom loads no stylesheets, so the colour-contrast rules are disabled rather
// than left to report a meaningless pass; the two focus-ring ratios are asserted
// numerically in customSortA11y.test.tsx by reading the CSS as text.
//
// Two rules are deliberately absent. `duplicate-id` and `duplicate-id-active`
// are deprecated in axe-core 4.11 (WCAG 2.2 obsoleted 4.1.1) and, run over two
// workbooks, report ~130 collisions: every SVG symbol id, every `sr-*` region,
// `#luckysheet-rich-text-editor`, `#all-sheets` four times over. That is a
// fork-wide multi-instance defect far outside this change, and asserting it
// here would mean recording a 130-entry expected value. Their live successor
// `duplicate-id-aria` is in the set and is the one that matters — it covers ids
// reached through an IDREF, which is the failure the per-workbook `useId()`
// change fixed — and the last case below runs it over two workbooks to prove it.
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
  "aria-required-attr",
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
  // The two rules for this change's riskiest structures, and the reason they
  // are here: `aria-allowed-role` does not test either. `nested-interactive` is
  // what answers the question this file was written to settle — a
  // `role="textbox"` inside a `role="tab"`, which is a children-presentational
  // role — and it is also the rule for the numeric `<input>`s inside menu rows.
  // `presentation-role-conflict` catches the inverse: a row marked
  // presentational that is still focusable.
  "nested-interactive",
  "presentation-role-conflict",
];

/**
 * A finding's element, as something a reader of this file can recognise.
 *
 * Not axe's own `target` selector: that is a path from whatever node the audit
 * was rooted at, so the same element is `.luckysheet-sheets-item` in a
 * container-scoped run and a nine-segment path in a `document.body` one, and an
 * expected value written against one run breaks in the other.
 */
const elementOf = (node: axe.NodeResult) => {
  const el = document.querySelector(node.target.join(" "));
  if (el == null) return "(unresolved)";
  return el.getAttribute("aria-label") ?? `.${el.className.split(" ")[0]}`;
};

const runAxe = async (root: HTMLElement) => {
  const results = await axe.run(root, {
    runOnly: { type: "rule", values: RULES },
  });
  const flatten = (list: axe.Result[]) =>
    list.flatMap((r) =>
      r.nodes.map((node) => ({ rule: r.id, element: elementOf(node) }))
    );
  // `incomplete` is returned, not dropped. axe-core does not support jsdom, and
  // a check that needs layout — or a reference it cannot resolve — reports
  // "can't tell" as incomplete rather than as a violation. Reading only
  // `violations` therefore counts an unknown share of these rules as passes,
  // which is the difference between "zero violations" and "the rules ran".
  return {
    violations: flatten(results.violations),
    incomplete: flatten(results.incomplete),
  };
};

/*
 * Findings this audit records rather than asserts away.
 *
 * Recorded exactly, as expected values, rather than kept out of `RULES` — the
 * point of adding a rule is to see what it says, and an allowlist that omits
 * the rules most likely to fire reads as a pass it never earned. Anything new
 * fails these cases; these three do not.
 */

/**
 * `role="button"` (the options caret) inside `role="tab"`, which is a
 * children-presentational role. Present on `origin/master` unchanged — the
 * caret has carried `role="button"` and a roving `tabIndex` since before this
 * branch — and present whether or not a rename is in progress.
 *
 * It is *not* the rename field. Removing the caret from the tab and re-running
 * the rule during a rename leaves the `role="textbox"` contenteditable inside
 * the same `role="tab"` reporting zero violations and zero incompletes, which
 * settles the question the header used to leave open: `nested-interactive` has
 * no complaint about the rename markup. Whether a *reader* exposes it is a
 * different question, answered in sr-virtual.test.tsx.
 */
const SHEET_TAB_CARET = { rule: "nested-interactive", element: "Sheet1" };

/**
 * The colour rows are `role="checkbox"` — also children-presentational — around
 * a decorative `<input type="checkbox">` that shows the tick.
 *
 * The input is `aria-hidden="true"` and `tabIndex={-1}`, so it is in neither
 * the accessibility tree nor the tab order and no user can reach it. axe's
 * check is `no-focusable-content`, which tests focusability and does not look
 * at `aria-hidden` — `tabindex="-1"` is focusable, so it reports. The fixes
 * that would silence it both cost something real: `disabled` greys out a
 * deliberately visible state indicator, and replacing the input with a
 * CSS-drawn tick is a visual change this fork has no regression baseline for.
 */
const colourRow = (color: string) => ({
  rule: "nested-interactive",
  element: `Filter by cell color, ${color}`,
});

/**
 * The filter funnel's `aria-controls` names the popup it opens.
 *
 * axe declines to resolve an `aria-controls` IDREF on an element that also has
 * `aria-haspopup`, because the popup legitimately may not be rendered yet — so
 * it reports "can't tell" rather than pass or fail, no matter what the DOM
 * says. The `it` below asserts the referenced element exists, which is the part
 * axe is declining to check.
 */
const FILTER_FUNNEL_CONTROLS = {
  rule: "aria-valid-attr-value",
  element: "Filter Name.",
};

/** Nothing failed, and nothing was skipped for want of layout. */
const CLEAN = { violations: [], incomplete: [] };

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
    expect(await runAxe(container)).toEqual({
      ...CLEAN,
      violations: [SHEET_TAB_CARET],
    });
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
    expect(await runAxe(document.body)).toEqual({
      ...CLEAN,
      violations: [SHEET_TAB_CARET],
    });
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

    // The `aria-controls` axe declines to resolve — the part of the rule it is
    // reporting "can't tell" on, checked here instead.
    expect(funnel.getAttribute("aria-controls")).toBe("fortune-filter-menu");
    expect(document.getElementById("fortune-filter-menu")).not.toBeNull();

    // The submenu renders outside the filter menu's container, so the audit runs
    // over the whole body rather than the workbook subtree.
    expect(await runAxe(document.body)).toEqual({
      violations: [SHEET_TAB_CARET, colourRow("#ff0000"), colourRow("#00ff00")],
      incomplete: [FILTER_FUNNEL_CONTROLS],
    });
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
    // a children-presentational role. `nested-interactive` is the rule for that
    // and it has no complaint — see the case below, which isolates it from the
    // caret. Whether a *reader* still exposes it is a separate question,
    // answered in sr-virtual.test.tsx.
    expect(
      container
        .querySelector(".luckysheet-sheets-item-name")
        ?.getAttribute("role")
    ).toBe("textbox");
    expect(await runAxe(container)).toEqual({
      ...CLEAN,
      violations: [SHEET_TAB_CARET],
    });
  });

  it("has no complaint about the rename textbox inside the tab", async () => {
    // The one thing `nested-interactive` objects to in the tab strip is the
    // options caret, which predates this branch. Detaching it leaves the
    // rename field as the only focusable descendant of the `role="tab"`, and
    // the rule goes quiet — so the nesting this change introduced is not what
    // it is reporting. Written as its own case because the assertion is a
    // *zero*, and the only way to see a zero is to remove the other cause.
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

    const field = container.querySelector(".luckysheet-sheets-item-name")!;
    expect(field.getAttribute("role")).toBe("textbox");
    expect(field.closest('[role="tab"]')).not.toBeNull();
    // Detached from the DOM, not from React's tree, so React is not asked to
    // reconcile against a node that moved.
    container
      .querySelectorAll(".luckysheet-sheets-item-function")
      .forEach((el) => el.remove());

    expect(await runAxe(container)).toEqual(CLEAN);
  });

  it("keeps ARIA references unique across two workbooks on one page", async () => {
    // The topology the `useId()` change was for, and the one every other case
    // here misses by rendering a single workbook. The EDA sim mounts five, and
    // a fixed id made instance 3's `aria-describedby` resolve to instance 0's
    // permanently-empty region — written correctly, into an element nothing
    // referenced.
    //
    // `duplicate-id-aria` is the rule for exactly that: ids reached through an
    // IDREF or a label, as opposed to the ~130 plain-id collisions two
    // workbooks produce (see the header). It has to run over both subtrees at
    // once or the collision is not in scope.
    const { container } = render(
      <>
        <Workbook lang="en" data={plainData} />
        <Workbook lang="en" data={plainData} />
      </>
    );
    await waitFor(() =>
      expect(container.querySelectorAll(".fortune-container")).toHaveLength(2)
    );

    // Both workbooks have to *announce* first. The region's id only becomes an
    // ARIA reference when a result writes `aria-describedby` onto the cell
    // input, so auditing two idle workbooks passes whether the id is per
    // instance or hardcoded — which is what this case did before it ran an
    // action, and it would have gone on passing with `useId()` removed.
    const workbooks = Array.from(
      container.querySelectorAll<HTMLElement>(".fortune-container")
    );
    // eslint-disable-next-line no-restricted-syntax
    for (const workbook of workbooks) {
      openContextMenu(workbook);
      const row = within(workbook)
        .getByText("Clear content")
        .closest('[role="button"]') as HTMLElement;
      act(() => {
        row.focus();
        fireEvent.keyDown(row, { key: "Enter" });
      });
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      });
    }
    const describedBy = workbooks.map((workbook) =>
      workbook
        .querySelector("#luckysheet-rich-text-editor")
        ?.getAttribute("aria-describedby")
    );
    expect(describedBy[0]).toBeTruthy();
    expect(describedBy[1]).toBeTruthy();
    expect(describedBy[0]).not.toBe(describedBy[1]);

    expect(await runAxe(container)).toEqual({
      ...CLEAN,
      // One per workbook, and nothing else. Verified red both ways with the
      // `useId()` removed: the comparison above fails, and axe reports
      // `duplicate-id-aria` on both regions independently of it.
      violations: [SHEET_TAB_CARET, SHEET_TAB_CARET],
    });
  });
});
