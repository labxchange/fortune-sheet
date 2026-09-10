import { render, fireEvent, waitFor, screen } from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";

/**
 * Submenu triggers used to decide whether focus follows into what they open
 * from *which handler fired*: a keydown took the user in, a click deliberately
 * did not, so a pointer sweeping the menu was not yanked about.
 *
 * That split excluded screen-reader users. VoiceOver's VO+Space activates a
 * control by dispatching a click and never a keydown, so it took the pointer
 * path every time: the panel opened and focus stayed outside it.
 *
 * The line is now **deliberate activation vs. hover**. Anyone who asks for the
 * panel — click, Enter/Space, or assistive technology — is taken into it; only
 * a pointer drifting across the row is not, and that is the case each "hover"
 * test below pins.
 *
 * Filter-by-Color's equivalent cases live in `filterByColorSubmenu.test.tsx`,
 * beside the rest of that submenu's behaviour.
 */

const data = [
  { name: "Sheet1", id: "s1", celldata: [], row: 10, column: 8 },
  { name: "Sheet2", id: "s2", celldata: [], row: 10, column: 8 },
];

const activeTab = () =>
  document.querySelector<HTMLElement>(
    ".luckysheet-sheets-item-active"
  ) as HTMLElement;

const optionsCaret = () =>
  document.querySelector<HTMLElement>(
    ".luckysheet-sheets-item-active .luckysheet-sheets-item-function"
  ) as HTMLElement;

/**
 * Opens the sheet-options menu the way the keyboard does. Queried through
 * `screen`, not the render result: this menu renders in a portal, so a
 * container-scoped query never sees it.
 */
const openSheetOptions = async () => {
  activeTab().focus();
  fireEvent.contextMenu(activeTab(), { button: 0, detail: 0 });
  await waitFor(() =>
    expect(screen.queryByText("Change color")).not.toBeNull()
  );
};

const changeColorRow = () =>
  screen.queryByText("Change color")!.closest('[role="button"]') as HTMLElement;

const colorPanel = () =>
  document.getElementById(changeColorRow().getAttribute("aria-controls")!);

describe("activating a disclosure takes focus into it", () => {
  describe("sheet tab → Change colour", () => {
    it("moves focus into the colour panel when the row is activated", async () => {
      render(<Workbook data={data as any} />);
      await openSheetOptions();

      // A plain click: the route assistive technology arrives by, and the one
      // that used to be classified as "pointer" and denied focus.
      fireEvent.click(changeColorRow());

      await waitFor(() => {
        expect(colorPanel()).not.toBeNull();
        expect(colorPanel()!.contains(document.activeElement)).toBe(true);
      });
    });

    it("leaves focus alone when hover alone opens it", async () => {
      render(<Workbook data={data as any} />);
      await openSheetOptions();

      const before = document.activeElement;
      // Hover opens the panel too — and must not pull focus off whatever the
      // pointer user was on, which is the case the old click/keydown split was
      // really protecting.
      fireEvent.mouseEnter(changeColorRow().parentElement!);

      await waitFor(() => expect(colorPanel()).not.toBeNull());
      expect(document.activeElement).toBe(before);
    });
  });

  describe("sheet colour confirm returns focus to the control that opened it", () => {
    it("puts focus on Sheet options, not on the grid", async () => {
      render(<Workbook data={data as any} />);
      await openSheetOptions();

      fireEvent.click(changeColorRow());
      await waitFor(() => expect(screen.queryByText("OK")).not.toBeNull());

      fireEvent.click(screen.queryByText("OK")!);

      // focusAfterCommit defers a task and resolves its target against the
      // settled DOM.
      await waitFor(() => expect(document.activeElement).toBe(optionsCaret()));
    });
  });
});
