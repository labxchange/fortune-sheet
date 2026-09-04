import {
  render,
  fireEvent,
  waitFor,
  within,
  act,
} from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";

// SearchReplace borrows Dialog's focus behaviour through `useDialogFocus`
// rather than rendering through Dialog itself — it is draggable, absolutely
// positioned, and owns its own close button. These cases pin the borrowed half
// (dialog semantics, initial focus, Tab wrapping, restore-on-close) on both
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

// Mirrors useDialogFocus's own selector, both halves of it: this package
// spells "disabled" as `aria-disabled` on the `<div role="button">` controls it
// builds almost all of its chrome from, and as the attribute on native ones.
const focusablesIn = (dialog: HTMLElement) =>
  Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => !el.matches('[disabled], [aria-disabled="true"]'));

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

  it("exposes itself as a dialog named by its heading, and not as a modal one", async () => {
    const { getByRole } = renderWorkbook();
    openFromToolbar(getByRole);

    const dialog = await waitFor(() => getByRole("dialog"));
    // Asserted absent, not merely unset: aria-modal would tell a screen reader
    // the rest of the page is inert, and two things this dialog depends on live
    // outside it — SheetOverlay's #sr-selection, which announces Find Next and
    // a result-row jump, and the cell input that a result row hands focus to.
    // Under aria-modal a reader may ignore both, and which it ignores varies.
    expect(dialog.getAttribute("aria-modal")).toBeNull();
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

  it("skips a control that is disabled the way this package spells it", async () => {
    // Almost every control here is a `<div role="button">`, which cannot carry
    // the native attribute — `aria-disabled` is how disabled is written, and
    // the package's three other focusable selectors already exclude it. A trap
    // that only knew the attribute would wrap onto a control that announces
    // "dimmed" and does nothing.
    const { getByRole } = renderWorkbook();
    openFromToolbar(getByRole);
    const dialog = await waitFor(() => getByRole("dialog"));

    const focusable = focusablesIn(dialog);
    const disabled = focusable[focusable.length - 1];
    disabled.setAttribute("aria-disabled", "true");
    const last = focusable[focusable.length - 2];

    last.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(focusable[0]);
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

  it("leaves focus alone when it had already moved out to the grid", async () => {
    // The other consumer of the narrowed restore. `Dialog`'s case is the
    // shortcuts dialog leaving for a region shortcut; here the equivalent is
    // focus sitting in the grid — a normal state for this dialog, which is
    // deliberately non-modal over a live sheet — when the close arrives.
    //
    // Every control that closes this dialog today lives inside it, so in a
    // browser the closing control itself holds focus and the restore fires as
    // before; this pins the hook's contract for its second consumer, which the
    // two `Dialog` test files cover only for the first. Without the gate the
    // restore is unconditional and drags focus from the cell back to the
    // toolbar, undoing a move the user made.
    const { container, getByRole, queryByRole } = renderWorkbook();
    const opener = openFromToolbar(getByRole);
    const dialog = await waitFor(() => getByRole("dialog"));

    const cellInput = container.querySelector<HTMLElement>(
      "#luckysheet-rich-text-editor"
    )!;
    cellInput.focus();
    expect(document.activeElement).toBe(cellInput);

    fireEvent.click(footerClose(dialog));

    await waitFor(() => expect(queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(cellInput);
    expect(document.activeElement).not.toBe(opener);
  });

  it("does not send focus to the body when the opener is gone", async () => {
    // Focusing a detached node is a no-op — focus stays put — so restoring to
    // a removed opener would leave focus on the dialog's own control, which
    // then unmounts, and *that* is what drops focus to <body>. Hence the
    // fallback: the opener is skipped and the cell input takes focus instead.
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
    // `Dialog` passes `deferRestore`, so its restore lands a macrotask after the
    // unmount: the announcement whose result rides the focus utterance has to
    // reach the DOM first. `waitFor` resolves as soon as the dialog is gone,
    // which is before that timer. The restore itself is unchanged — same
    // opener, one task later — so this waits for it rather than relaxing it.
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    expect(document.activeElement).toBe(opener);
  });
});
