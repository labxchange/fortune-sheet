import {
  render,
  fireEvent,
  waitFor,
  act,
  screen,
} from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";
import { CONTEXT_MENU_REGION_ID_SUFFIX } from "../src/hooks/useContextMenuAnnouncements";

// WCAG 2.1.1, 4.1.2, 2.4.3 and 4.1.3 together, because they are one interaction.
//
// The audit reported "no keyboard-accessible option to rename a sheet". There
// was one — `rename` is in the default sheetTabContextMenu and the row
// activates — but activating it put the tab into edit mode and left focus on
// the options caret, so the name looked selected and every keystroke went
// nowhere. Fixing the focus exposes the rest: the field had no role and no
// name, Escape did nothing, Enter dropped focus on <body>, and neither outcome
// was announced.

const renderTabs = (names = ["Sheet1", "Sheet2"]) =>
  render(
    <Workbook
      lang="en"
      data={names.map((name, i) => ({ name, id: `s${i + 1}` }))}
    />
  );

/** focusAfterCommit and the announcement both defer by a task. */
const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
};

const tabFor = (name: string) =>
  screen.getByText(name).closest(".luckysheet-sheets-item") as HTMLElement;

const nameFieldFor = (name: string) =>
  screen.getByText(name).closest(".luckysheet-sheets-item-name") as HTMLElement;

const statusRegion = () =>
  document.querySelector<HTMLElement>(
    `[id$="-${CONTEXT_MENU_REGION_ID_SUFFIX}"]`
  );

/** Every tab carries its own caret, so it has to be scoped to one of them. */
const caretFor = (name: string) =>
  tabFor(name).querySelector<HTMLElement>(
    ".luckysheet-sheets-item-function"
  ) as HTMLElement;

/** Open a tab's options menu and activate Rename, all from the keyboard. */
const startRename = async (name = "Sheet1") => {
  const caret = caretFor(name);
  act(() => {
    caret.focus();
    fireEvent.keyDown(caret, { key: "Enter" });
  });
  await waitFor(() => screen.getByText("Rename"));
  const row = screen.getByText("Rename").closest('[role="button"]')!;
  act(() => {
    (row as HTMLElement).focus();
    fireEvent.keyDown(row, { key: "Enter" });
  });
  await flush();
};

/** Type into the contenteditable the way the browser would: text, then input. */
const typeName = (field: HTMLElement, value: string) => {
  act(() => {
    field.innerText = value;
    fireEvent.input(field);
  });
};

describe("Sheet rename accessibility", () => {
  it("puts focus in the name field when Rename is activated from the keyboard", async () => {
    renderTabs();
    await startRename();

    const field = nameFieldFor("Sheet1");
    expect(field.getAttribute("contenteditable")).toBe("true");
    // The bug: focus stayed on the caret because useEscapeToClose's cleanup
    // restores it during the same commit, and React runs every passive destroy
    // before any create. Deferring past the whole phase is what wins.
    expect(document.activeElement).toBe(field);
    expect(document.activeElement).not.toBe(caretFor("Sheet1"));
  });

  it("exposes the field as a named text box only while editing", async () => {
    renderTabs();
    const field = nameFieldFor("Sheet1");

    // Not a textbox at rest, or every tab in the strip would announce one.
    expect(field.getAttribute("role")).toBeNull();
    expect(field.getAttribute("aria-label")).toBeNull();

    await startRename();

    expect(field.getAttribute("role")).toBe("textbox");
    expect(field.getAttribute("aria-label")).toBe("Sheet name");
    // Generic, not the sheet's own name — the tab already carries that, and
    // repeating it would say nothing about there being a field.
    expect(field.getAttribute("aria-label")).not.toBe("Sheet1");
  });

  it("commits with Enter and returns focus to the tab, not the body", async () => {
    renderTabs();
    await startRename();
    const field = nameFieldFor("Sheet1");

    typeName(field, "Results");
    act(() => {
      fireEvent.keyDown(field, { key: "Enter" });
    });
    await flush();

    expect(screen.getByText("Results")).toBeTruthy();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(tabFor("Results"));
  });

  it("announces a successful rename", async () => {
    renderTabs();
    await startRename();

    typeName(nameFieldFor("Sheet1"), "Results");
    act(() => {
      fireEvent.keyDown(nameFieldFor("Results"), { key: "Enter" });
    });
    await flush();

    await waitFor(() =>
      expect(statusRegion()?.textContent).toContain("Sheet renamed to Results")
    );
  });

  it("reverts the name on Escape and leaves edit mode", async () => {
    renderTabs();
    await startRename();
    const field = nameFieldFor("Sheet1");

    typeName(field, "Discarded");
    act(() => {
      fireEvent.keyDown(field, { key: "Escape" });
    });
    await flush();

    expect(screen.getByText("Sheet1")).toBeTruthy();
    expect(screen.queryByText("Discarded")).toBeNull();
    expect(nameFieldFor("Sheet1").getAttribute("contenteditable")).toBe(
      "false"
    );
  });

  it("returns focus to the tab after Escape", async () => {
    renderTabs();
    await startRename();

    typeName(nameFieldFor("Sheet1"), "Discarded");
    act(() => {
      fireEvent.keyDown(nameFieldFor("Discarded"), { key: "Escape" });
    });
    await flush();

    expect(document.activeElement).toBe(tabFor("Sheet1"));
  });

  it("does not commit the restored text through the blur that follows Escape", async () => {
    renderTabs();
    await startRename();
    const field = nameFieldFor("Sheet1");

    typeName(field, "Discarded");
    act(() => {
      fireEvent.keyDown(field, { key: "Escape" });
    });
    // The blur Escape triggers would otherwise run editSheetName over the
    // restored text — which succeeds, being unchanged, and announces a rename
    // the user just cancelled.
    act(() => {
      fireEvent.blur(field);
    });
    await flush();

    expect(screen.getByText("Sheet1")).toBeTruthy();
    expect(statusRegion()?.textContent).not.toContain("Sheet renamed");
  });

  it("announces the cancellation rather than a rename", async () => {
    renderTabs();
    await startRename();

    typeName(nameFieldFor("Sheet1"), "Discarded");
    act(() => {
      fireEvent.keyDown(nameFieldFor("Discarded"), { key: "Escape" });
    });
    await flush();

    await waitFor(() =>
      expect(statusRegion()?.textContent).toContain("Rename cancelled")
    );
    expect(statusRegion()?.textContent).not.toContain("Sheet renamed");
  });

  it("does not announce a rename that changed nothing", async () => {
    renderTabs();
    await startRename();
    const field = nameFieldFor("Sheet1");

    typeName(field, "Sheet1");
    act(() => {
      fireEvent.keyDown(field, { key: "Enter" });
    });
    await flush();

    // The commit path has to have run for the silence to mean anything: a
    // `startRename` that quietly did nothing would satisfy the negative on its
    // own. Leaving edit mode is the observable proof it got as far as `onBlur`.
    expect(field.getAttribute("contenteditable")).toBe("false");
    expect(statusRegion()?.textContent).not.toContain("Sheet renamed");
  });

  it("does not announce a rename rejected as a duplicate", async () => {
    renderTabs();
    await startRename();
    const field = nameFieldFor("Sheet1");

    // editSheetName returns *quietly* for a duplicate — it restores the old
    // text and does not throw — so "did not throw" is not a success signal.
    typeName(field, "Sheet2");
    act(() => {
      fireEvent.keyDown(field, { key: "Enter" });
    });
    await flush();

    expect(screen.getByText("Sheet1")).toBeTruthy();
    expect(statusRegion()?.textContent).not.toContain("Sheet renamed");
  });

  it("announces the name the sheet actually got, not a tidied-up one", async () => {
    // `tests/setup.js` approximates jsdom's missing `innerText` with
    // `textContent`, which is exact for a plain single-line span and not exact
    // for the one shape a contenteditable really produces: Chrome leaves a
    // trailing `<br>` in an edited field, so real `innerText` reports
    // "Results\n" where `textContent` reports "Results". Every other case in
    // this file therefore reads a value a browser would not necessarily give,
    // and the success gate *is* an `innerText` comparison. Emulated on this one
    // element so the gate meets the shape it will actually see.
    renderTabs();
    await startRename();
    const field = nameFieldFor("Sheet1");

    typeName(field, "Results");
    Object.defineProperty(field, "innerText", {
      configurable: true,
      get() {
        return `${this.textContent}\n`;
      },
      set(value: string) {
        this.textContent = value;
      },
    });

    act(() => {
      fireEvent.keyDown(field, { key: "Enter" });
    });
    await flush();

    // `editSheetName` writes the sheet name from the same accessor the gate
    // compares, so the two agree by construction — the announcement names
    // exactly what the sheet is now called. Normalising in the gate would be
    // the bug, not the fix: it would speak a name the sheet does not have.
    // Read off the tab's own accessible name rather than through `getByText`,
    // whose normaliser collapses the trailing newline this case is about.
    const stored = document
      .querySelector(".luckysheet-sheets-item")!
      .getAttribute("aria-label");
    expect(stored).toBe("Results\n");
    await waitFor(() =>
      expect(statusRegion()?.textContent).toContain(
        `Sheet renamed to ${stored}`
      )
    );
  });

  it("keeps arrow keys inside the name instead of moving between tabs", async () => {
    renderTabs();
    await startRename();
    const field = nameFieldFor("Sheet1");

    act(() => {
      fireEvent.keyDown(field, { key: "ArrowRight" });
    });

    // useRovingFocus excludes contenteditable; this guards that it stayed that
    // way, since its listener is native and stopPropagation cannot reach it.
    expect(document.activeElement).toBe(field);
    expect(document.activeElement).not.toBe(tabFor("Sheet2"));
  });
});
