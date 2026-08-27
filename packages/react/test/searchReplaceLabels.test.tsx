import { render, fireEvent, waitFor, within } from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";

// Every input in the Find and Replace dialog is named by a real <label for>,
// rather than by a bare text node sitting next to it. The distinction is
// invisible on screen and total for AT: an adjacent text node contributes
// nothing to an input's accessible name.
//
// getByLabelText is the assertion rather than a getAttribute check on purpose —
// it resolves the name the way an AT would, so a label whose `for` misses its
// input fails here even though both elements exist.

const openDialog = async (getByRole: any) => {
  const opener = getByRole("button", { name: /find and replace/i });
  fireEvent.click(opener);
  return waitFor(() => getByRole("dialog"));
};

const renderWorkbook = () =>
  render(<Workbook data={[{ name: "Sheet1" }]} toolbarItems={["search"]} />);

describe("Find and Replace accessible labels", () => {
  it("names the find box", async () => {
    const { getByRole } = renderWorkbook();
    const dialog = await openDialog(getByRole);

    const findBox = within(dialog).getByLabelText("Find Content");
    expect(findBox.tagName).toBe("INPUT");
    expect(findBox.getAttribute("type")).not.toBe("checkbox");
  });

  it("names the replace box, which only exists on the Replace tab", async () => {
    const { getByRole } = renderWorkbook();
    const dialog = await openDialog(getByRole);

    expect(within(dialog).queryByLabelText("Replace Content")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Replace" }));

    const replaceBox = await waitFor(() =>
      within(dialog).getByLabelText("Replace Content")
    );
    expect(replaceBox.tagName).toBe("INPUT");
  });

  it("names all three option checkboxes", async () => {
    const { getByRole } = renderWorkbook();
    const dialog = await openDialog(getByRole);

    ["Regular Expression", "Whole word", "Case sensitive"].forEach((name) => {
      const box = within(dialog).getByLabelText(name);
      expect(box.getAttribute("type")).toBe("checkbox");
    });
  });

  it("keeps the label wired to the input it names, not merely present", async () => {
    // The failure a text-node "label" produces: the words render, and the
    // input still has no name. Asserting the association directly.
    const { getByRole } = renderWorkbook();
    const dialog = await openDialog(getByRole);

    const findBox = within(dialog).getByLabelText("Find Content");
    const label = dialog.querySelector<HTMLLabelElement>(
      `label[for="${findBox.id}"]`
    );
    expect(label).toBeTruthy();
    expect(findBox.id).toBeTruthy();
  });

  it("activates the checkbox when its label is clicked", async () => {
    // A `for` that points at the wrong id still passes a name check but breaks
    // the click target, so the association is exercised both ways.
    const { getByRole } = renderWorkbook();
    const dialog = await openDialog(getByRole);

    const caseBox = within(dialog).getByLabelText(
      "Case sensitive"
    ) as HTMLInputElement;
    expect(caseBox.checked).toBe(false);

    fireEvent.click(
      dialog.querySelector<HTMLLabelElement>(`label[for="${caseBox.id}"]`)!
    );
    expect(caseBox.checked).toBe(true);
  });

  it("leaves the visible colon out of the accessible name", async () => {
    // Read aloud at high punctuation verbosity, and it is a hardcoded
    // fullwidth colon no locale overrides — so it stays a sibling text node.
    const { getByRole } = renderWorkbook();
    const dialog = await openDialog(getByRole);

    const findBox = within(dialog).getByLabelText("Find Content");
    const label = dialog.querySelector<HTMLLabelElement>(
      `label[for="${findBox.id}"]`
    )!;
    expect(label.textContent).toBe("Find Content");
    expect(dialog.textContent).toContain("：");
  });
});
