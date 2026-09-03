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
// They are now a listbox of options, not the table the audit ticket asked for:
// the ticket's scope changed once a screen-reader pass showed that table
// semantics expose each cell as its own stop, so a reader steps cell by cell
// and never hears a result as a unit — which was the original complaint. The
// file is named for the results rather than for their markup, so the next
// change of shape does not leave the name lying again.
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
  await waitFor(() => within(dialog).getByRole("listbox"));
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

describe("Find All results list", () => {
  const options = (dialog: HTMLElement) =>
    within(within(dialog).getByRole("listbox")).getAllByRole("option");

  it("is exposed as a listbox", async () => {
    // Not a table, and not a grid. Assistive tech collapses a row into one
    // stop only when the row's role takes its name from its contents;
    // `gridcell` does not, which is why a grid attempt still read cell by cell
    // in VoiceOver, and `option` does.
    const { getByRole } = renderWorkbook();
    const dialog = await findAll(getByRole, "alpha");
    expect(within(dialog).getByRole("listbox")).toBeTruthy();
    expect(within(dialog).queryByRole("table")).toBeNull();
    expect(within(dialog).queryByRole("grid")).toBeNull();
  });

  it("names the list, so it can be found and matches what was announced", async () => {
    const { getByRole } = renderWorkbook();
    const dialog = await findAll(getByRole, "alpha");
    expect(
      within(dialog).getByRole("listbox", { name: "Search results" })
    ).toBeTruthy();
  });

  it("gives every match one option, named field by field", async () => {
    // The column captions are decorative now, so the field names have to live
    // in the option's own name — otherwise a reader hears three bare values
    // and has to infer which is the sheet and which is the cell.
    const { getByRole } = renderWorkbook();
    const dialog = await findAll(getByRole, "alpha");

    const opts = options(dialog);
    expect(opts).toHaveLength(2);
    expect(opts[0].getAttribute("aria-label")).toBe(
      "Sheet Sheet1, cell A1, value alpha"
    );
  });

  it("hides the decorative column captions from assistive tech", async () => {
    const { getByRole } = renderWorkbook();
    const dialog = await findAll(getByRole, "alpha");
    const listbox = within(dialog).getByRole("listbox");

    expect(within(listbox).queryAllByRole("columnheader")).toHaveLength(0);
    expect(
      listbox.querySelector(".boxTitle")!.getAttribute("aria-hidden")
    ).toBe("true");
    // Still on screen, for the sighted reader they were put there for.
    expect(listbox.querySelector(".boxTitle")!.textContent).toBe(
      "SheetCellValue"
    );
  });

  it("still shows the three values in each option", async () => {
    const { getByRole } = renderWorkbook();
    const dialog = await findAll(getByRole, "alpha");

    const cells = within(options(dialog)[0]).getAllByText(/.+/);
    expect(cells.map((c) => c.textContent)).toEqual(["Sheet1", "A1", "alpha"]);
  });

  it("exposes an option as one node, without relying on the engine to flatten it", async () => {
    // The spec has an `option` flatten its children out of the tree; Chrome
    // does not, and leaves all three spans as StaticText — which is the
    // cell-by-cell walk this list was converted to escape, arrived at by a
    // different route. The three values are already in the option's name, so
    // hiding the spans is what makes the option one node in every engine.
    const { getByRole } = renderWorkbook();
    const dialog = await findAll(getByRole, "alpha");

    const spans = Array.from(options(dialog)[0].querySelectorAll("span"));
    expect(spans).toHaveLength(3);
    spans.forEach((span) => {
      expect(span.getAttribute("aria-hidden")).toBe("true");
    });
  });

  it("selects nothing until the list is entered", async () => {
    // aria-selected is a claim about what the user picked. Before focus has
    // reached the list nothing has been picked, so option 0 must not carry it
    // — while the list still has to offer exactly one tab stop to enter by.
    const { getByRole } = renderWorkbook();
    const dialog = await findAll(getByRole, "alpha");

    expect(options(dialog).map((o) => o.getAttribute("aria-selected"))).toEqual(
      ["false", "false"]
    );
    expect(options(dialog).map((o) => o.getAttribute("tabindex"))).toEqual([
      "0",
      "-1",
    ]);
  });

  it("marks the active option selected, and only that one, once entered", async () => {
    // aria-selected is what the highlight is keyed to, so the visual state and
    // the announced state cannot drift apart.
    const { getByRole } = renderWorkbook();
    const dialog = await findAll(getByRole, "alpha");

    const opts = options(dialog);
    act(() => opts[0].focus());
    await waitFor(() =>
      expect(
        options(dialog).map((o) => o.getAttribute("aria-selected"))
      ).toEqual(["true", "false"])
    );

    fireEvent.keyDown(opts[0], { key: "ArrowDown" });
    await waitFor(() =>
      expect(
        options(dialog).map((o) => o.getAttribute("aria-selected"))
      ).toEqual(["false", "true"])
    );
  });

  it("describes how to use the list once, rather than in every option", async () => {
    // As part of each option's name the instruction was re-read on every
    // arrow key; as a description on the list it is offered once, on entry.
    const { getByRole } = renderWorkbook();
    const dialog = await findAll(getByRole, "alpha");
    const listbox = within(dialog).getByRole("listbox");

    const describedBy = listbox.getAttribute("aria-describedby")!;
    const hint = document.getElementById(describedBy)!;
    expect(hint.textContent).toBe("Activate a result to go to that cell");
    // and the description is not inside the listbox, which must own only
    // its options.
    //
    // `contains` rather than `listbox.querySelector('#' + describedBy)`: these
    // ids come from useId, so they contain colons (`:r13:-results-hint`) and
    // are not valid in a bare id selector without CSS.escape. getElementById
    // and contains take an id as an id rather than as a selector, so neither
    // cares how it is spelled.
    expect(listbox.contains(hint)).toBe(false);
    expect(
      options(dialog).some((o) =>
        o.getAttribute("aria-label")!.includes("Activate")
      )
    ).toBe(false);
  });

  it("is a single tab stop, with the arrows moving inside it", async () => {
    const { getByRole } = renderWorkbook();
    const dialog = await findAll(getByRole, "alpha");
    const opts = options(dialog);

    expect(opts.map((o) => o.getAttribute("tabindex"))).toEqual(["0", "-1"]);

    opts[0].focus();
    fireEvent.keyDown(opts[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(opts[1]);

    await waitFor(() =>
      expect(
        options(dialog).map((o) => o.getAttribute("aria-selected"))
      ).toEqual(["false", "true"])
    );
    expect(options(dialog).map((o) => o.getAttribute("tabindex"))).toEqual([
      "-1",
      "0",
    ]);
  });

  it("jumps to the first and last option on Home and End", async () => {
    const { getByRole } = renderWorkbook();
    const dialog = await findAll(getByRole, "alpha");
    const opts = options(dialog);

    opts[0].focus();
    fireEvent.keyDown(opts[0], { key: "End" });
    expect(document.activeElement).toBe(opts[opts.length - 1]);

    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(document.activeElement).toBe(opts[0]);
  });

  it("keeps the arrow keys away from the sheet underneath", async () => {
    // The dialog renders inside the workbook container, whose keydown reads
    // arrows as selection moves. An arrow spent choosing a result must not
    // also slide the selection under the dialog.
    const { getByRole, ref } = renderWorkbook();
    const dialog = await findAll(getByRole, "alpha");
    const opts = options(dialog);
    const before = ref.current!.getSelectionCoordinates()[0];

    opts[0].focus();
    fireEvent.keyDown(opts[0], { key: "ArrowDown" });

    expect(ref.current!.getSelectionCoordinates()[0]).toBe(before);
  });

  it("resets the tab stop to the first option when a new search replaces the list", async () => {
    const { getByRole } = renderWorkbook();
    const dialog = await findAll(getByRole, "alpha");

    options(dialog)[0].focus();
    fireEvent.keyDown(options(dialog)[0], { key: "ArrowDown" });
    await waitFor(() =>
      expect(options(dialog)[1].getAttribute("tabindex")).toBe("0")
    );

    // "beta" matches one cell, so a stop left on the second option would point
    // past the end of the new list.
    fireEvent.change(within(dialog).getByLabelText("Find Content"), {
      target: { value: "beta" },
    });
    fireEvent.click(byId(dialog, "searchAllBtn"));

    await waitFor(() =>
      expect(options(dialog).map((o) => o.getAttribute("tabindex"))).toEqual([
        "0",
      ])
    );
  });

  it("selects the matched cell and closes when an option is clicked", async () => {
    const { getByRole, ref } = renderWorkbook();
    const dialog = await findAll(getByRole, "alpha");

    fireEvent.click(options(dialog)[0]);

    await waitFor(() => expect(dialog.isConnected).toBe(false));
    expect(ref.current!.getSelectionCoordinates()[0]).toMatch(/A1$/);
  });

  it("selects the matched cell and closes when an option is activated by Enter", async () => {
    const { getByRole, ref } = renderWorkbook();
    const dialog = await findAll(getByRole, "alpha");
    const second = options(dialog)[1];

    second.focus();
    fireEvent.keyDown(second, { key: "Enter" });

    await waitFor(() => expect(dialog.isConnected).toBe(false));
    expect(ref.current!.getSelectionCoordinates()[0]).toMatch(/A2$/);
  });

  it("renders no list at all before a search is run", async () => {
    const { getByRole, queryByRole } = renderWorkbook();
    fireEvent.click(getByRole("button", { name: /find and replace/i }));
    const dialog = await waitFor(() => getByRole("dialog"));
    expect(within(dialog).queryByRole("listbox")).toBeNull();
    expect(queryByRole("listbox", { name: "Search results" })).toBeNull();
  });
});
