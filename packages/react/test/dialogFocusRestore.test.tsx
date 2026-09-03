import { render, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";

// Opened from the toolbar rather than with the Ctrl+Alt+/ shortcut, and that
// matters: the shortcut leaves <body> as the previously-focused element, and
// body.focus() is inert, so the restore has nothing to move focus to and these
// assertions would hold whether or not it ran. The toolbar trigger is a real
// focusable element, so they only hold when the restore actually fires.
const openFromToolbar = (getByRole: ReturnType<typeof render>["getByRole"]) => {
  const trigger = getByRole("button", { name: "Keyboard shortcuts" });
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
    expect(document.activeElement).toBe(trigger);
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
    expect(document.activeElement).toBe(trigger);
  });
});
