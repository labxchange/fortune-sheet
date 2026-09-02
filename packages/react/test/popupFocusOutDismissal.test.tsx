import {
  render,
  fireEvent,
  waitFor,
  act,
  screen,
} from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";

// WCAG 2.4.11 (Focus Not Obscured). Every popup here is an absolutely
// positioned overlay, so one left open while focus moves behind it covers the
// element the user just reached. The audit filed this against the cell context
// menu and the filter popup citing 1.4.13, which scopes to content revealed
// *by* hover or focus and does not apply; 2.4.11 does, and APG specifies the
// same fix ("Tab: closes the menu and moves focus to the next element").
//
// The unit-level rules live in useEscapeToClose.test.tsx. This file is the
// wiring: that each real popup opted in, and that the two submenu topologies
// this codebase actually has are both handled.

const text = (v: string) => ({ v, m: v, ct: { fa: "General", t: "s" } });

const dataWithColors = [
  {
    name: "Sheet1",
    id: "s1",
    celldata: [
      { r: 0, c: 0, v: text("Name") },
      { r: 1, c: 0, v: { ...text("a"), bg: "#ff0000" } },
      { r: 2, c: 0, v: { ...text("b"), bg: "#00ff00" } },
      { r: 3, c: 0, v: { ...text("c"), bg: "#0000ff" } },
    ],
    filter_select: { row: [0, 3], column: [0, 0] },
  },
];

const plainSheet = [
  {
    name: "Sheet1",
    id: "s1",
    celldata: [{ r: 0, c: 0, v: text("Fruit") }],
    row: 10,
    column: 6,
  },
];

/** Move focus the way Tab does: one focusout naming where it went. */
const moveFocus = (from: HTMLElement, to: HTMLElement) => {
  act(() => {
    to.focus();
    fireEvent.focusOut(from, { relatedTarget: to });
  });
};

/**
 * Focus decisions here are deferred by a task (`focusAfterCommit`), and a
 * synchronous `act()` does not flush macrotasks — there are no fake timers in
 * `tests/setup.js`. Any assertion about where focus *ended up* has to wait for
 * them, or it reads pre-timeout state and cannot fail: a popup that pulls focus
 * back a task after dismissing would still look correct.
 */
const flushFocus = async () => {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
};

const cellMenu = () =>
  document.querySelector<HTMLElement>(
    ".fortune-context-menu.luckysheet-cols-menu"
  );
const filterMenu = () => document.getElementById("fortune-filter-menu");
const colorSubmenu = () =>
  document.getElementById("fortune-filter-bycolor-submenu");

const openCellMenu = (container: HTMLElement) => {
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

const openFilterMenu = async () => {
  const { container } = render(<Workbook lang="en" data={dataWithColors} />);
  await waitFor(() =>
    expect(
      document.querySelectorAll(".luckysheet-filter-options").length
    ).toBeGreaterThan(0)
  );
  const funnel = document.querySelector<HTMLElement>(
    ".luckysheet-filter-options"
  )!;
  act(() => {
    funnel.focus();
    fireEvent.keyDown(funnel, { key: "Enter" });
  });
  await waitFor(() => screen.getByText("Filter by color"));
  return { container, funnel };
};

const byColorTrigger = () =>
  screen.getByText("Filter by color").closest('[role="button"]') as HTMLElement;

const openColorSubmenu = async () => {
  act(() => {
    byColorTrigger().focus();
    fireEvent.keyDown(byColorTrigger(), { key: "Enter" });
  });
  await waitFor(() => expect(colorSubmenu()).not.toBeNull());
  return Array.from(
    colorSubmenu()!.querySelectorAll<HTMLElement>('[role="checkbox"]')
  );
};

describe("popup dismissal on focus out", () => {
  describe("cell context menu (ticket 1218037811228849)", () => {
    it("closes when focus moves out of it", async () => {
      const { container } = render(<Workbook lang="en" data={plainSheet} />);
      openCellMenu(container);
      expect(cellMenu()).not.toBeNull();

      const row = cellMenu()!.querySelector<HTMLElement>('[role="button"]')!;
      const outside = container.querySelector<HTMLElement>(
        ".fortune-toolbar [role='button']"
      )!;
      moveFocus(row, outside);

      expect(cellMenu()).toBeNull();
      // Focus stays where the user sent it; the menu's own restore stands down
      // once focus has deliberately left. Flushed, so a deferred restore that
      // reached back for it would fail here rather than go unnoticed.
      await flushFocus();
      expect(document.activeElement).toBe(outside);
    });

    it("stays open while focus moves between its own rows", () => {
      const { container } = render(<Workbook lang="en" data={plainSheet} />);
      openCellMenu(container);
      const rows = Array.from(
        cellMenu()!.querySelectorAll<HTMLElement>('[role="button"]')
      );

      moveFocus(rows[0], rows[1]);

      expect(cellMenu()).not.toBeNull();
    });

    // The pointer half of the same ticket, which the audit did not report: this
    // was the only popup of the eight with no useOutsideClick at all. It closed
    // purely because core's grid mousedown zeroes ctx.contextMenu, so a press
    // anywhere off the grid left it open.
    it.each([
      [".fortune-toolbar"],
      [".fortune-name-box-container"],
      ["#luckysheet-sheet-area"],
    ])("closes on a pointer press on %s", (selector) => {
      const { container } = render(<Workbook lang="en" data={plainSheet} />);
      openCellMenu(container);
      expect(cellMenu()).not.toBeNull();

      const target = container.querySelector<HTMLElement>(selector)!;
      expect(target).not.toBeNull();
      act(() => {
        fireEvent.mouseDown(target, { bubbles: true });
      });

      expect(cellMenu()).toBeNull();
    });
  });

  describe("filter popup (ticket 1218037811228854)", () => {
    it("closes when focus moves out of it", async () => {
      const { container } = await openFilterMenu();
      const row = filterMenu()!.querySelector<HTMLElement>('[role="button"]')!;
      const outside = container.querySelector<HTMLElement>(
        ".fortune-toolbar [role='button']"
      )!;

      moveFocus(row, outside);

      expect(filterMenu()).toBeNull();
      // This popup routes every dismissal through `close`, which restores focus
      // to the cell — so without the flush the assertion passes on pre-timeout
      // state and the "Tab is swallowed" regression is invisible.
      await flushFocus();
      expect(document.activeElement).toBe(outside);
    });

    it("stays open when focus moves to its own funnel trigger", async () => {
      const { funnel } = await openFilterMenu();
      const row = filterMenu()!.querySelector<HTMLElement>('[role="button"]')!;

      // A popup and the control that discloses it are one widget. Getting this
      // wrong makes the trigger unable to close its own menu from the keyboard:
      // arriving on it dismisses the menu, and the press then reopens it.
      moveFocus(row, funnel);

      expect(filterMenu()).not.toBeNull();
    });

    // The submenu renders as a *sibling* of the menu container, not a child, so
    // contains() alone calls it "outside".
    it("stays open when focus enters the colour submenu", async () => {
      await openFilterMenu();
      const rows = await openColorSubmenu();

      expect(filterMenu()).not.toBeNull();
      expect(colorSubmenu()!.contains(document.activeElement)).toBe(true);
      // Confirms the topology this guards against is still the real one.
      expect(filterMenu()!.contains(colorSubmenu())).toBe(false);
      expect(rows.length).toBeGreaterThan(0);
    });

    it("stays open when focus returns from the submenu to the menu", async () => {
      await openFilterMenu();
      const rows = await openColorSubmenu();

      moveFocus(rows[0], byColorTrigger());

      expect(filterMenu()).not.toBeNull();
    });

    it("closes when focus leaves both the menu and its submenu", async () => {
      const { container } = await openFilterMenu();
      const rows = await openColorSubmenu();
      const outside = container.querySelector<HTMLElement>(
        ".fortune-toolbar [role='button']"
      )!;

      moveFocus(rows[0], outside);

      expect(filterMenu()).toBeNull();
      expect(colorSubmenu()).toBeNull();
    });

    // Task 1.1's finding, and a pre-existing bug rather than a regression: the
    // sibling submenu meant useOutsideClick saw a press on a colour row as an
    // outside click and unmounted the whole popup, so filtering by colour was
    // unusable with a mouse.
    it("survives a pointer press on a colour row, and toggles it", async () => {
      await openFilterMenu();
      const rows = await openColorSubmenu();

      act(() => {
        fireEvent.mouseDown(rows[0], { bubbles: true });
      });

      expect(filterMenu()).not.toBeNull();
      expect(colorSubmenu()).not.toBeNull();

      act(() => {
        fireEvent.click(rows[0]);
      });
      expect(rows[0].getAttribute("aria-checked")).toBe("false");
    });
  });

  describe("transient focus loss", () => {
    it("keeps the cell menu open when focus is lost with no destination", () => {
      const { container } = render(<Workbook lang="en" data={plainSheet} />);
      openCellMenu(container);
      const row = cellMenu()!.querySelector<HTMLElement>('[role="button"]')!;

      // A re-render that unmounts the focused row, an OS colour picker, or the
      // window losing focus all report this. None of them means the user left.
      act(() => {
        fireEvent.focusOut(row, { relatedTarget: null });
      });

      expect(cellMenu()).not.toBeNull();
    });

    it("keeps the filter popup open when focus is lost with no destination", async () => {
      await openFilterMenu();
      const row = filterMenu()!.querySelector<HTMLElement>('[role="button"]')!;

      act(() => {
        fireEvent.focusOut(row, { relatedTarget: null });
      });

      expect(filterMenu()).not.toBeNull();
    });
  });

  describe("the six popups the audit did not name", () => {
    it("closes the sheet-tab options menu on focus out", () => {
      const { container } = render(<Workbook lang="en" data={plainSheet} />);
      const caret = container.querySelector<HTMLElement>(
        ".luckysheet-sheets-item-function"
      )!;
      act(() => {
        caret.focus();
        fireEvent.keyDown(caret, { key: "Enter" });
      });
      const menu = () =>
        document.getElementById("fortune-sheet-tab-options-menu");
      expect(menu()).not.toBeNull();

      const row = menu()!.querySelector<HTMLElement>('[role="button"]')!;
      const outside = container.querySelector<HTMLElement>(
        ".fortune-toolbar [role='button']"
      )!;
      moveFocus(row, outside);

      expect(menu()).toBeNull();
    });

    it("keeps the sheet-tab menu open when focus moves to its own caret", () => {
      const { container } = render(<Workbook lang="en" data={plainSheet} />);
      const caret = container.querySelector<HTMLElement>(
        ".luckysheet-sheets-item-function"
      )!;
      act(() => {
        caret.focus();
        fireEvent.keyDown(caret, { key: "Enter" });
      });
      const menu = () =>
        document.getElementById("fortune-sheet-tab-options-menu");
      const row = menu()!.querySelector<HTMLElement>('[role="button"]')!;

      moveFocus(row, caret);

      // Otherwise pressing the caret again could never close the menu: the
      // focus move would close it and the press would reopen it.
      expect(menu()).not.toBeNull();
    });

    it("closes the toolbar combo popup on focus out", () => {
      const { container } = render(<Workbook lang="en" data={plainSheet} />);
      const [formatCombo] = screen.getAllByRole("button", { name: /^Format:/ });
      act(() => {
        formatCombo.focus();
        fireEvent.keyDown(formatCombo, { key: "Enter" });
      });
      const popup = () =>
        document.querySelector<HTMLElement>(".fortune-toolbar-combo-popup");
      expect(popup()).not.toBeNull();

      const row = popup()!.querySelector<HTMLElement>('[role="button"]')!;
      const outside =
        container.querySelector<HTMLElement>(".fortune-cell-area")!;
      outside.setAttribute("tabindex", "-1");
      moveFocus(row, outside);

      expect(popup()).toBeNull();
    });

    it("closes the all-sheets list on focus out", () => {
      const { container } = render(<Workbook lang="en" data={plainSheet} />);
      // By role, not by `#all-sheets`: SVGDefines declares a <symbol> with that
      // same id, and it comes first in document order. (A real duplicate-id
      // defect, pre-existing and out of scope here — recorded as a follow-up.)
      const trigger = screen.getByRole("button", { name: "All sheets" });
      act(() => {
        fireEvent.mouseDown(trigger);
      });
      const list = () =>
        document.querySelector<HTMLElement>(".fortune-sheet-list");
      expect(list()).not.toBeNull();

      const row = list()!.querySelector<HTMLElement>(
        '[role="button"], [tabindex="0"]'
      )!;
      const outside = container.querySelector<HTMLElement>(
        ".fortune-toolbar [role='button']"
      )!;
      moveFocus(row, outside);

      expect(list()).toBeNull();
    });

    it("closes the zoom ratio menu on focus out", () => {
      const { container } = render(<Workbook lang="en" data={plainSheet} />);
      const trigger = container.querySelector<HTMLElement>(
        ".fortune-zoom-ratio-current"
      )!;
      act(() => {
        fireEvent.mouseDown(trigger);
      });
      const menu = () =>
        document.querySelector<HTMLElement>(".fortune-zoom-ratio-menu");
      expect(menu()).not.toBeNull();

      const row = menu()!.querySelector<HTMLElement>('[role="button"]')!;
      const outside = container.querySelector<HTMLElement>(
        ".fortune-toolbar [role='button']"
      )!;
      moveFocus(row, outside);

      expect(menu()).toBeNull();
    });

    /*
     * Two of the eight opt-ins are not covered here, deliberately rather than by
     * oversight:
     *
     *  * the toolbar's More-items overflow only mounts once the toolbar is wider
     *    than the sheet, and that decision reads `sheetWidth` and per-item
     *    offsets — jsdom reports every one of them as 0, so the container never
     *    renders and there is nothing to open.
     *  * the data-validation dropdown needs a validated cell plus a press on its
     *    arrow, whose hit test is also layout-derived.
     *
     * Both are wired identically to the four above (one `closeOnFocusOut: true`,
     * no `withinRefs`), and the rules themselves are unit-tested in
     * useEscapeToClose.test.tsx. The gap is that nothing proves *those two* call
     * sites are wired at all, which is what the manual pass in the PR
     * description covers.
     */
  });
});
