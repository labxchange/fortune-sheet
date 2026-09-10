import { render, fireEvent, waitFor, screen } from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";

/**
 * The "Sheet options" caret inside each sheet tab, and the routes that open its
 * menu: the caret's own Tab stop, the platform's context-menu gesture, and the
 * mouse.
 *
 * The caret keeps its place in the Tab sequence deliberately. Taking it away
 * was tried and reverted — it is the only route that reaches the menu on every
 * platform, since Chrome on macOS binds neither Shift+F10 nor the ContextMenu
 * key, so removing it removes the capability rather than tidying it.
 */

const data = [
  { name: "Sheet1", id: "s1", celldata: [], row: 10, column: 8 },
  { name: "Sheet2", id: "s2", celldata: [], row: 10, column: 8 },
];

const tabFor = (name: string) =>
  document.evaluate(
    `//div[@role="tab"][@aria-label="${name}"]`,
    document,
    null,
    9,
    null
  ).singleNodeValue as HTMLElement;

const caretIn = (tab: HTMLElement) =>
  tab.querySelector<HTMLElement>(".luckysheet-sheets-item-function")!;

describe("sheet tab options menu", () => {
  it("keeps the caret a named button in the Tab order of the selected tab", () => {
    render(<Workbook data={data as any} />);
    const caret = caretIn(tabFor("Sheet1"));

    // Reachable by Tab, and self-announcing once reached — which is why no
    // shortcut or spoken hint is needed to find it.
    expect(caret.getAttribute("tabindex")).toBe("0");
    expect(caret.getAttribute("role")).toBe("button");
    expect(caret.getAttribute("aria-label")).toBe("Sheet options");
    expect(caret.getAttribute("aria-haspopup")).toBe("menu");

    // Only the selected tab's caret, following the tab's own roving tabindex —
    // otherwise the strip costs one extra Tab stop per sheet.
    expect(caretIn(tabFor("Sheet2")).getAttribute("tabindex")).toBe("-1");
  });

  it("moves the tabs' roving tabindex with the selected sheet", () => {
    render(<Workbook data={data as any} />);

    expect(tabFor("Sheet1").getAttribute("tabindex")).toBe("0");
    expect(tabFor("Sheet2").getAttribute("tabindex")).toBe("-1");

    fireEvent.keyDown(tabFor("Sheet1"), { key: "ArrowRight" });
    fireEvent.keyDown(tabFor("Sheet2"), { key: "Enter" });

    expect(tabFor("Sheet1").getAttribute("tabindex")).toBe("-1");
    expect(tabFor("Sheet2").getAttribute("tabindex")).toBe("0");
  });

  it("opens the menu from the caret with Space", async () => {
    render(<Workbook data={data as any} />);
    const caret = caretIn(tabFor("Sheet1"));

    expect(screen.queryByText("Change color")).toBeNull();

    caret.focus();
    fireEvent.keyDown(caret, { key: " ", code: "Space" });

    await waitFor(() =>
      expect(screen.queryByText("Change color")).not.toBeNull()
    );
  });

  /**
   * The platform's own gesture, kept because it works whether or not the caret
   * is tabbable: Shift+F10 and the ContextMenu key raise `contextmenu` on the
   * focused element with no pointer behind it, so the tab hands that case to
   * the same toggle the caret uses — which anchors the menu to the trigger's
   * rect rather than to meaningless pointer coordinates.
   */
  it("opens the menu from the tab with the context-menu gesture", async () => {
    render(<Workbook data={data as any} />);
    const tab = tabFor("Sheet1");
    tab.focus();

    expect(screen.queryByText("Change color")).toBeNull();

    fireEvent.contextMenu(tab, { button: 0, detail: 0 });

    await waitFor(() =>
      expect(screen.queryByText("Change color")).not.toBeNull()
    );
  });

  it("still opens the menu on a real right-click", async () => {
    render(<Workbook data={data as any} />);

    fireEvent.contextMenu(tabFor("Sheet1"), { button: 2, detail: 1 });

    await waitFor(() =>
      expect(screen.queryByText("Change color")).not.toBeNull()
    );
  });
});
