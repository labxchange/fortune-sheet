import { render, act, fireEvent } from "@testing-library/react";
import React from "react";
import Workbook, { WorkbookInstance } from "../src/components/Workbook";

/**
 * "Back to the top", the second button in the bottom add-row strip.
 *
 * It used to set `ctx.scrollTop = 0` and nothing else: the viewport returned to
 * row 1 while the active cell stayed wherever it was — reported from row 989 of
 * `exploratory-data-analysis` — so keyboard and screen-reader navigation
 * carried on from a cell nobody could see (WCAG 2.4.3). Focus was the other
 * half: it stays on this button, and the button itself is in the strip below
 * the last row, which the scroll it just performed takes off-screen.
 *
 * Deliberately NOT asserted here: that the arrow keys then move from A1. That
 * is `handleGlobalKeyDown`'s grid guard, which reads `closest()` against real
 * layout; the focus target it keys off is what these assert instead.
 */
describe("Back to the top", () => {
  // Tall enough to scroll: the reported sheet is ~1000 rows, and the strip is
  // rendered whatever the row count.
  const sheet = { name: "Sheet1", id: "s1", row: 1000, column: 20 };

  let ref: React.RefObject<WorkbookInstance>;
  let container: HTMLElement;
  let getByRole: ReturnType<typeof render>["getByRole"];

  const selection = () => ref.current?.getSelection()?.[0];
  const scrollbarY = () =>
    container.querySelector<HTMLElement>(".luckysheet-scrollbar-y")!;
  const scrollbarX = () =>
    container.querySelector<HTMLElement>(".luckysheet-scrollbar-x")!;

  const clickBackToTop = () => {
    fireEvent.click(getByRole("button", { name: "Back to the top" }));
  };

  beforeEach(() => {
    ref = React.createRef<WorkbookInstance>();
    const view = render(<Workbook ref={ref} lang="en" data={[sheet as any]} />);
    container = view.container;
    getByRole = view.getByRole;
    // G989 — the cell in the bug report, far down and off to the right.
    act(() => {
      ref.current?.setSelection([{ row: [988, 988], column: [6, 6] }]);
    });
  });

  it("moves the active cell to A1, not just the viewport", () => {
    clickBackToTop();

    expect(selection()).toMatchObject({ row: [0, 0], column: [0, 0] });
  });

  it("names A1 in the name box and the cell alert", () => {
    clickBackToTop();

    // The two places the new position is actually surfaced: the reference box
    // a sighted user reads, and the alert region a screen reader hears. Both
    // derive from the selection, so this is what makes the move perceivable
    // rather than merely recorded.
    expect(
      container.querySelector<HTMLInputElement>(".fortune-name-box")!.value
    ).toBe("A1");
    // `formatRefForSr` splits the letter from the number — "A. 1", not "A1" —
    // so a screen reader says "A, one" rather than reading the pair as a word.
    expect(
      container.querySelector("#sr-selection")?.textContent ?? ""
    ).toContain("A. 1");
  });

  it("returns the viewport to the origin, both axes", () => {
    // Scroll away first, or both axes read 0 before the click and the case
    // passes on a workbook that does nothing. The scrollbars are the grid's
    // scroll input: their `onScroll` is what writes the offset into context,
    // and the effect writes context back onto them, so they are both the lever
    // and the readout.
    const [y, x] = [scrollbarY(), scrollbarX()];
    y.scrollTop = 19760;
    fireEvent.scroll(y);
    x.scrollLeft = 438;
    fireEvent.scroll(x);
    expect(scrollbarY().scrollTop).toBe(19760);

    clickBackToTop();

    // Vertical is the button's original job. Horizontal is new, and is what
    // keeps the promise the first case makes: A1 sits at the left edge, so
    // leaving `scrollLeft` at column G would land the active cell off-screen on
    // the other axis — the same defect, turned sideways.
    expect(scrollbarY().scrollTop).toBe(0);
    expect(scrollbarX().scrollLeft).toBe(0);
  });

  it.each(["Enter", " "])("moves the cell when activated with %p", (key) => {
    // The keyboard path is the whole point of the ticket, and it reaches
    // `handleBackToTop` only because `activateOnEnterOrSpace` forwards to
    // `e.currentTarget.click()`. Without this case, swapping that handler for
    // `onActivate(...)` — or dropping it — leaves every other case here green
    // while Enter and Space silently stop moving the cell.
    fireEvent.keyDown(getByRole("button", { name: "Back to the top" }), {
      key,
    });

    expect(selection()).toMatchObject({ row: [0, 0], column: [0, 0] });
  });

  it("hands focus to the cell input rather than stranding it on the button", async () => {
    clickBackToTop();
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });

    // The same target the name box commits to and a plain cell click leaves
    // focus on. The grid root is not it: it is an unnamed container whose first
    // focusable descendant is the select-all corner, which a screen reader
    // announces instead of the cell.
    const active = document.activeElement as HTMLElement;
    expect(active.className).toContain("luckysheet-cell-input");
    expect(active.className).not.toContain("fortune-add-row-button");
  });
});
