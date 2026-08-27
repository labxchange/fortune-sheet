import { render, fireEvent, waitFor, within } from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";

// SearchReplace borrows Dialog's focus behaviour through `useDialogFocus`
// rather than rendering through Dialog itself — it is draggable, absolutely
// positioned, and owns its own close button. These cases pin the borrowed half
// (modal semantics, initial focus, Tab wrapping, restore-on-close) on both
// callers, since a hook used by two components can regress for one of them
// while the other stays green.
//
// What jsdom cannot show: that a screen reader announces the dialog's role and
// name on open, or that focus is *visibly* where these assertions say it is.
// Both need the review-app pass listed in the PR.

const openFromToolbar = (getByRole: any) => {
  const opener = getByRole("button", { name: /find and replace/i });
  opener.focus();
  fireEvent.click(opener);
  return opener;
};

const focusablesIn = (dialog: HTMLElement) =>
  Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => !el.hasAttribute("disabled"));

// The dialog carries two controls named "Close" — the icon in the corner and
// the footer button — so a query for that name has to say which one it means.
// Both run the same closeDialog path; the footer button is the one a keyboard
// user tabs to.
const footerClose = (dialog: HTMLElement) =>
  within(dialog)
    .getAllByRole("button", { name: "Close" })
    .find((el) => el.classList.contains("close-button"))!;

const renderWorkbook = () =>
  render(<Workbook data={[{ name: "Sheet1" }]} toolbarItems={["search"]} />);

describe("Find and Replace dialog focus", () => {
  it("is closed until asked for", () => {
    const { queryByRole } = renderWorkbook();
    expect(queryByRole("dialog")).toBeNull();
  });

  it("exposes itself as a modal dialog named by its heading", async () => {
    const { getByRole } = renderWorkbook();
    openFromToolbar(getByRole);

    const dialog = await waitFor(() => getByRole("dialog"));
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)?.textContent).toBe(
      "Find and Replace"
    );
  });

  it("lands focus on the find box rather than the close button", async () => {
    const { getByRole } = renderWorkbook();
    openFromToolbar(getByRole);

    const dialog = await waitFor(() => getByRole("dialog"));
    const findBox = within(dialog).getByLabelText(/find content/i);
    expect(document.activeElement).toBe(findBox);
    // The regression this guards: the first focusable element is the close
    // button, so a default-to-first trap would open on Close.
    expect(focusablesIn(dialog)[0]).not.toBe(findBox);
  });

  it("wraps Tab at the last control and Shift+Tab at the first", async () => {
    const { getByRole } = renderWorkbook();
    openFromToolbar(getByRole);
    const dialog = await waitFor(() => getByRole("dialog"));

    const focusable = focusablesIn(dialog);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    last.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("leaves a Tab in the middle of the dialog to the browser", async () => {
    // Only the edges are redirected; preventing default everywhere would break
    // normal forward movement through the controls.
    const { getByRole } = renderWorkbook();
    openFromToolbar(getByRole);
    const dialog = await waitFor(() => getByRole("dialog"));

    const focusable = focusablesIn(dialog);
    focusable[1].focus();
    const notPrevented = fireEvent.keyDown(dialog, { key: "Tab" });
    expect(notPrevented).toBe(true);
    expect(document.activeElement).toBe(focusable[1]);
  });

  it("traps against the Replace controls once the Replace tab is selected", async () => {
    // The focusable set grows by an input and two buttons when Replace is
    // shown. A first/last pair captured at open would trap against the wrong
    // edge, so the set has to be re-read at keydown.
    const { getByRole } = renderWorkbook();
    openFromToolbar(getByRole);
    const dialog = await waitFor(() => getByRole("dialog"));

    const beforeCount = focusablesIn(dialog).length;
    fireEvent.click(within(dialog).getByRole("button", { name: "Replace" }));
    await waitFor(() =>
      expect(focusablesIn(dialog).length).toBeGreaterThan(beforeCount)
    );

    const focusable = focusablesIn(dialog);
    const last = focusable[focusable.length - 1];
    last.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(focusable[0]);
  });

  it("returns focus to the control that opened it", async () => {
    const { getByRole, queryByRole } = renderWorkbook();
    const opener = openFromToolbar(getByRole);

    const dialog = await waitFor(() => getByRole("dialog"));
    expect(document.activeElement).not.toBe(opener);

    fireEvent.click(footerClose(dialog));

    await waitFor(() => expect(queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(opener);
  });

  it("does not send focus to the body when the opener is gone", async () => {
    // Focusing a detached node silently focuses <body> — the exact failure the
    // restore exists to prevent — so a vanished opener must be left alone.
    const { getByRole, queryByRole } = renderWorkbook();
    const opener = openFromToolbar(getByRole);
    const dialog = await waitFor(() => getByRole("dialog"));

    opener.remove();
    const findBox = within(dialog).getByLabelText(/find content/i);
    findBox.focus();
    fireEvent.click(footerClose(dialog));

    await waitFor(() => expect(queryByRole("dialog")).toBeNull());
    expect(document.activeElement).not.toBe(document.body);
  });
});

describe("useDialogFocus blast radius: the shortcuts dialog", () => {
  // ShortcutsDialog renders through Dialog, whose effect the hook replaced.
  // Its behaviour must be byte-for-byte what it was before the extraction.
  const openShortcuts = (container: HTMLElement) => {
    const workbook =
      container.querySelector<HTMLElement>(".fortune-container")!;
    fireEvent.keyDown(workbook, { key: "/", code: "Slash", ctrlKey: true });
  };

  it("still traps Tab inside the dialog", async () => {
    const { container, getByRole } = render(
      <Workbook data={[{ name: "Sheet1" }]} />
    );
    openShortcuts(container);
    const dialog = await waitFor(() => getByRole("dialog"));

    const focusable = focusablesIn(dialog);
    const last = focusable[focusable.length - 1];
    last.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(focusable[0]);
  });

  it("still restores focus to the opener when it closes", async () => {
    const { getByRole, queryByRole } = render(
      <Workbook
        data={[{ name: "Sheet1" }]}
        toolbarItems={["keyboard-shortcuts"]}
      />
    );
    const opener = getByRole("button", { name: /keyboard shortcuts/i });
    opener.focus();
    fireEvent.click(opener);

    const dialog = await waitFor(() => getByRole("dialog"));
    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => expect(queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(opener);
  });
});
