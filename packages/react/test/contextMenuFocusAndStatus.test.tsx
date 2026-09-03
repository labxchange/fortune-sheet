import { render, act, fireEvent, screen } from "@testing-library/react";
import React from "react";
import Workbook, { WorkbookInstance } from "../src/components/Workbook";
import { CONTEXT_MENU_REGION_ID_SUFFIX } from "../src/hooks/useContextMenuAnnouncements";

// WCAG 2.4.3 and 4.1.3 together, because they are the same edit.
//
// Every row but `filter` closed the menu and left focus on `<body>`, and no row
// reported what it had done — a screen-reader user got the new cell reference
// and no indication that three columns had appeared. Both fire from the same
// handlers at the same moment, so they had to land together; the ordering case
// at the bottom is the guard on that.

const cell = (v: string) => ({ v: { v, m: v, ct: { fa: "General", t: "g" } } });
const celldata = ["Fruit", "Apple", "Banana", "Cherry"].map((v, r) => ({
  r,
  c: 0,
  ...cell(v),
}));

/** focusAfterCommit and the announcement both defer by a task. */
const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
};

const renderSheet = () => {
  const ref = React.createRef<WorkbookInstance>();
  const { container } = render(
    <Workbook
      ref={ref}
      lang="en"
      data={[{ name: "Sheet1", id: "s1", celldata, row: 10, column: 6 }]}
    />
  );
  return { container, ref };
};

const cellInput = (container: HTMLElement) =>
  container.querySelector<HTMLElement>("#luckysheet-rich-text-editor");

const statusRegion = (container: HTMLElement) =>
  container.querySelector<HTMLElement>(
    `[id$="-${CONTEXT_MENU_REGION_ID_SUFFIX}"]`
  );

/**
 * Right-click the grid to open the context menu. pageX/pageY are set because the
 * handler reads them to pick the cell, and jsdom reports every rect as zero —
 * without them the lookup becomes a NaN binary search.
 */
const openContextMenu = (container: HTMLElement) => {
  const rightClick = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(rightClick, "pageX", { value: 5 });
  Object.defineProperty(rightClick, "pageY", { value: 5 });
  act(() => {
    container
      .querySelector<HTMLElement>(".fortune-cell-area")!
      .dispatchEvent(rightClick);
  });
};

/** Activate a menu row by its visible text, from the keyboard. */
const activateRow = (text: string | RegExp) => {
  const row = screen.getByText(text).closest('[role="button"]') as HTMLElement;
  act(() => {
    row.focus();
    fireEvent.keyDown(row, { key: "Enter" });
  });
};

/**
 * The insert-column row, found by structure: "Insert" also matches the image and
 * link rows, which have no input. The accessible name is on the input, so that
 * is the reliable handle.
 */
const insertColumnRow = (container: HTMLElement) => {
  const input = container.querySelector<HTMLInputElement>(
    'input[aria-label^="Number of columns to insert"]'
  )!;
  return {
    row: input.closest(".luckysheet-cols-menuitem") as HTMLElement,
    input,
  };
};

const runAction = async (
  container: HTMLElement,
  ref: React.RefObject<WorkbookInstance>,
  text: string | RegExp,
  selection: { row: number[]; column: number[] } = {
    row: [0, 0],
    column: [0, 0],
  }
) => {
  act(() => {
    ref.current?.setSelection([selection]);
  });
  openContextMenu(container);
  activateRow(text);
  await flush();
};

describe("focus after a context-menu action", () => {
  // Its own case per row rather than folded into the announcement cases: a row
  // could announce correctly and still strand focus.
  it.each([
    ["Copy", "Copy"],
    ["Clear content", "Clear content"],
    ["Ascending sort", "Ascending sort"],
  ])(
    "lands focus on the grid, not the body, after %s",
    async (_label, text) => {
      const { container, ref } = renderSheet();

      await runAction(container, ref, text);

      expect(document.activeElement).not.toBe(document.body);
      expect(document.activeElement).toBe(cellInput(container));
    }
  );

  it("leaves focus alone when the action declines to act", async () => {
    const { container, ref } = renderSheet();
    // Two ranges: copy bails with an alert, so nothing should move — pulling
    // focus to the grid under an open alert is worse than the bug being fixed.
    act(() => {
      ref.current?.setSelection([
        { row: [0, 0], column: [0, 0] },
        { row: [2, 2], column: [0, 0] },
      ]);
    });
    openContextMenu(container);
    activateRow("Copy");
    await flush();

    expect(document.activeElement).not.toBe(cellInput(container));
  });
});

describe("context-menu action status announcements", () => {
  it("renders an assertive live region for action results", () => {
    const { container } = renderSheet();
    const region = statusRegion(container);

    expect(region).not.toBeNull();
    // Assertive is load-bearing, not a preference: these actions move focus to
    // the cell input, and VoiceOver *discards* a polite message queued alongside
    // the focus utterance. Verified in a browser — Copy spoke only "text entry
    // area, blank". Assertive interrupts instead of being dropped.
    expect(region!.getAttribute("role")).toBe("alert");
    expect(region!.getAttribute("aria-live")).toBe("assertive");
    expect(region!.getAttribute("aria-atomic")).toBe("true");
    expect(region!.className).toContain("sr-only");
  });

  it("starts empty", () => {
    const { container } = renderSheet();
    expect(statusRegion(container)!.textContent).toBe("");
  });

  it("announces the result of an action, not the row's label", async () => {
    const { container, ref } = renderSheet();

    await runAction(container, ref, "Clear content");

    const text = statusRegion(container)!.textContent!;
    expect(text).toMatch(/Contents cleared/);
    // The audit's actual complaint: echoing the control's label back is not a
    // status message.
    expect(text).not.toBe("Clear content");
  });

  it("interpolates a count and uses the plural form", async () => {
    const { container, ref } = renderSheet();
    act(() => {
      ref.current?.setSelection([{ row: [0, 0], column: [0, 0] }]);
    });
    openContextMenu(container);

    // The count comes from the row's own input, so this also covers the value
    // reaching the message rather than a hardcoded 1.
    const { row, input } = insertColumnRow(container);
    act(() => {
      fireEvent.change(input, { target: { value: "3" } });
    });
    act(() => {
      row.focus();
      fireEvent.keyDown(row, { key: "Enter" });
    });
    await flush();

    // Direction included: both rows render at once, so a direction-blind
    // "3 columns inserted" is ambiguous. insertColumnRow() returns the left one.
    expect(statusRegion(container)!.textContent).toMatch(
      /3 columns inserted to the left/
    );
  });

  it("uses the singular form for a count of one", async () => {
    const { container, ref } = renderSheet();
    act(() => {
      ref.current?.setSelection([{ row: [0, 0], column: [0, 0] }]);
    });
    openContextMenu(container);

    // Default value is 1, so this is the shipped path — and the one that would
    // otherwise say "1 columns inserted".
    const { row } = insertColumnRow(container);
    act(() => {
      row.focus();
      fireEvent.keyDown(row, { key: "Enter" });
    });
    await flush();

    const text = statusRegion(container)!.textContent!;
    expect(text).toMatch(/1 column inserted to the left/);
    expect(text).not.toMatch(/columns/);
  });

  it("says nothing when the action declines to act", async () => {
    const { container, ref } = renderSheet();
    act(() => {
      ref.current?.setSelection([
        { row: [0, 0], column: [0, 0] },
        { row: [2, 2], column: [0, 0] },
      ]);
    });
    openContextMenu(container);
    activateRow("Copy");
    await flush();

    expect(statusRegion(container)!.textContent).toBe("");
  });

  it("announces again when the same action repeats", async () => {
    const { container, ref } = renderSheet();

    await runAction(container, ref, "Copy");
    const first = statusRegion(container)!.textContent;
    await runAction(container, ref, "Copy");
    const second = statusRegion(container)!.textContent;

    // Same sentence both times, so the text has to differ some other way or a
    // reader treats the second as no change. The hook alternates a ZWSP.
    expect(first).toMatch(/Selection copied/);
    expect(second).toMatch(/Selection copied/);
    expect(second).not.toBe(first);
  });

  it("does not put cell contents in the live region", async () => {
    const { container, ref } = renderSheet();

    await runAction(container, ref, "Copy");

    // Announcements are locale text plus counts. Interpolating cell values would
    // leak the user's data into a region that speaks unprompted.
    const text = statusRegion(container)!.textContent!;
    ["Fruit", "Apple", "Banana", "Cherry"].forEach((value) => {
      expect(text).not.toContain(value);
    });
  });

  // The case above covers Copy's *row-level* multi-selection guard, which the
  // handler checks itself. These cover the bails that live inside the core
  // routines — invisible to the row, and the reason `sortSelection`,
  // `handleCopy` and `handlePasteByClick` now report whether they acted.
  //
  // The multi-range cases below are the row-level guard, not the core one:
  // `sortAndSettle` checks `length > 1` itself and returns before calling
  // `sortSelection` (see the alert case). They are kept because the row guard
  // and the core guard are two different things that can each regress, but the
  // three cases that actually exercise a core boolean are the merged-range
  // sort, the partially-merged copy and the vetoed paste.
  describe("stays silent when the core operation refuses", () => {
    it("does not announce a sort of a multi-range selection", async () => {
      const { container, ref } = renderSheet();
      act(() => {
        ref.current?.setSelection([
          { row: [0, 0], column: [0, 0] },
          { row: [2, 2], column: [0, 0] },
        ]);
      });
      openContextMenu(container);
      activateRow("Ascending sort");
      await flush();

      expect(statusRegion(container)!.textContent).toBe("");
    });

    it("does not announce a sort of a range containing a merged cell", async () => {
      const { container, ref } = renderSheet();
      // The row-level guard cannot see this one: a single range, so it hands
      // straight to `sortSelection`, which walks the range for `mc` and returns
      // false with no throw and no alert. This is the case that exercises
      // `sortSelection`'s boolean through the context menu — the multi-range
      // case above never reaches the call.
      act(() => {
        ref.current?.mergeCells([{ row: [1, 2], column: [1, 1] }], "merge-all");
      });
      act(() => {
        ref.current?.setSelection([{ row: [0, 3], column: [0, 1] }]);
      });
      openContextMenu(container);
      activateRow("Ascending sort");
      await flush();

      expect(statusRegion(container)!.textContent).toBe("");
      expect(document.activeElement).not.toBe(cellInput(container));
    });

    it("does not announce a copy that cuts a partially-merged cell", async () => {
      const { container, ref } = renderSheet();
      // `copy.ts`'s docblock calls this "the one that bites in a real sheet",
      // and it is the only refusal `handleCopy` reports that the row cannot
      // check for itself: one range, so the row-level guard passes, and the
      // alert that used to report it is commented out in core. Selecting A1:A2
      // over a merge spanning A2:B3 leaves half a merged cell inside the range.
      act(() => {
        ref.current?.mergeCells([{ row: [1, 2], column: [0, 1] }], "merge-all");
      });
      act(() => {
        ref.current?.setSelection([{ row: [0, 1], column: [0, 0] }]);
      });
      openContextMenu(container);
      activateRow("Copy");
      await flush();

      expect(statusRegion(container)!.textContent).toBe("");
      expect(document.activeElement).not.toBe(cellInput(container));
    });

    it("does not move focus to the grid for a refused sort", async () => {
      const { container, ref } = renderSheet();
      act(() => {
        ref.current?.setSelection([
          { row: [0, 0], column: [0, 0] },
          { row: [2, 2], column: [0, 0] },
        ]);
      });
      openContextMenu(container);
      activateRow("Ascending sort");
      await flush();

      // `commitAndSettle` gates the focus move on the announcement, so the two
      // agree by construction — the point of asserting it separately is that a
      // regression in either one shows up here.
      expect(document.activeElement).not.toBe(cellInput(container));
    });

    it("tells sighted users why the sort was refused", async () => {
      const { container, ref } = renderSheet();
      act(() => {
        ref.current?.setSelection([
          { row: [0, 0], column: [0, 0] },
          { row: [2, 2], column: [0, 0] },
        ]);
      });
      openContextMenu(container);
      activateRow("Ascending sort");
      await flush();

      // Previously the worst of both: silent for sighted users, and actively
      // wrong for screen-reader users. Copy's row already alerted here.
      expect(screen.queryByText(/multiple selection areas/)).not.toBeNull();
    });

    // Every comparison against NaN is false, so a `count < 1` — or a
    // `<= 0 || > 545` — guard let a non-numeric value straight through: the
    // region said "NaN columns inserted to the left." and `commitAndSettle`
    // settled focus on the grid for a sheet that had not changed.
    //
    // All four numeric rows, not just the two the ticket was about. The insert
    // inputs are `type="text"`, so letters reach `parseInt` in any browser;
    // row-height and column-width are `type="number"`, so a browser sanitises
    // most of these to "" first — which makes them harder to reach, not
    // guarded, and jsdom does not sanitise at all.
    it.each([
      ["Insert 1 column left", "columns"],
      ["Insert 1 row above", "rows"],
    ])("stays silent when %s is given a non-number", async (_label, kind) => {
      const { container, ref } = renderSheet();
      act(() => {
        ref.current?.setSelection([{ row: [0, 0], column: [0, 0] }]);
      });
      openContextMenu(container);

      const input = container.querySelector<HTMLInputElement>(
        `input[aria-label^="Number of ${kind} to insert"]`
      )!;
      const row = input.closest(".luckysheet-cols-menuitem") as HTMLElement;
      act(() => {
        fireEvent.change(input, { target: { value: "abc" } });
        row.focus();
        fireEvent.keyDown(row, { key: "Enter" });
      });
      await flush();

      expect(statusRegion(container)!.textContent).toBe("");
      expect(document.activeElement).not.toBe(cellInput(container));
    });

    it.each([
      [
        "Row height",
        { row: [0, 0], column: [0, 5], row_select: true },
        /Row height must be between/,
      ],
      [
        "Column width",
        { row: [0, 9], column: [0, 0], column_select: true },
        /column width must be between/,
      ],
    ])(
      "stays silent when %s is given a non-number",
      async (label, selection, alert) => {
        const { container, ref } = renderSheet();
        act(() => {
          ref.current?.setSelection([selection as any]);
        });
        openContextMenu(container);

        const input = container.querySelector<HTMLInputElement>(
          `input[aria-label^="${label}"]`
        )!;
        const row = input.closest(".luckysheet-cols-menuitem") as HTMLElement;
        act(() => {
          fireEvent.change(input, { target: { value: "abc" } });
          row.focus();
          fireEvent.keyDown(row, { key: "Enter" });
        });
        await flush();

        // `setRowHeight`/`setColumnWidth` drop a NaN length without a word, so
        // the old guard's reward for letting it through was "Row height set to
        // NaN pixels." over an unchanged sheet. The alert is what should
        // happen, and it is also why focus must stay put.
        expect(statusRegion(container)!.textContent).toBe("");
        expect(document.activeElement).not.toBe(cellInput(container));
        expect(screen.queryByText(alert as RegExp)).not.toBeNull();
      }
    );

    it("still accepts a column width above the row-height limit", async () => {
      const { container, ref } = renderSheet();
      act(() => {
        ref.current?.setSelection([
          { row: [0, 9], column: [0, 0], column_select: true } as any,
        ]);
      });
      openContextMenu(container);

      // 546 is over the row-height limit and well under the column-width one,
      // so it separates the two: the input's `max` claimed 545 while the
      // handler validated 2038, and `max` is what a reader announces as the
      // control's maximum.
      const input = container.querySelector<HTMLInputElement>(
        'input[aria-label^="Column width"]'
      )!;
      expect(input.getAttribute("max")).toBe("2038");
      const row = input.closest(".luckysheet-cols-menuitem") as HTMLElement;
      act(() => {
        fireEvent.change(input, { target: { value: "546" } });
        row.focus();
        fireEvent.keyDown(row, { key: "Enter" });
      });
      await flush();

      expect(statusRegion(container)!.textContent).toMatch(
        /Column width set to 546 pixels/
      );
    });

    it("does not announce a paste a host app vetoed", async () => {
      const beforePaste = jest.fn(() => false);
      const ref = React.createRef<WorkbookInstance>();
      const { container } = render(
        <Workbook
          ref={ref}
          lang="en"
          hooks={{ beforePaste } as any}
          data={[{ name: "Sheet1", id: "s1", celldata, row: 10, column: 6 }]}
        />
      );
      // The clipboard read the row does before committing; jsdom has no
      // clipboard, and the row already falls back to sessionStorage.
      sessionStorage.setItem("localClipboard", "pasted");
      document.body.insertAdjacentHTML(
        "beforeend",
        '<div id="fortune-copy-content">pasted</div>'
      );

      await runAction(container, ref, "Paste");

      // `beforePaste` is a host-app integration point, so this is the bail most
      // likely to be hit in production by an embedding app that blocks a paste.
      expect(beforePaste).toHaveBeenCalled();
      expect(statusRegion(container)!.textContent).toBe("");

      sessionStorage.removeItem("localClipboard");
      document.getElementById("fortune-copy-content")?.remove();
    });
  });

  // The filter row does not use `commitAndSettle`: `createFilter` is a toggle,
  // so the gate is a before/after comparison rather than a boolean return, and
  // focus is settled by `filterUnchanged` on the same signal. Both directions,
  // because a gate that is stuck open and one that is stuck shut are different
  // bugs and only one of them is visible as silence.
  describe("the filter row's create/remove gate", () => {
    it("announces which way the toggle went", async () => {
      const { container, ref } = renderSheet();

      await runAction(container, ref, "Create filter");
      expect(statusRegion(container)!.textContent).toMatch(/Filter created/);

      // The row's label follows the same value the gate reads, so the second
      // pass has to be found under the other name.
      await runAction(container, ref, "Remove filter");
      expect(statusRegion(container)!.textContent).toMatch(/Filter removed/);
    });

    it("says nothing when createFilter declines to act", async () => {
      const { container, ref } = renderSheet();
      // `createFilter` returns on a multi-range selection, and the row has no
      // guard of its own — so without the `had !== has` comparison this
      // announced "Filter created." and moved focus for a sheet with no filter.
      act(() => {
        ref.current?.setSelection([
          { row: [0, 0], column: [0, 0] },
          { row: [2, 2], column: [0, 0] },
        ]);
      });
      openContextMenu(container);
      activateRow("Create filter");
      await flush();

      expect(statusRegion(container)!.textContent).toBe("");
      expect(document.activeElement).not.toBe(cellInput(container));
    });
  });

  it("has the text in place before focus moves, for the description to carry", async () => {
    // This assertion is the inverse of what it used to be, and the inversion is
    // the fix. Deferring the text past the focus move meant the cell input's
    // `aria-describedby` target was still empty when VoiceOver composed the focus
    // utterance, so the result was never part of it — and a live-region message
    // queued alongside a focus change is discarded rather than spoken after it.
    const { container, ref } = renderSheet();

    await runAction(container, ref, "Clear content");

    expect(statusRegion(container)!.textContent).toMatch(/Contents cleared/);
    // And the cell input points at it, so the focus announcement includes it.
    // Resolved the way an assistive technology resolves an IDREF — through
    // `getElementById` over the whole document — so a description that names an
    // id belonging to *another* workbook on the page fails here rather than
    // passing on the string alone.
    const describedBy = cellInput(container)?.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toBe(statusRegion(container));
  });
});
