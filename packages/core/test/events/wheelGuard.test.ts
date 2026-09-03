import {
  handleGlobalWheel,
  isOverSelfScrollingElement,
  SELF_SCROLLING_SELECTOR,
  shouldCancelGlobalWheel,
  shouldSkipGlobalWheel,
} from "../../src/events/mouse";
import type { Context, GlobalCache } from "../../src";

// The invariant these pin is a division of labour, not a scroll position.
//
// `handleGlobalWheel` runs inside a `setContext` recipe, which React hands
// over as a state updater and runs in the render pass whenever the fiber has
// pending work — so anything it does to the *event* lands after dispatch has
// finished and is ignored by the browser. Cancelling therefore has to happen
// in the caller, synchronously, and both sides have to agree on when to do it.
// `shouldSkipGlobalWheel` answers the recipe's half — should the grid scroll
// — and `shouldCancelGlobalWheel` the caller's. They are separate because they
// differ on exactly one row of the table: while a filter menu is open the grid
// declines to scroll but the gesture is still cancelled, or it falls through to
// whatever contains an embedded workbook. Both tables are asserted below, so
// collapsing them back into one predicate fails here.
//
// The exemption is stated as a *target* test rather than as hover state, and
// the table is the argument for that. Three revisions of this guard described
// where the pointer was and inferred what the browser would do with the
// gesture; each was corrected for over-covering, and the rows named
// "…, where nothing scrolls" are the ones the last two got wrong. A predicate
// that reads `e.target` cannot over-cover, because the exemption is the
// element itself.
//
// Asserted here rather than through a render because this is exactly the part
// a render cannot show: jsdom will happily record a `preventDefault` that a
// real browser would have discarded for arriving too late.

const ctx = (over: Partial<Context> = {}) =>
  ({
    showSearch: false,
    showReplace: false,
    filterContextMenu: undefined,
    ...over,
  } as unknown as Context);

const cache = (over: Partial<GlobalCache> = {}) =>
  ({ ...over } as unknown as GlobalCache);

/** A wheel event over `el`, dispatched inside `container` so the guard can
 *  bound its own upward walk. Built rather than dispatched: the question is
 *  about the event's own fields, and building it keeps the target explicit at
 *  every call site. */
const wheelAt = (
  el: Element | null,
  { container = null as Element | null, deltaX = 0, deltaY = 120 } = {}
) =>
  ({
    target: el,
    currentTarget: container,
    deltaX,
    deltaY,
    preventDefault() {},
  } as unknown as WheelEvent);

/** The grid: any element with no self-scrolling ancestor. */
const grid = () => document.createElement("div");

/** The Find All results box.
 *
 *  Both facts the guard reads are stated rather than laid out, because jsdom
 *  lays nothing out and loads no stylesheet: `overflow` becomes an inline
 *  style (which jsdom's getComputedStyle does honour) and the two heights are
 *  defined outright. They are per-case rather than scenery — the guard asks
 *  whether the browser will really scroll the box, and "yes" needs both. */
const resultsBox = ({
  overflow = "auto",
  overflows = true,
  wide = false,
} = {}) => {
  const box = document.createElement("div");
  box.id = SELF_SCROLLING_SELECTOR.slice(1);
  box.style.overflowY = overflow;
  box.style.overflowX = wide ? overflow : "hidden";
  Object.defineProperty(box, "clientHeight", { value: 210 });
  Object.defineProperty(box, "scrollHeight", { value: overflows ? 420 : 60 });
  Object.defineProperty(box, "clientWidth", { value: 400 });
  Object.defineProperty(box, "scrollWidth", { value: wide ? 800 : 400 });
  return box;
};

const optionInResults = (opts?: Parameters<typeof resultsBox>[0]) => {
  const box = resultsBox(opts);
  const option = document.createElement("div");
  option.setAttribute("role", "option");
  box.appendChild(option);
  return option;
};

/** The dialog's own chrome — inside the dialog, outside the results box. This
 *  is the region the hover-flag revision exempted and should not have: nothing
 *  under the pointer here scrolls, so an uncancelled gesture chains past the
 *  workbook to the host page. */
const dialogChrome = () => {
  const dialog = document.createElement("div");
  dialog.id = "fortune-search-replace";
  const input = document.createElement("input");
  dialog.appendChild(input);
  return input;
};

// The one DOM question, asked once per gesture by the caller. Everything below
// it is pure, which is the point of the split: the two predicates cannot
// disagree about the page, only about what to do with the same answer.
describe("isOverSelfScrollingElement", () => {
  it("is false over the grid", () => {
    expect(isOverSelfScrollingElement(wheelAt(grid()))).toBe(false);
  });

  it("is true on a results box the browser will scroll", () => {
    expect(isOverSelfScrollingElement(wheelAt(resultsBox()))).toBe(true);
  });

  it("is true on a result option inside that box", () => {
    // The realistic pointer position: the options fill the box, so a user
    // scrolling the list is over a row rather than the box. `closest` is what
    // makes the descendant and the box one answer.
    expect(isOverSelfScrollingElement(wheelAt(optionInResults()))).toBe(true);
  });

  it("is false when the list is too short to scroll", () => {
    // A search matching one cell puts a 30px caption and a 30px option inside
    // a 210px box. Chrome scrolls nothing there, so the exemption would leak
    // the gesture — and this is the ordinary case, not a corner.
    expect(
      isOverSelfScrollingElement(wheelAt(resultsBox({ overflows: false })))
    ).toBe(false);
  });

  it("is false when the box is not a scroll container, however much it overflows", () => {
    // `scrollHeight` is the union of descendant boxes, so it exceeds
    // `clientHeight` on an `overflow: visible` element too. Overflowing and
    // scrollable are not the same question, and only the second one licenses
    // declining to cancel — this is what stops the guard resting on a CSS
    // declaration it cannot see.
    expect(
      isOverSelfScrollingElement(wheelAt(resultsBox({ overflow: "visible" })))
    ).toBe(false);
  });

  it("is false over the dialog's own chrome", () => {
    // The round-five regression. The exemption used to be a hover flag on the
    // dialog root, so it covered the padding bands, the tab strip, the inputs
    // and the button box — none of which has anything to scroll.
    expect(isOverSelfScrollingElement(wheelAt(dialogChrome()))).toBe(false);
  });

  it("is false for a horizontal gesture, which the list never scrolls", () => {
    // `.searchResultsList` is `width: 100%`, so there is no horizontal
    // overflow to hand to the browser. Measuring the vertical axis and
    // exempting a shift-wheel on the strength of it would be the same
    // substitute-question mistake in miniature.
    expect(
      isOverSelfScrollingElement(
        wheelAt(resultsBox(), { deltaX: 120, deltaY: 0 })
      )
    ).toBe(false);
  });

  it("is true for a horizontal gesture on a box that does scroll sideways", () => {
    expect(
      isOverSelfScrollingElement(
        wheelAt(resultsBox({ wide: true }), { deltaX: 120, deltaY: 0 })
      )
    ).toBe(true);
  });

  it("is false for a box outside the workbook handling the gesture", () => {
    // `#searchAllbox` is an id, and `closest` walks to the document, so a host
    // page carrying that id on an ancestor would switch cancellation off for
    // the entire grid. The walk is bounded by the listener's own element.
    const foreign = resultsBox();
    const container = document.createElement("div");
    expect(isOverSelfScrollingElement(wheelAt(foreign, { container }))).toBe(
      false
    );
    container.appendChild(foreign);
    expect(isOverSelfScrollingElement(wheelAt(foreign, { container }))).toBe(
      true
    );
  });

  it("is false for a target that is not an element", () => {
    // Both a null target and a node without `closest` — a document reaches
    // this in a listener bound on one — answer "not the results box" instead
    // of throwing inside a native handler.
    expect(isOverSelfScrollingElement(wheelAt(null))).toBe(false);
    expect(
      isOverSelfScrollingElement(wheelAt(document as unknown as Element))
    ).toBe(false);
  });
});

describe("shouldSkipGlobalWheel", () => {
  it("does not skip a plain gesture over the grid", () => {
    expect(shouldSkipGlobalWheel(ctx(), false)).toBe(false);
  });

  it("skips when the browser is going to scroll the results box", () => {
    expect(shouldSkipGlobalWheel(ctx(), true)).toBe(true);
  });

  it("skips while a filter menu is open", () => {
    // The grid is frozen behind the menu. Note this says nothing about
    // cancelling — see the row of the same name below, which is the one place
    // the two tables disagree.
    expect(
      shouldSkipGlobalWheel(ctx({ filterContextMenu: {} as any }), false)
    ).toBe(true);
  });
});

describe("shouldCancelGlobalWheel", () => {
  it("cancels a plain gesture over the grid", () => {
    expect(shouldCancelGlobalWheel(false)).toBe(true);
  });

  it("does not cancel when the browser is going to scroll the results box", () => {
    expect(shouldCancelGlobalWheel(true)).toBe(false);
  });

  it("still cancels while a filter menu is open", () => {
    // The row that separates the two tables, and the round-four regression the
    // split exists to undo. Before the guards were unified, `Sheet` cancelled
    // every gesture unconditionally; unifying them made an open filter menu
    // suppress the cancel as well as the scroll, so a wheel anywhere over the
    // grid fell through to the nearest scrollable ancestor — nothing in the
    // standalone demo, the host page in an embedded workbook.
    //
    // The menu is a sibling of `<Sheet>` in Workbook, so gestures over it
    // never reach the listener that asks this. That is also why this predicate
    // takes no context at all: the filter state is not part of the cancel
    // decision, and giving it one is how the two collapsed into one before.
    expect(shouldCancelGlobalWheel(false)).toBe(true);
  });
});

describe("handleGlobalWheel", () => {
  const scrollbar = () =>
    Object.assign(document.createElement("div"), {
      scrollTop: 0,
      scrollLeft: 0,
    }) as HTMLDivElement;

  const wheelEvent = () =>
    new WheelEvent("wheel", { deltaY: 120, cancelable: true });

  const scrollable = () =>
    ctx({
      visibledatarow: [20, 40, 60],
      visibledatacolumn: [50, 100],
      zoomRatio: 1,
    } as any);

  it("never cancels the event itself, because it cannot do so in time", () => {
    // If this starts failing, the cancellation has moved back inside the
    // recipe and is silently ineffective during a continuous gesture.
    const e = wheelEvent();
    handleGlobalWheel(
      scrollable(),
      e,
      cache(),
      scrollbar(),
      scrollbar(),
      false
    );
    expect(e.defaultPrevented).toBe(false);
  });

  it("scrolls the grid when the guard says it should", () => {
    const y = scrollbar();
    handleGlobalWheel(
      scrollable(),
      wheelEvent(),
      cache(),
      scrollbar(),
      y,
      false
    );
    expect(y.scrollTop).toBeGreaterThan(0);
  });

  it("leaves the grid alone when the guard says to skip", () => {
    const y = scrollbar();
    handleGlobalWheel(
      scrollable(),
      wheelEvent(),
      cache(),
      scrollbar(),
      y,
      true
    );
    expect(y.scrollTop).toBe(0);
  });

  it("derives the answer itself when the caller does not supply one", () => {
    // The default exists for a caller with nothing better to offer. Sheet is
    // not one — it reads the DOM once and passes the result to both halves —
    // but the parameter is optional, so the fallback is worth pinning.
    const y = scrollbar();
    const e = wheelEvent();
    Object.defineProperty(e, "target", { value: resultsBox() });
    handleGlobalWheel(scrollable(), e, cache(), scrollbar(), y);
    expect(y.scrollTop).toBe(0);
  });
});
