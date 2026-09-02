import {
  handleGlobalWheel,
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
// `shouldSkipGlobalWheel` is that shared answer.
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

describe("shouldSkipGlobalWheel", () => {
  it("does not skip a plain gesture over the grid", () => {
    expect(shouldSkipGlobalWheel(ctx(), cache())).toBe(false);
  });

  it("skips when the pointer is over the dialog, opened by Find alone", () => {
    // The bug this replaced read `showSearch && showReplace`. Ctrl+F sets only
    // showSearch, so the guard never fired and the grid ate every gesture.
    expect(
      shouldSkipGlobalWheel(
        ctx({ showSearch: true }),
        cache({ searchDialog: { mouseEnter: true } } as any)
      )
    ).toBe(true);
  });

  it("skips when the pointer is over the dialog, opened by Replace alone", () => {
    expect(
      shouldSkipGlobalWheel(
        ctx({ showReplace: true }),
        cache({ searchDialog: { mouseEnter: true } } as any)
      )
    ).toBe(true);
  });

  it("skips when the pointer is over the dialog and both flags are set", () => {
    // The one combination the old `showSearch && showReplace` guard *did*
    // satisfy, and so the case that tells "the fix widened the guard" apart
    // from "the fix moved the bug": widening with `||` has to keep the far end
    // of the table intact, not trade one unreachable branch for another.
    // Reachable in practice — Ctrl+H after Ctrl+F leaves both set.
    expect(
      shouldSkipGlobalWheel(
        ctx({ showSearch: true, showReplace: true }),
        cache({ searchDialog: { mouseEnter: true } } as any)
      )
    ).toBe(true);
  });

  it("does not skip when the dialog is open but the pointer is elsewhere", () => {
    expect(
      shouldSkipGlobalWheel(
        ctx({ showSearch: true }),
        cache({ searchDialog: { mouseEnter: false } } as any)
      )
    ).toBe(false);
  });

  it("does not skip on hover alone, with no dialog open", () => {
    expect(
      shouldSkipGlobalWheel(
        ctx(),
        cache({ searchDialog: { mouseEnter: true } } as any)
      )
    ).toBe(false);
  });

  it("skips while a filter menu is open", () => {
    expect(
      shouldSkipGlobalWheel(ctx({ filterContextMenu: {} as any }), cache())
    ).toBe(true);
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

  it("never cancels the event itself, because it cannot do so in time", () => {
    // If this starts failing, the cancellation has moved back inside the
    // recipe and is silently ineffective during a continuous gesture.
    const e = wheelEvent();
    handleGlobalWheel(
      ctx({
        visibledatarow: [20, 40, 60],
        visibledatacolumn: [50, 100],
        zoomRatio: 1,
      } as any),
      e,
      cache(),
      scrollbar(),
      scrollbar()
    );
    expect(e.defaultPrevented).toBe(false);
  });

  it("scrolls the grid when the guard says it should", () => {
    const y = scrollbar();
    handleGlobalWheel(
      ctx({
        visibledatarow: [20, 40, 60],
        visibledatacolumn: [50, 100],
        zoomRatio: 1,
      } as any),
      wheelEvent(),
      cache(),
      scrollbar(),
      y
    );
    expect(y.scrollTop).toBeGreaterThan(0);
  });

  it("leaves the grid alone when the guard says to skip", () => {
    const y = scrollbar();
    handleGlobalWheel(
      ctx({
        showSearch: true,
        visibledatarow: [20, 40, 60],
        visibledatacolumn: [50, 100],
        zoomRatio: 1,
      } as any),
      wheelEvent(),
      cache({ searchDialog: { mouseEnter: true } } as any),
      scrollbar(),
      y
    );
    expect(y.scrollTop).toBe(0);
  });
});
