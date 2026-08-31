import { render, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";

const openFromToolbar = (getByRole: ReturnType<typeof render>["getByRole"]) => {
  // Matched on the prefix: since #26 the button quotes its own binding
  // ("Keyboard shortcuts (Ctrl + /)"), and `shortcutKeysForPlatform` makes that
  // suffix platform-dependent. What this helper needs is the trigger, not its
  // binding, so it does not assert one.
  const trigger = getByRole("button", { name: /^Keyboard shortcuts/ });
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
};

describe("Dialog focus on close", () => {
  it("returns focus to whatever opened it", async () => {
    const { getByRole, queryByRole } = render(
      <Workbook
        data={[{ name: "Sheet1" }]}
        toolbarItems={["keyboard-shortcuts"]}
      />
    );
    const trigger = openFromToolbar(getByRole);
    await waitFor(() => getByRole("dialog"));

    fireEvent.click(getByRole("button", { name: "Close" }));

    await waitFor(() => expect(queryByRole("dialog")).toBeNull());
    // Without a restore, focus falls to <body> when the dialog's DOM goes, and
    // a keyboard user has to tab in from the top of the page again (WCAG
    // 2.4.3).
    //
    // Awaited rather than asserted outright: `Dialog` passes `deferRestore`, so
    // the restore runs a task later, behind whatever announcement rides the
    // focus utterance of the element focus lands on. Focus is on <body> for
    // that one task.
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("still returns focus when the dialog is dismissed with Escape", async () => {
    const { getByRole, queryByRole } = render(
      <Workbook
        data={[{ name: "Sheet1" }]}
        toolbarItems={["keyboard-shortcuts"]}
      />
    );
    const trigger = openFromToolbar(getByRole);
    const dialog = await waitFor(() => getByRole("dialog"));

    // The search box is untouched here, so this Escape dismisses the dialog
    // rather than being spent clearing the box first.
    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => expect(queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
