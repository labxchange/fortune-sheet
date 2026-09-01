import {
  render,
  fireEvent,
  waitFor,
  within,
  act,
} from "@testing-library/react";
import React from "react";
import Workbook, { WorkbookInstance } from "../src/components/Workbook";

// The Find All results were three columns of floated <span>s inside <div>s —
// a table to look at and an unstructured list to a screen reader, which could
// not associate a value with the "Cell" heading above it or move between rows
// and columns (WCAG 1.3.1).
//
// These cases assert the semantics through the roles AT resolves, not through
// tag names, so markup that renders the same but exposes the wrong structure
// still fails.

const DATA = [
  {
    name: "Sheet1",
    celldata: [
      {
        r: 0,
        c: 0,
        v: { v: "alpha", m: "alpha", ct: { fa: "General", t: "s" } },
      },
      {
        r: 1,
        c: 0,
        v: { v: "alpha", m: "alpha", ct: { fa: "General", t: "s" } },
      },
      {
        r: 2,
        c: 0,
        v: { v: "beta", m: "beta", ct: { fa: "General", t: "s" } },
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
  await waitFor(() => within(dialog).getByRole("table"));
  return dialog;
};

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
  return { ...view, ref };
};

describe("Find All results table", () => {
  it("is exposed as a table", async () => {
    const { getByRole } = renderWorkbook();
    const dialog = await findAll(getByRole, "alpha");
    expect(within(dialog).getByRole("table")).toBeTruthy();
  });

  it("names the table, so it can be found and matches what was announced", async () => {
    const { getByRole } = renderWorkbook();
    const dialog = await findAll(getByRole, "alpha");
    expect(
      within(dialog).getByRole("table", { name: "Search results" })
    ).toBeTruthy();
  });

  it("marks the three headings as column headers", async () => {
    const { getByRole } = renderWorkbook();
    const dialog = await findAll(getByRole, "alpha");
    const table = within(dialog).getByRole("table");

    const headers = within(table).getAllByRole("columnheader");
    expect(headers.map((h) => h.textContent)).toEqual([
      "Sheet",
      "Cell",
      "Value",
    ]);
    headers.forEach((h) => expect(h.getAttribute("scope")).toBe("col"));
  });

  it("gives every match a row of three data cells", async () => {
    const { getByRole } = renderWorkbook();
    const dialog = await findAll(getByRole, "alpha");
    const table = within(dialog).getByRole("table");

    // Two matches, plus the header row.
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3);

    const [firstResult] = within(table).getAllByRole("row").slice(1);
    const cells = within(firstResult).getAllByRole("cell");
    expect(cells).toHaveLength(3);
    expect(cells[0].textContent).toBe("Sheet1");
    expect(cells[2].textContent).toBe("alpha");
  });

  it("keeps result rows as rows rather than re-roling them as buttons", async () => {
    // role="button" on a <tr> removes it from the table's structure, which is
    // the whole point of this markup. The row stays focusable and activatable
    // without the override.
    const { getByRole } = renderWorkbook();
    const dialog = await findAll(getByRole, "alpha");
    const table = within(dialog).getByRole("table");

    const resultRows = within(table).getAllByRole("row").slice(1);
    resultRows.forEach((row) => {
      expect(row.getAttribute("role")).toBeNull();
      expect(row.getAttribute("tabindex")).toBe("0");
    });
    expect(within(table).queryAllByRole("button")).toHaveLength(0);
  });

  it("selects the matched cell and closes when a row is clicked", async () => {
    // Behaviour preserved across the markup change: the row was clickable
    // before and is clickable now. What it asserts changed with the dialog
    // closing on activation — the row that used to carry a "selected" class is
    // unmounted by the time the click settles, so the selection is read from
    // the sheet instead, which is what the class was standing in for anyway.
    const { getByRole, ref } = renderWorkbook();
    const dialog = await findAll(getByRole, "alpha");
    const table = within(dialog).getByRole("table");
    const [firstResult] = within(table).getAllByRole("row").slice(1);

    fireEvent.click(firstResult);

    await waitFor(() => expect(dialog.isConnected).toBe(false));
    expect(ref.current!.getSelectionCoordinates()[0]).toMatch(/A1$/);
  });

  it("selects the matched cell and closes when a row is activated by Enter", async () => {
    const { getByRole, ref } = renderWorkbook();
    const dialog = await findAll(getByRole, "alpha");
    const table = within(dialog).getByRole("table");
    const [, secondResult] = within(table).getAllByRole("row").slice(1);

    secondResult.focus();
    fireEvent.keyDown(secondResult, { key: "Enter" });

    await waitFor(() => expect(dialog.isConnected).toBe(false));
    expect(ref.current!.getSelectionCoordinates()[0]).toMatch(/A2$/);
  });

  it("renders no table at all before a search is run", async () => {
    const { getByRole, queryByRole } = renderWorkbook();
    fireEvent.click(getByRole("button", { name: /find and replace/i }));
    const dialog = await waitFor(() => getByRole("dialog"));
    expect(within(dialog).queryByRole("table")).toBeNull();
    expect(queryByRole("table", { name: "Search results" })).toBeNull();
  });
});
