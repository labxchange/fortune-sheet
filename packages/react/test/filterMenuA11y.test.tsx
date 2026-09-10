import {
  render,
  fireEvent,
  waitFor,
  act,
  screen,
} from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";

/**
 * Filter-popup findings from the spreadsheet accessibility audit that are about
 * the popup's own structure rather than any one control's behaviour.
 */

const text = (v: string) => ({ v, m: v, ct: { fa: "General", t: "s" } });

const data = [
  {
    name: "Sheet1",
    celldata: [
      { r: 0, c: 0, v: text("Name") },
      { r: 1, c: 0, v: text("a") },
      { r: 2, c: 0, v: text("b") },
    ],
    filter_select: { row: [0, 2], column: [0, 0] },
  },
];

const funnels = () =>
  Array.from(
    document.querySelectorAll<HTMLElement>(".luckysheet-filter-options")
  );

/** Opens the filter dropdown for column A from the keyboard. */
const openFilterMenu = async () => {
  render(<Workbook lang="en" data={data} />);
  await waitFor(() => expect(funnels().length).toBeGreaterThan(0));
  const [first] = funnels();
  act(() => {
    first.focus();
    fireEvent.keyDown(first, { key: "Enter" });
  });
  await waitFor(() => screen.getByText("Check all"));
};

describe("filter popup accessibility", () => {
  /**
   * Both filter controls over the grid — the column-options caret and the
   * funnel — keep their place in the page Tab sequence, and that is a decision
   * rather than an oversight.
   *
   * An earlier cut of this branch took the Tab stop off each of them to answer
   * the audit's "filter popup buttons are unnecessary Tab stops" finding. Both
   * were reverted, for the same reason: the Tab stop is the only route a
   * keyboard user has to either control, so removing it removes the capability
   * rather than tidying it. Sprint ledger entries `D-M38` (the funnel) and
   * `D-M51` (the caret).
   *
   * What this suite pins is the part that was never in doubt: each is a named
   * button, it accepts focus, and Enter opens the menu.
   */
  describe("the filter funnels", () => {
    it("are a named button that takes focus and opens on Enter", async () => {
      render(<Workbook lang="en" data={data} />);
      await waitFor(() => expect(funnels().length).toBeGreaterThan(0));
      const [funnel] = funnels();

      expect(funnel.getAttribute("role")).toBe("button");
      expect(funnel.getAttribute("aria-label")).toBeTruthy();

      act(() => {
        funnel.focus();
      });
      // Programmatic focus, which the popup's focus-return relies on, and it
      // is separate from Tab reaching the same node.
      expect(document.activeElement).toBe(funnel);

      act(() => {
        fireEvent.keyDown(funnel, { key: "Enter" });
      });
      await waitFor(() => screen.getByText("Check all"));
    });
  });

  /**
   * The bulk-action row draws "Check all - Clear - Inverse", and those hyphens
   * were bare text nodes: a screen-reader cursor stopped on each one and
   * announced "-" between the buttons. They are punctuation, not content.
   */
  describe("the bulk-action separators", () => {
    it("keeps the hyphens out of the accessibility tree", async () => {
      await openFilterMenu();

      const row = screen.getByText("Check all").closest("div") as HTMLElement;

      // Asserted on the row's own children rather than by selecting the spans,
      // so a separator reintroduced as a bare text node fails this too.
      const exposedText = Array.from(row.childNodes)
        .filter(
          (node) =>
            node.nodeType === Node.TEXT_NODE ||
            (node instanceof HTMLElement &&
              node.getAttribute("aria-hidden") !== "true")
        )
        .map((node) => node.textContent?.trim())
        .filter((t) => t === "-");

      expect(exposedText).toEqual([]);
    });

    it("still shows the hyphens, and still names all three buttons", async () => {
      await openFilterMenu();

      const row = screen.getByText("Check all").closest("div") as HTMLElement;

      // Hidden from assistive technology, not removed from the page: the row
      // should still read "Check all - Clear - Inverse" visually.
      expect(row.textContent).toContain("-");
      ["Check all", "Clear", "Inverse"].forEach((name) => {
        expect(screen.getByText(name).tagName).toBe("BUTTON");
      });
    });
  });
});
