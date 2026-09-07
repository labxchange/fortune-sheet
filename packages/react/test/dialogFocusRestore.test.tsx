import { render, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";
import { useDialogFocus } from "../src/hooks/useDialogFocus";

// Opened from the toolbar rather than with the Ctrl+Alt+/ shortcut, and that
// matters: the shortcut leaves <body> as the previously-focused element, and
// body.focus() is inert, so the restore has nothing to move focus to and these
// assertions would hold whether or not it ran. The toolbar trigger is a real
// focusable element, so they only hold when the restore actually fires.
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

/*
 * The deferred restore, at the hook rather than through the shortcut that
 * needs it.
 *
 * `Workbook`'s Ctrl/Cmd+Shift+M, +R and +L close the shortcuts dialog and open
 * a context menu in one update, and the menu autofocuses itself. That path
 * cannot be driven here — `handleContextMenu` needs real canvas geometry and
 * throws in jsdom — so what is pinned instead is the ordering it relies on: a
 * dialog unmounting in the same commit that mounts something which claims
 * focus in a mount effect. React runs that mount effect after the dialog's
 * passive cleanup and before the deferred restore's task, which is exactly the
 * window the re-check exists for.
 */
const tick = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

// `deferRestore`, as `Dialog` passes it.
const DeferredDialog: React.FC<{ onLeave: () => void }> = ({ onLeave }) => {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  useDialogFocus(dialogRef, inputRef, undefined, true);
  return (
    <div ref={dialogRef} role="dialog" tabIndex={-1}>
      <input ref={inputRef} aria-label="Search shortcuts" />
      <button type="button" onClick={onLeave}>
        Leave
      </button>
    </div>
  );
};

// `ContextMenu`'s autofocus arrives through `useEscapeToClose` in a plain
// mount effect; a plain mount effect is therefore all this needs to be.
const SelfFocusingMenu: React.FC = () => {
  const itemRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    itemRef.current?.focus();
  }, []);
  return (
    <div ref={itemRef} role="menuitem" tabIndex={-1}>
      Insert row above
    </div>
  );
};

const LeaveForMenuHarness: React.FC = () => {
  const [open, setOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open && (
        <DeferredDialog
          onLeave={() => {
            // One update, nothing focused synchronously — the shape of the
            // context-menu branch, and the opposite of the region branch.
            setOpen(false);
            setMenuOpen(true);
          }}
        />
      )}
      {menuOpen && <SelfFocusingMenu />}
    </div>
  );
};

describe("Dialog's deferred restore", () => {
  it("declines once something else has claimed focus", async () => {
    const { getByRole, queryByRole } = render(<LeaveForMenuHarness />);
    const opener = getByRole("button", { name: "Open" });
    opener.focus();
    fireEvent.click(opener);

    const dialog = await waitFor(() => getByRole("dialog"));
    // Focus is inside the dialog when the close arrives, so the unmount-time
    // gate passes and the restore really is scheduled. The re-check is the
    // only thing standing between it and the menu.
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.click(getByRole("button", { name: "Leave" }));

    await waitFor(() => expect(queryByRole("dialog")).toBeNull());
    const item = getByRole("menuitem");
    expect(document.activeElement).toBe(item);

    // Past the macrotask the restore was queued on: focus stays in the menu
    // instead of being dragged back to whatever opened the dialog, which
    // would strand the menu painted with focus outside it (WCAG 2.4.3) — the
    // very defect the close exists to fix.
    await act(async () => {
      await tick();
    });
    expect(document.activeElement).toBe(item);
    expect(document.activeElement).not.toBe(opener);
  });
});
