import {
  render,
  fireEvent,
  waitFor,
  within,
  act,
} from "@testing-library/react";
import React from "react";
import { GRID_ROOT_CLASS } from "@fortune-sheet/core";
import Workbook, { WorkbookInstance } from "../src/components/Workbook";

const openWithShortcut = (container: HTMLElement) => {
  const workbook = container.querySelector<HTMLElement>(".fortune-container")!;
  fireEvent.keyDown(workbook, { key: "/", code: "Slash", ctrlKey: true });
};

describe("Keyboard shortcuts dialog", () => {
  it("is closed until asked for", () => {
    const { queryByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    expect(queryByRole("dialog")).toBeNull();
  });

  it("opens with Ctrl+/ and lists the workbook's shortcuts", async () => {
    const { container, getByRole } = render(
      <Workbook data={[{ name: "Sheet1" }]} />
    );

    openWithShortcut(container);

    const dialog = await waitFor(() => getByRole("dialog"));
    expect(within(dialog).getByText("Copy")).toBeTruthy();
    expect(within(dialog).getByText("Select entire column")).toBeTruthy();
    expect(within(dialog).getByText("Paste values only")).toBeTruthy();
  });

  it("names itself by its heading", async () => {
    const { container, getByRole } = render(
      <Workbook data={[{ name: "Sheet1" }]} />
    );

    openWithShortcut(container);

    const dialog = await waitFor(() => getByRole("dialog"));
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)?.textContent).toBe(
      "Keyboard Shortcuts"
    );
  });

  it("exposes its scrollable content as a focusable, named region", async () => {
    const { container, getByRole } = render(
      <Workbook data={[{ name: "Sheet1" }]} />
    );

    openWithShortcut(container);

    const dialog = await waitFor(() => getByRole("dialog"));
    const region = within(dialog).getByRole("region", {
      name: "Keyboard shortcuts, scrollable",
    });
    expect(region.getAttribute("tabIndex")).toBe("0");
    region.focus();
    expect(document.activeElement).toBe(region);
  });

  it("opens from the toolbar button too", async () => {
    const { getByRole, queryByRole } = render(
      <Workbook
        data={[{ name: "Sheet1" }]}
        toolbarItems={["keyboard-shortcuts"]}
      />
    );
    expect(queryByRole("dialog")).toBeNull();

    // The button quotes the binding that opens the dialog — the one shortcut
    // the dialog itself cannot teach. jsdom reports no Mac platform, so this is
    // the non-Mac form.
    fireEvent.click(
      getByRole("button", { name: "Keyboard shortcuts (Ctrl + /)" })
    );

    await waitFor(() => expect(getByRole("dialog")).toBeTruthy());
  });

  it("opens even where / is a shifted key", async () => {
    // `e.key` is the composed character, so `/` arrives with shiftKey true on
    // German and Nordic layouts (Shift+7) and on AZERTY (Shift+:). Rejecting
    // Shift made the dialog — this feature's whole discoverability route —
    // unreachable there, and bought nothing on US layouts, where Shift+/ is "?"
    // and never matches in the first place.
    const { container, getByRole } = render(
      <Workbook data={[{ name: "Sheet1" }]} />
    );
    const workbook =
      container.querySelector<HTMLElement>(".fortune-container")!;

    fireEvent.keyDown(workbook, {
      key: "/",
      code: "Digit7",
      ctrlKey: true,
      shiftKey: true,
    });

    await waitFor(() => expect(getByRole("dialog")).toBeTruthy());
  });

  it("overlays the workbook instead of displacing it", async () => {
    // It first shipped in a wrapper with no CSS behind it, which made the
    // dialog a flex item of `.fortune-container` — a column — so it rendered
    // above the sheet and pushed it down the page instead of floating over it.
    const { container, getByRole } = render(
      <Workbook data={[{ name: "Sheet1" }]} />
    );

    openWithShortcut(container);
    const dialog = await waitFor(() => getByRole("dialog"));

    // `.fortune-popover-backdrop` is position:absolute, which is what lifts
    // the dialog out of that column; `.fortune-container` is position:relative,
    // so the backdrop covers the workbook and nothing wider.
    const backdrop = dialog.closest(".fortune-popover-backdrop");
    expect(backdrop).toBeTruthy();
    expect(backdrop!.classList.contains("fortune-modal-container")).toBe(true);
    expect(backdrop!.closest(".fortune-container")).toBeTruthy();
  });

  describe("search", () => {
    const searchBox = (getByRole: any) =>
      getByRole("searchbox", { name: "Search shortcuts" });

    it("lands focus on the search box, not the close button", async () => {
      const { container, getByRole } = render(
        <Workbook data={[{ name: "Sheet1" }]} />
      );
      openWithShortcut(container);
      await waitFor(() => getByRole("dialog"));

      expect(document.activeElement).toBe(searchBox(getByRole));
    });

    it("keeps focus in the box while typing", async () => {
      // Dialog re-ran its open-time setup whenever a handler identity changed,
      // and this dialog passes an Escape handler that depends on the query — so
      // every keystroke re-focused the first focusable element and the caret
      // jumped to the close button.
      const { container, getByRole } = render(
        <Workbook data={[{ name: "Sheet1" }]} />
      );
      openWithShortcut(container);
      await waitFor(() => getByRole("dialog"));
      const box = searchBox(getByRole);

      ["c", "co", "cop", "copy"].forEach((value) => {
        fireEvent.change(box, { target: { value } });
        expect(document.activeElement).toBe(box);
      });
    });

    it("filters by action text", async () => {
      const { container, getByRole, queryByText } = render(
        <Workbook data={[{ name: "Sheet1" }]} />
      );
      openWithShortcut(container);
      await waitFor(() => getByRole("dialog"));

      expect(queryByText("Copy")).toBeTruthy();
      fireEvent.change(searchBox(getByRole), {
        target: { value: "entire column" },
      });

      expect(queryByText("Select entire column")).toBeTruthy();
      expect(queryByText("Copy")).toBeNull();
    });

    it("matches on key notation too", async () => {
      const { container, getByRole, queryByText } = render(
        <Workbook data={[{ name: "Sheet1" }]} />
      );
      openWithShortcut(container);
      await waitFor(() => getByRole("dialog"));

      fireEvent.change(searchBox(getByRole), { target: { value: "F8" } });

      expect(queryByText("Add another range to the selection")).toBeTruthy();
      expect(queryByText("Copy")).toBeNull();
    });

    it("drops sections that have no matches rather than leaving bare headings", async () => {
      const { container, getByRole, queryByText } = render(
        <Workbook data={[{ name: "Sheet1" }]} />
      );
      openWithShortcut(container);
      await waitFor(() => getByRole("dialog"));

      fireEvent.change(searchBox(getByRole), {
        target: { value: "entire column" },
      });

      expect(queryByText("Selection")).toBeTruthy();
      expect(queryByText("Navigation")).toBeNull();
    });

    it("explains an empty result and reports the count to a screen reader", async () => {
      const { container, getByRole, queryByText } = render(
        <Workbook data={[{ name: "Sheet1" }]} />
      );
      openWithShortcut(container);
      await waitFor(() => getByRole("dialog"));

      fireEvent.change(searchBox(getByRole), { target: { value: "zzzz" } });

      expect(queryByText(/No shortcuts match/)).toBeTruthy();
      // The sheet overlay has live regions of its own, so scope to the dialog.
      const status = within(getByRole("dialog")).getByRole("status");
      expect(status.textContent).toContain("0 shortcuts found");
    });

    it("Escape clears a non-empty box before it closes the dialog", async () => {
      const { container, getByRole, queryByRole, queryByText } = render(
        <Workbook data={[{ name: "Sheet1" }]} />
      );
      openWithShortcut(container);
      await waitFor(() => getByRole("dialog"));
      const box = searchBox(getByRole);

      fireEvent.change(box, { target: { value: "copy" } });
      fireEvent.keyDown(box, { key: "Escape" });

      expect(box.value).toBe("");
      expect(getByRole("dialog")).toBeTruthy();

      // A second Escape, now that the box is empty, closes as usual.
      fireEvent.keyDown(box, { key: "Escape" });
      await waitFor(() => expect(queryByRole("dialog")).toBeNull());
      expect(queryByText("Keyboard Shortcuts")).toBeNull();
    });

    it("starts from the full list when reopened", async () => {
      const { container, getByRole, queryByText } = render(
        <Workbook data={[{ name: "Sheet1" }]} />
      );
      openWithShortcut(container);
      await waitFor(() => getByRole("dialog"));
      fireEvent.change(searchBox(getByRole), { target: { value: "zzzz" } });
      expect(queryByText(/No shortcuts match/)).toBeTruthy();

      // First Escape clears the filter, second closes — see the test above.
      fireEvent.keyDown(getByRole("dialog"), { key: "Escape" });
      fireEvent.keyDown(getByRole("dialog"), { key: "Escape" });
      await waitFor(() =>
        expect(container.querySelector('[role="dialog"]')).toBeNull()
      );

      openWithShortcut(container);
      await waitFor(() => getByRole("dialog"));
      expect(searchBox(getByRole).value).toBe("");
      expect(queryByText("Copy")).toBeTruthy();
    });
  });

  it("closes itself and moves focus when a Go To region shortcut fires from inside it", async () => {
    // Activating "Go to Spreadsheet" (Ctrl+Alt+S) while this dialog was open
    // used to move focus to the grid but leave the dialog open behind it,
    // still painted on top with its Tab trap covering only its own subtree, so
    // focus walked the page underneath (WCAG 2.4.3 focus order).
    const { container, getByRole, queryByRole } = render(
      <Workbook
        data={[{ name: "Sheet1" }]}
        toolbarItems={["keyboard-shortcuts"]}
      />
    );
    // Opened from the toolbar rather than with openWithShortcut: the shortcut
    // leaves <body> as the previously-focused element, and body.focus() is
    // inert, so Dialog's restore has nothing to yank focus back to and this
    // assertion holds even with the restore left unconditional. The toolbar
    // trigger is a real focusable element, so it does not.
    // Prefix match: the button quotes its platform-dependent binding since #26.
    const trigger = getByRole("button", { name: /^Keyboard shortcuts/ });
    trigger.focus();
    fireEvent.click(trigger);
    await waitFor(() => getByRole("dialog"));

    // Fired on the actually-focused element — the search box, which
    // ShortcutsDialog passes as initialFocusRef — rather than on the dialog:
    // that matches the reported repro, and firing on the dialog only works
    // today because the input adds no onKeyDown of its own. The day one calls
    // stopPropagation the real shortcut breaks while a dialog-level fire keeps
    // passing.
    fireEvent.keyDown(document.activeElement!, {
      code: "KeyS",
      ctrlKey: true,
      altKey: true,
    });

    await waitFor(() => expect(queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(
      container.querySelector(`.${GRID_ROOT_CLASS}`)
    );
  });

  /*
   * The three chords `Workbook`'s onKeyDown never sees. Core's
   * `handleGlobalKeyDown` owns them, so the dialog closes itself off the
   * resulting context flag instead of off the keystroke.
   *
   * Focus is moved off the search box first, deliberately: core ignores these
   * chords while a text entry holds focus, and the search box is the dialog's
   * last focusable, so one Tab wraps to the close button — which is exactly the
   * two-keystroke route a user takes to reach the defect.
   */
  const openAndLeaveTheSearchBox = async (
    getByRole: ReturnType<typeof render>["getByRole"]
  ) => {
    const trigger = getByRole("button", { name: /Keyboard shortcuts/ });
    trigger.focus();
    fireEvent.click(trigger);
    await waitFor(() => getByRole("dialog", { name: "Keyboard Shortcuts" }));
    fireEvent.keyDown(document.activeElement!, { key: "Tab", code: "Tab" });
    return trigger;
  };

  const shortcutsHeading = (container: HTMLElement) =>
    container.querySelector(".fortune-shortcuts-title");

  it.each([
    ["Ctrl+F", "KeyF", "f"],
    ["Ctrl+H", "KeyH", "h"],
  ])(
    "closes itself when %s opens Find and Replace from inside it",
    async (_label, code, key) => {
      const { container, getByRole } = render(
        <Workbook
          data={[{ name: "Sheet1" }]}
          toolbarItems={["keyboard-shortcuts"]}
        />
      );
      await openAndLeaveTheSearchBox(getByRole);

      fireEvent.keyDown(document.activeElement!, { code, key, ctrlKey: true });

      // Find and Replace is z-index 1004 against this dialog's wrapper at 1006,
      // so leaving both open puts focus in a dialog painted behind the modal
      // covering it (WCAG 2.4.3).
      await waitFor(() => expect(shortcutsHeading(container)).toBeNull());
    }
  );

  it("closes itself when Ctrl+Alt+R opens the filter menu from inside it", async () => {
    // The third chord, and the one the review could only read rather than run:
    // it needs a funnel, which needs a filter on the sheet. Declaring one in
    // the sheet data gets there without driving the toolbar.
    const cell = (v: string) => ({
      v: { v, m: v, ct: { fa: "General", t: "g" } },
    });
    const { container, getByRole } = render(
      <Workbook
        lang="en"
        data={[
          {
            name: "Sheet1",
            id: "s1",
            celldata: ["Fruit", "Apple", "Banana"].map((v, r) => ({
              r,
              c: 0,
              ...cell(v),
            })),
            row: 10,
            column: 6,
            filter_select: { row: [0, 2], column: [0, 0] },
            filter: {},
          },
        ]}
        toolbarItems={["keyboard-shortcuts"]}
      />
    );
    expect(
      container.querySelectorAll(".luckysheet-filter-options").length
    ).toBe(1);
    await openAndLeaveTheSearchBox(getByRole);

    fireEvent.keyDown(document.activeElement!, {
      code: "KeyR",
      key: "r",
      ctrlKey: true,
      altKey: true,
    });

    await waitFor(() => expect(shortcutsHeading(container)).toBeNull());
    // And the menu it opened is what holds focus, rather than the dialog's
    // restore dragging it back to the toolbar.
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    expect((document.activeElement as HTMLElement).className).toContain(
      "luckysheet-cols-menuitem"
    );
  });

  it("stays open when a chord core ignores fires in its own search box", async () => {
    // Core bails on Ctrl+F while a text entry holds focus, and the search box
    // is one — nothing opens. Closing here would dismiss the dialog on a
    // keystroke that did nothing, which is why the close keys on the context
    // flag rather than on the chord.
    const { container, getByRole } = render(
      <Workbook
        data={[{ name: "Sheet1" }]}
        toolbarItems={["keyboard-shortcuts"]}
      />
    );
    const trigger = getByRole("button", { name: /Keyboard shortcuts/ });
    trigger.focus();
    fireEvent.click(trigger);
    await waitFor(() => getByRole("dialog", { name: "Keyboard Shortcuts" }));
    expect((document.activeElement as HTMLElement).tagName).toBe("INPUT");

    fireEvent.keyDown(document.activeElement!, {
      code: "KeyF",
      key: "f",
      ctrlKey: true,
    });

    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    expect(shortcutsHeading(container)).not.toBeNull();
  });

  it("still opens when Find and Replace is already up", async () => {
    // The flag is already standing at open time, so only a *transition* may
    // close this dialog. Reacting to the standing flag would make the
    // shortcuts list unopenable whenever Find and Replace happened to be open.
    const { container, getByRole } = render(
      <Workbook
        data={[{ name: "Sheet1" }]}
        toolbarItems={["keyboard-shortcuts"]}
      />
    );
    const workbook =
      container.querySelector<HTMLElement>(".fortune-container")!;
    fireEvent.keyDown(workbook, { code: "KeyF", key: "f", ctrlKey: true });
    await waitFor(() =>
      expect(container.querySelector(".fortune-search-replace")).not.toBeNull()
    );

    const trigger = getByRole("button", { name: /Keyboard shortcuts/ });
    trigger.focus();
    fireEvent.click(trigger);

    await waitFor(() => expect(shortcutsHeading(container)).not.toBeNull());
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    expect(shortcutsHeading(container)).not.toBeNull();
  });

  it("closes on Escape", async () => {
    const { container, getByRole, queryByRole } = render(
      <Workbook data={[{ name: "Sheet1" }]} />
    );

    openWithShortcut(container);
    const dialog = await waitFor(() => getByRole("dialog"));
    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => expect(queryByRole("dialog")).toBeNull());
  });

  it("appends the host application's own shortcut groups", async () => {
    const { container, getByRole } = render(
      <Workbook
        data={[{ name: "Sheet1" }]}
        extraShortcutSections={[
          {
            title: "Simulation",
            items: [
              {
                keys: { mac: "⌘ ⌥ N", windows: "Ctrl + Alt + N" },
                description: "Go to task panel",
              },
            ],
          },
        ]}
      />
    );

    openWithShortcut(container);

    const dialog = await waitFor(() => getByRole("dialog"));
    expect(within(dialog).getByText("Simulation")).toBeTruthy();
    expect(within(dialog).getByText("Go to task panel")).toBeTruthy();
    // The host's group is appended, not a replacement.
    expect(within(dialog).getByText("Copy")).toBeTruthy();
  });

  it("opens via the imperative API", async () => {
    const ref = React.createRef<WorkbookInstance>();
    const { getByRole, queryByRole } = render(
      <Workbook ref={ref} data={[{ name: "Sheet1" }]} />
    );
    expect(queryByRole("dialog")).toBeNull();

    act(() => ref.current!.openShortcutsDialog());

    await waitFor(() => expect(getByRole("dialog")).toBeTruthy());

    act(() => ref.current!.closeShortcutsDialog());
    await waitFor(() => expect(queryByRole("dialog")).toBeNull());
  });

  describe("with several workbooks on the page", () => {
    // A host can mount one workbook per scene and hide the inactive ones. Both
    // of these guard against a dialog opening somewhere the user cannot reach,
    // or two opening at once.
    it("opens only one dialog across instances", async () => {
      const { container, getAllByRole, queryAllByRole } = render(
        <>
          <Workbook data={[{ name: "Sheet1" }]} />
          <Workbook data={[{ name: "Sheet2" }]} />
        </>
      );

      const [first, second] =
        container.querySelectorAll<HTMLElement>(".fortune-container");
      fireEvent.keyDown(first, { key: "/", code: "Slash", ctrlKey: true });
      await waitFor(() => expect(getAllByRole("dialog")).toHaveLength(1));

      fireEvent.keyDown(second, { key: "/", code: "Slash", ctrlKey: true });
      await waitFor(() => expect(queryAllByRole("dialog")).toHaveLength(1));
    });

    it("refuses to open inside a hidden workbook", async () => {
      const ref = React.createRef<WorkbookInstance>();
      const { container, queryByRole } = render(
        <div aria-hidden="true">
          <Workbook ref={ref} data={[{ name: "Sheet1" }]} />
        </div>
      );
      expect(container.querySelector(".fortune-container")).toBeTruthy();

      act(() => ref.current!.openShortcutsDialog());

      await waitFor(() => expect(queryByRole("dialog")).toBeNull());
    });
  });
});
