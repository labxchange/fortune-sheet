import {
  render,
  fireEvent,
  waitFor,
  within,
  act,
} from "@testing-library/react";
import React from "react";
import Workbook, { WorkbookInstance } from "../src/components/Workbook";

// The dialog's live region is deliberately narrow: it covers only the two
// outcomes nothing else speaks for. Replace All, an empty Find All and every
// failure path open a MessageBox that takes focus; Find Next and activating a
// result row move the selection, which SheetOverlay's assertive #sr-selection
// announces. These cases pin both halves — that the two silent outcomes now
// speak, and that the others are still left alone, since a second region is
// how a dialog ends up saying everything twice.
//
// What jsdom cannot show: that VoiceOver or NVDA actually voices the region,
// or the order it interleaves with #sr-selection. Listed in the PR for the
// review-app pass.

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

const openDialog = async (getByRole: any) => {
  fireEvent.click(getByRole("button", { name: /find and replace/i }));
  return waitFor(() => getByRole("dialog"));
};

const regionIn = (dialog: HTMLElement) =>
  dialog.querySelector<HTMLElement>('.sr-only[role="status"]')!;

// Both the Replace *tab* and the Replace *button* are named exactly
// "Replace", so they are addressed by id rather than by name.
const byId = (dialog: HTMLElement, id: string) =>
  dialog.querySelector<HTMLElement>(`#${id}`)!;

const typeFind = (dialog: HTMLElement, text: string) =>
  fireEvent.change(within(dialog).getByLabelText("Find Content"), {
    target: { value: text },
  });

describe("Find and Replace announcements", () => {
  it("starts silent", async () => {
    const { getByRole } = renderWorkbook();
    const dialog = await openDialog(getByRole);
    expect(regionIn(dialog)).toBeTruthy();
    expect(regionIn(dialog).textContent).toBe("");
  });

  it("is polite, so it cannot interrupt the cell announcement", async () => {
    // #sr-selection is assertive; an assertive region here would cut across
    // the cell the user navigated to hear.
    const { getByRole } = renderWorkbook();
    const dialog = await openDialog(getByRole);
    expect(regionIn(dialog).getAttribute("role")).toBe("status");
  });

  it("reports how many matches Find All turned up, and that a table appeared", async () => {
    const { getByRole } = renderWorkbook();
    const dialog = await openDialog(getByRole);

    typeFind(dialog, "alpha");
    fireEvent.click(byId(dialog, "searchAllBtn"));

    await waitFor(() =>
      expect(regionIn(dialog).textContent).toContain("Matches found: 2")
    );
    expect(regionIn(dialog).textContent).toContain("Results table displayed");
  });

  it("re-announces an identical repeated search", async () => {
    // A live region is spoken when its text changes, so running the same
    // search twice would otherwise be silent the second time.
    const { getByRole } = renderWorkbook();
    const dialog = await openDialog(getByRole);
    const findAll = byId(dialog, "searchAllBtn");

    typeFind(dialog, "alpha");
    fireEvent.click(findAll);
    const first = await waitFor(() => {
      const text = regionIn(dialog).textContent!;
      expect(text).toContain("Matches found: 2");
      return text;
    });

    fireEvent.click(findAll);
    await waitFor(() => expect(regionIn(dialog).textContent).not.toBe(first));
    // Same words, different text node — the marker is invisible and unspoken.
    expect(regionIn(dialog).textContent).toContain("Matches found: 2");
    expect(regionIn(dialog).textContent!.replace(/\u200B/g, "")).toBe(first);
  });

  it("stays silent when Find All finds nothing, because a dialog already says so", async () => {
    const { getByRole } = renderWorkbook();
    const dialog = await openDialog(getByRole);

    typeFind(dialog, "nothing-matches-this");
    fireEvent.click(byId(dialog, "searchAllBtn"));

    await waitFor(() =>
      expect(document.body.textContent).toContain("The content was not found")
    );
    expect(regionIn(dialog).textContent).toBe("");
  });

  it("reports a single replacement, which nothing visible reports", async () => {
    // "Occurrences replaced: 1", not "1 occurrences replaced": these strings
    // are read aloud and the package has no pluralization layer, so the count
    // goes last. Asserted with the count to catch a reordering back.
    const { getByRole } = renderWorkbook();
    const dialog = await openDialog(getByRole);

    fireEvent.click(byId(dialog, "replaceTab"));
    typeFind(dialog, "alpha");
    fireEvent.change(within(dialog).getByLabelText("Replace Content"), {
      target: { value: "gamma" },
    });
    fireEvent.click(byId(dialog, "replaceBtn"));

    await waitFor(() =>
      expect(regionIn(dialog).textContent).toContain("Occurrences replaced: 1")
    );
  });

  it("leaves Replace All to its own dialog rather than saying it twice", async () => {
    const { getByRole } = renderWorkbook();
    const dialog = await openDialog(getByRole);

    fireEvent.click(byId(dialog, "replaceTab"));
    typeFind(dialog, "alpha");
    fireEvent.change(within(dialog).getByLabelText("Replace Content"), {
      target: { value: "gamma" },
    });
    fireEvent.click(byId(dialog, "replaceAllBtn"));

    await waitFor(() =>
      expect(document.body.textContent).toContain("Occurrences replaced")
    );
    expect(regionIn(dialog).textContent).toBe("");
  });
});

describe("replaceAll's own message", () => {
  it("reports a replacement rather than a find", async () => {
    // It used to reuse `successTip` — "N items found" in English, and "made N
    // replacements" in zh_tw. The key meant two different things, and English
    // had the wrong one for an action that just rewrote the cells.
    const { getByRole } = renderWorkbook();
    const dialog = await openDialog(getByRole);

    fireEvent.click(byId(dialog, "replaceTab"));
    typeFind(dialog, "alpha");
    fireEvent.change(within(dialog).getByLabelText("Replace Content"), {
      target: { value: "gamma" },
    });
    fireEvent.click(byId(dialog, "replaceAllBtn"));

    await waitFor(() =>
      expect(document.body.textContent).toContain("Occurrences replaced: 2")
    );
    expect(document.body.textContent).not.toContain("2 items found");
  });
});
