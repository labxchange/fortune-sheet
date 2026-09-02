import {
  render,
  fireEvent,
  waitFor,
  within,
  act,
} from "@testing-library/react";
import React from "react";
import Workbook, { WorkbookInstance } from "../src/components/Workbook";

// A wheel gesture over the grid has to be cancelled, or the browser scrolls
// whatever is under the cursor at the same time as the grid scrolls itself.
//
// The cancellation cannot live where the scrolling does. `Sheet` scrolls the
// grid from inside a `setContext` recipe, and React hands that recipe over as
// a state updater — it runs eagerly only while the fiber has no pending work,
// and during a continuous gesture it usually has, so the recipe is deferred
// into the render pass and a `preventDefault` there arrives after the event
// has finished dispatching, where it is ignored.
//
// So these cases assert `defaultPrevented` synchronously, on the event object,
// immediately after dispatch — which is the only point at which the answer
// still means anything to the browser. A second gesture dispatched before the
// first has been rendered is the case that regressed: it is the one whose
// recipe is deferred.

const DATA = [
  {
    name: "Sheet1",
    celldata: [
      {
        r: 0,
        c: 0,
        v: { v: "alpha", m: "alpha", ct: { fa: "General", t: "s" } },
      },
    ],
  },
];

// The same sheet with a filter over A1:B2, so the funnel buttons render and a
// filter menu can actually be opened. Needed by the filter case at the bottom:
// `filterContextMenu` is the other half of the scroll guard, and the half
// whose cancel behaviour is easiest to widen by accident.
const DATA_WITH_FILTER = [
  {
    name: "Sheet1",
    celldata: [
      {
        r: 0,
        c: 0,
        v: { v: "Name", m: "Name", ct: { fa: "General", t: "s" } },
      },
      {
        r: 0,
        c: 1,
        v: { v: "Size", m: "Size", ct: { fa: "General", t: "s" } },
      },
      { r: 1, c: 0, v: { v: "a", m: "a", ct: { fa: "General", t: "s" } } },
      { r: 1, c: 1, v: { v: "1", m: "1", ct: { fa: "General", t: "n" } } },
    ],
    filter_select: { row: [0, 1], column: [0, 1] },
  },
];

const renderWorkbook = (data: any = DATA) => {
  const ref = React.createRef<WorkbookInstance>();
  const view = render(
    <Workbook ref={ref} data={data} toolbarItems={["search"]} />
  );
  act(() => {
    ref.current!.setSelection([{ row: [0, 0], column: [0, 0] }]);
  });
  return { ...view, ref };
};

const gridContainer = (container: HTMLElement) =>
  container.querySelector<HTMLElement>(".fortune-sheet-container")!;

/** Dispatches a real cancelable wheel event and reports whether the handler
 *  cancelled it *by the time dispatch returned* — not eventually. */
const wheelOver = (el: HTMLElement, deltaY = 120) => {
  const e = new WheelEvent("wheel", {
    deltaY,
    bubbles: true,
    cancelable: true,
  });
  el.dispatchEvent(e);
  return e.defaultPrevented;
};

describe("Grid wheel cancellation", () => {
  it("cancels a wheel gesture over the grid", () => {
    const { container } = renderWorkbook();
    expect(wheelOver(gridContainer(container))).toBe(true);
  });

  it("still cancels a burst, where the recipe cannot have run in between", () => {
    // A smoke test, not the proof. Whether the old code failed this depended
    // on React's eager-updater path, which is precisely the timing this fix
    // stops relying on — so under some schedulers the old code passed it too.
    // The deterministic statement of the same invariant is in
    // core/test/events/wheelGuard.test.ts: handleGlobalWheel must not be the
    // thing that cancels.
    const { container } = renderWorkbook();
    const grid = gridContainer(container);

    const results = [
      wheelOver(grid),
      wheelOver(grid),
      wheelOver(grid),
      wheelOver(grid),
    ];

    expect(results).toEqual([true, true, true, true]);
  });

  it("leaves a gesture over the Find All results for the browser to scroll", async () => {
    // The dialog's results box does its own scrolling (overscroll-behavior
    // keeps it there), so the grid must neither scroll nor cancel. This is the
    // positive control for the guard: it proves the two cases above are
    // cancelled by a decision, not unconditionally.
    const { container, getByRole } = renderWorkbook();

    fireEvent.click(getByRole("button", { name: /find and replace/i }));
    const dialog = await waitFor(() => getByRole("dialog"));
    fireEvent.change(within(dialog).getByLabelText("Find Content"), {
      target: { value: "alpha" },
    });
    fireEvent.click(dialog.querySelector<HTMLElement>("#searchAllBtn")!);
    await waitFor(() => within(dialog).getByRole("listbox"));

    // mouseEnter is what tells the grid the pointer is over the dialog.
    fireEvent.mouseEnter(dialog);

    expect(wheelOver(gridContainer(container))).toBe(false);
  });

  it("still cancels while a filter menu is open", async () => {
    // The grid declines to *scroll* while a menu is open, and that is not the
    // same as declining to cancel: unifying the two predicates made an open
    // menu suppress both, so a wheel anywhere over the grid fell through to
    // the nearest scrollable ancestor — the host page, in an embedded
    // workbook. `master` cancelled this gesture unconditionally, and it still
    // does.
    //
    // The DOM-level statement of the row in
    // core/test/events/wheelGuard.test.ts: the suite's other cases only ever
    // exercise the dialog, so nothing here would have caught it.
    const { container } = renderWorkbook(DATA_WITH_FILTER);

    const funnels = () =>
      Array.from(
        document.querySelectorAll<HTMLElement>(".luckysheet-filter-options")
      );
    await waitFor(() => expect(funnels().length).toBeGreaterThan(0));

    const [first] = funnels();
    first.focus();
    fireEvent.keyDown(first, { key: "Enter" });
    await waitFor(() =>
      expect(document.querySelector(".fortune-filter-menu")).toBeTruthy()
    );

    // Re-asserted immediately before the gesture, not only in the waitFor
    // above: the expectation below is the same value a grid with no menu open
    // would give, so the case is only worth anything while the menu is
    // provably still up. `.fortune-filter-menu` renders only when
    // `ctx.filterContextMenu` is set, which is the state under test.
    expect(document.querySelector(".fortune-filter-menu")).toBeTruthy();
    expect(wheelOver(gridContainer(container))).toBe(true);
  });

  it("resumes cancelling once the pointer leaves the dialog", async () => {
    const { container, getByRole } = renderWorkbook();

    fireEvent.click(getByRole("button", { name: /find and replace/i }));
    const dialog = await waitFor(() => getByRole("dialog"));

    fireEvent.mouseEnter(dialog);
    expect(wheelOver(gridContainer(container))).toBe(false);

    fireEvent.mouseLeave(dialog);
    expect(wheelOver(gridContainer(container))).toBe(true);
  });
});
