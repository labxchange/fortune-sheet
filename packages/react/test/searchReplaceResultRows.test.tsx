import { readFileSync } from "fs";
import { join } from "path";
import {
  render,
  fireEvent,
  waitFor,
  within,
  act,
} from "@testing-library/react";
import React from "react";
import Workbook, { WorkbookInstance } from "../src/components/Workbook";

// A Find All result row looked clickable and, to a screen reader, was an
// unnamed row of three values with no indication that it did anything. It also
// only moved the *selection* — the grid's keyboard handling runs while the
// cell input holds focus, so the user was left in the dialog with the arrow
// keys dead over a cell they had just "navigated" to.
//
// What jsdom cannot show: that the results box no longer chains its wheel
// gesture to the grid (`overscroll-behavior` is not implemented in jsdom, and
// the guard for it reads the stylesheet as text at the bottom of this file),
// nor whether the box is visually obscured by the grid's horizontal scrollbar.
// Both are in the PR's review-app list.

const DATA = [
  {
    name: "Sheet1",
    celldata: [
      {
        r: 0,
        c: 7,
        v: { v: "convinient", m: "convinient", ct: { fa: "General", t: "s" } },
      },
      {
        r: 1,
        c: 7,
        v: { v: "convinient", m: "convinient", ct: { fa: "General", t: "s" } },
      },
    ],
  },
];

const byId = (dialog: HTMLElement, id: string) =>
  dialog.querySelector<HTMLElement>(`#${id}`)!;

const findAll = async (getByRole: any, term: string) => {
  fireEvent.click(getByRole("button", { name: /find and replace/i }));
  const dialog = await waitFor(() => getByRole("dialog"));
  fireEvent.change(within(dialog).getByLabelText("Find Content"), {
    target: { value: term },
  });
  fireEvent.click(byId(dialog, "searchAllBtn"));
  await waitFor(() => within(dialog).getByRole("listbox"));
  return dialog;
};

const resultRows = (dialog: HTMLElement) =>
  within(within(dialog).getByRole("listbox")).getAllByRole("option");

// A sheet that has never been clicked still carries the placeholder selection
// SheetOverlay installs on mount, `{ row: [0], column: [0] }` — open-ended, and
// `searchAll` walks `r1..r2` with `r2` undefined, so Find All reports no
// matches however many there are. Selecting a cell is what a user does before
// searching, and it is what puts the sheet in the state these cases are about.
const renderWorkbook = () => {
  const ref = React.createRef<WorkbookInstance>();
  const view = render(
    <Workbook ref={ref} data={DATA as any} toolbarItems={["search"]} />
  );
  act(() => {
    ref.current!.setSelection([{ row: [0, 0], column: [0, 0] }]);
  });
  return view;
};

describe("Find All result rows", () => {
  it("names each row with its content and what activating it does", async () => {
    const { getByRole } = renderWorkbook();
    const dialog = await findAll(getByRole, "convinient");

    const [first] = resultRows(dialog);
    const label = first.getAttribute("aria-label")!;
    expect(label).toContain("Sheet1");
    expect(label).toContain("H1");
    expect(label).toContain("convinient");
    expect(label).toContain("Activate to navigate to cell H1");
  });

  it("substitutes the cell reference in both places it appears", async () => {
    // The label names the cell twice — once as data, once in the hint — and
    // the second occurrence is the one a naive single-shot substitution drops.
    const { getByRole } = renderWorkbook();
    const dialog = await findAll(getByRole, "convinient");

    const [, second] = resultRows(dialog);
    const label = second.getAttribute("aria-label")!;
    expect(label).not.toContain("${cell}");
    expect(label.match(/H2/g)?.length).toBe(2);
  });

  it("leaves no placeholder unsubstituted", async () => {
    const { getByRole } = renderWorkbook();
    const dialog = await findAll(getByRole, "convinient");

    resultRows(dialog).forEach((row) => {
      expect(row.getAttribute("aria-label")).not.toMatch(/\$\{\w+\}/);
    });
  });

  it("moves focus to the grid and closes when a row is activated by keyboard", async () => {
    jest.useFakeTimers();
    try {
      const { getByRole, container } = renderWorkbook();
      const dialog = await findAll(getByRole, "convinient");

      // While the dialog is up it is deliberately not modal: the grid stays
      // live underneath, and SheetOverlay's #sr-selection — which announces
      // the jump — is a sibling rather than a descendant.
      expect(dialog.getAttribute("aria-modal")).toBeNull();

      const [first] = resultRows(dialog);
      first.focus();
      fireEvent.keyDown(first, { key: "Enter" });

      // focusAfterCommit defers by a task so the grid has rebuilt first. That
      // deferral is also what sequences it after useDialogFocus's unmount
      // cleanup, which restores focus to whatever opened the dialog.
      act(() => {
        jest.runAllTimers();
      });

      const cellInput = container.querySelector<HTMLElement>(
        ".luckysheet-cell-input"
      );
      expect(cellInput).toBeTruthy();
      expect(document.activeElement).toBe(cellInput);

      // Activating a result is a go-to and it is finished once the user is on
      // the cell. Leaving the dialog up would park it over the grid it just
      // scrolled into view, out of the tab ring, holding a stale list — and it
      // would leave focus sitting outside an open dialog, which is the
      // half-state a keyboard user cannot read.
      expect(dialog.isConnected).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it("moves focus to the grid and closes when a row is activated by mouse", async () => {
    jest.useFakeTimers();
    try {
      const { getByRole, container } = renderWorkbook();
      const dialog = await findAll(getByRole, "convinient");

      fireEvent.click(resultRows(dialog)[1]);
      act(() => {
        jest.runAllTimers();
      });

      expect(document.activeElement).toBe(
        container.querySelector<HTMLElement>(".luckysheet-cell-input")
      );
      expect(dialog.isConnected).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it("reopens with an empty result list rather than a stale one", async () => {
    // The corollary of closing on activation: the next open must not show the
    // previous search's rows, which would be a list the grid has moved on from.
    const { getByRole } = renderWorkbook();
    const dialog = await findAll(getByRole, "convinient");

    fireEvent.click(resultRows(dialog)[0]);
    await waitFor(() => expect(dialog.isConnected).toBe(false));

    fireEvent.click(getByRole("button", { name: /find and replace/i }));
    const reopened = await waitFor(() => getByRole("dialog"));
    expect(within(reopened).queryByRole("listbox")).toBeNull();
  });

  it("highlights the option the user is on, keyed to aria-selected", async () => {
    // A listbox has somewhere to put this that a table did not: the active
    // option is the selected one, so keying the highlight to aria-selected
    // means the painted state and the announced state are the same state and
    // cannot drift. jsdom loads no stylesheet (identity-obj-proxy), so the rule
    // is read as text; the contrast of the pair is asserted in
    // searchReplaceContrast.test.tsx.
    const { getByRole } = renderWorkbook();
    const dialog = await findAll(getByRole, "convinient");

    const [first] = resultRows(dialog);
    first.focus();
    expect(first.getAttribute("aria-selected")).toBe("true");

    const css = readFileSync(
      join(__dirname, "../src/components/SearchReplace/index.css"),
      "utf-8"
    );
    const at = css.indexOf(
      '#fortune-search-replace #searchAllbox .boxItem[aria-selected="true"] {'
    );
    expect(at).toBeGreaterThan(-1);
    expect(css.slice(at, css.indexOf("}", at))).toContain(
      "background-color: #5b57d1"
    );
  });
});

describe("Find All results scrolling", () => {
  it("contains its own overscroll rather than chaining to the grid", () => {
    // jsdom applies no stylesheet, so this reads the rule as text. The bug was
    // scroll chaining: at the end of the list the gesture passed to the
    // nearest scrollable ancestor and the sheet moved instead.
    const css = readFileSync(
      join(__dirname, "../src/components/SearchReplace/index.css"),
      "utf-8"
    );
    const box = css.slice(
      css.indexOf("#fortune-search-replace #searchAllbox {")
    );
    const rule = box.slice(0, box.indexOf("}"));
    expect(rule).toContain("overscroll-behavior: contain");
    // Containment is only meaningful on an element that scrolls at all.
    expect(rule).toContain("overflow-y: auto");
  });
});
