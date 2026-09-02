import {
  render,
  fireEvent,
  waitFor,
  within,
  act,
} from "@testing-library/react";
import { readFileSync } from "fs";
import { join } from "path";
import React from "react";
import { SELF_SCROLLING_SELECTOR } from "@fortune-sheet/core";
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
//
// Every gesture below is dispatched *on the element it is over*, because that
// is now the whole of the decision: the guard reads `e.target` rather than a
// remembered hover flag. The three revisions before it each described where
// the pointer was and inferred what the browser would do about it, and each
// was corrected for exempting somewhere that has nothing to scroll — so the
// cases that matter most here are the ones over the dialog but outside its
// results box.

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

/** Opens the dialog and runs Find All, so #searchAllbox exists. Returns the
 *  render so a case can reach both the dialog and the grid. */
const openWithResults = async () => {
  const view = renderWorkbook();
  fireEvent.click(view.getByRole("button", { name: /find and replace/i }));
  const dialog = await waitFor(() => view.getByRole("dialog"));
  fireEvent.change(within(dialog).getByLabelText("Find Content"), {
    target: { value: "alpha" },
  });
  fireEvent.click(dialog.querySelector<HTMLElement>("#searchAllBtn")!);
  await waitFor(() => within(dialog).getByRole("listbox"));
  return { ...view, dialog };
};

const resultsBox = (dialog: HTMLElement) =>
  dialog.querySelector<HTMLElement>(SELF_SCROLLING_SELECTOR)!;

/** jsdom loads no stylesheet and lays nothing out, so the two facts the guard
 *  reads — is this a scroll container, and does it overflow — have no answer
 *  here. Both are stated: `overflow-y` as an inline style, which jsdom's
 *  getComputedStyle does honour, and the heights outright.
 *
 *  Each case says which box it means — a filled list, or the one-match list
 *  that does not fill the 210px box — rather than inheriting a default. The
 *  stylesheet's own half of this is asserted at the bottom of the file. */
const withOverflow = (box: HTMLElement, overflows: boolean) => {
  box.style.overflowY = "auto";
  Object.defineProperty(box, "clientHeight", {
    value: 210,
    configurable: true,
  });
  Object.defineProperty(box, "scrollHeight", {
    value: overflows ? 420 : 60,
    configurable: true,
  });
  return box;
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
    //
    // Dispatched on the box, bubbling to the container the listener is bound
    // on — which is what a real gesture over the results does.
    const { dialog } = await openWithResults();

    expect(wheelOver(withOverflow(resultsBox(dialog), true))).toBe(false);
  });

  it("cancels over a results list too short to scroll", async () => {
    // The exemption is measured rather than inferred from the element's
    // identity, and this is why that matters: a search matching one cell puts
    // 60px of content in the 210px box, so Chrome scrolls nothing there. It is
    // the ordinary case, not a corner, and leaving it uncancelled would chain
    // the gesture to the host page.
    const { dialog } = await openWithResults();

    expect(wheelOver(withOverflow(resultsBox(dialog), false))).toBe(true);
  });

  it("leaves a gesture over a result option alone too", async () => {
    // The realistic pointer position: the options fill the box, so a user
    // scrolling the list is over a row and not over the box itself. The guard
    // asks `closest`, so the two are one answer.
    const { dialog } = await openWithResults();
    withOverflow(resultsBox(dialog), true);
    const [option] = within(dialog).getAllByRole("option");

    expect(wheelOver(option)).toBe(false);
  });

  it("cancels a gesture over the dialog outside the results box", async () => {
    // The round-five regression. The exemption used to be a hover flag on the
    // dialog *root*, so it covered the 30px/42px padding bands, the tab strip,
    // both input rows, the checkboxes and the button box — none of which has
    // anything to scroll. `#fortune-search-replace` has no overflow, and
    // neither does SheetOverlay or the sheet container (the grid scrolls
    // through JS and its own scrollbar divs), so an uncancelled gesture there
    // chains all the way to the document: nothing in the standalone demo, the
    // host page in an embedded workbook. `master` cancelled it.
    //
    // Asserted with the results box present, so the case is about *where* the
    // gesture landed and not about whether the box exists — the next case is
    // the one that covers its absence.
    const { dialog } = await openWithResults();
    withOverflow(resultsBox(dialog), true);

    // Inert under this implementation: nothing listens for it any more. It is
    // here because it is what a real pointer arriving over the dialog does,
    // and it is the state the revision this case exists to pin keyed off — so
    // without it the case passes against that revision as well as this one,
    // which is no case at all.
    fireEvent.mouseEnter(dialog);

    expect(wheelOver(within(dialog).getByLabelText("Find Content"))).toBe(true);
    expect(wheelOver(dialog.querySelector<HTMLElement>(".btnBox")!)).toBe(true);
    expect(wheelOver(dialog)).toBe(true);
  });

  it("cancels a gesture anywhere over a freshly-opened dialog", async () => {
    // Why the case above is not an edge: #searchAllbox only renders once Find
    // All has been run, so before that the dialog has no self-scrolling
    // element at all and its entire surface leaked under the hover flag.
    const { getByRole } = renderWorkbook();
    fireEvent.click(getByRole("button", { name: /find and replace/i }));
    const dialog = await waitFor(() => getByRole("dialog"));

    // See the note on mouseEnter in the case above: it is what makes this one
    // discriminating rather than vacuous.
    fireEvent.mouseEnter(dialog);

    expect(dialog.querySelector(SELF_SCROLLING_SELECTOR)).toBeNull();
    expect(wheelOver(dialog)).toBe(true);
    expect(wheelOver(within(dialog).getByLabelText("Find Content"))).toBe(true);
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

  it("cancels again as soon as the gesture moves back to the grid", async () => {
    // The exemption is per-gesture, not a mode the dialog puts the grid into:
    // there is no state to leave behind, so nothing has to be unwound when the
    // pointer moves off the box. Worth pinning because the flag version had to
    // be — and had no `mouseleave` to do it with when the box unmounted under
    // the pointer, which Find Next does by clearing the results.
    const { container, dialog } = await openWithResults();

    expect(wheelOver(withOverflow(resultsBox(dialog), true))).toBe(false);
    expect(wheelOver(gridContainer(container))).toBe(true);
  });

  it("answers for its own results box when two workbooks are on the page", () => {
    // `#searchAllbox` is an id shared by every instance, which is the shape
    // that bit the labels in round three. It is inert here for a stated
    // reason, and this is the case that holds the statement to account: the
    // guard reaches the box through `closest` from the gesture's own target,
    // so it walks that workbook's ancestors rather than the document — where
    // `getElementById` would have returned the first box on the page.
    const view = render(
      <div>
        <Workbook data={DATA} toolbarItems={["search"]} />
        <Workbook data={DATA} toolbarItems={["search"]} />
      </div>
    );
    const grids = Array.from(
      view.container.querySelectorAll<HTMLElement>(".fortune-sheet-container")
    );
    expect(grids).toHaveLength(2);

    // Both workbooks have a box, under the same id, in the state the id
    // collision would confuse: the first scrolls, the second does not.
    const boxIn = (grid: HTMLElement, overflows: boolean) => {
      const box = document.createElement("div");
      box.id = SELF_SCROLLING_SELECTOR.slice(1);
      grid.appendChild(box);
      return withOverflow(box, overflows);
    };
    const first = boxIn(grids[0], true);
    const second = boxIn(grids[1], false);

    // Each gesture is answered by the box it is actually over. Under
    // `getElementById` both would have been answered by `first`, and the
    // second workbook's short list would have been exempted on the strength
    // of the first workbook's long one.
    expect(wheelOver(first)).toBe(false);
    expect(wheelOver(second)).toBe(true);
    // And neither box speaks for the other's grid.
    expect(wheelOver(grids[0])).toBe(true);
    expect(wheelOver(grids[1])).toBe(true);
  });

  // The guard declines to cancel over #searchAllbox on the strength of two
  // declarations in a stylesheet jest never loads: `overflow-y: auto`, so the
  // browser has something to scroll there, and `overscroll-behavior: contain`,
  // so the gesture stops there rather than chaining out to the grid and past
  // it to the host page. Every case above is blind to both — identity-obj-proxy
  // means no CSS reaches the render — so the JS could keep passing while the
  // rule that justifies it was renamed or dropped.
  //
  // Read as text for the same reason searchReplaceContrast.test.tsx does. This
  // is the join between the two halves of the fix, and the class of drift that
  // has cost this change three review rounds: a predicate whose correctness
  // lives in another file, unstated and unasserted.
  describe("the exemption's precondition, in CSS", () => {
    const CSS = readFileSync(
      join(__dirname, "../src/components/SearchReplace/index.css"),
      "utf-8"
    );

    /** The declarations of the top-level rule whose selector *ends* with the
     *  guard's selector — the stylesheet scopes it under the dialog id, and
     *  the descendant rules (`… #searchAllbox .boxItem {`) are excluded by
     *  requiring the brace to follow the selector directly.
     *
     *  Comments are stripped first. This rule carries a block explaining why
     *  both declarations are load-bearing, and that prose names them — so
     *  without this the assertions below could match the explanation of a
     *  declaration that had been deleted, which is the exact failure this
     *  describe block exists to prevent. */
    const rule = () => {
      const at = CSS.search(
        new RegExp(`^[^{}]*${SELF_SCROLLING_SELECTOR}\\s*\\{`, "m")
      );
      expect(at).toBeGreaterThan(-1);
      return CSS.slice(at, CSS.indexOf("}", at)).replace(
        /\/\*[\s\S]*?\*\//g,
        ""
      );
    };

    it("gives the browser something to scroll there", () => {
      expect(rule()).toMatch(/(?:^|[\s;{])overflow-y:\s*auto/);
    });

    it("keeps the gesture from chaining out of it", () => {
      expect(rule()).toMatch(/(?:^|[\s;{])overscroll-behavior:\s*contain/);
    });
  });
});
