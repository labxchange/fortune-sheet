import { render, fireEvent } from "@testing-library/react";
import React from "react";
import { Context } from "@fortune-sheet/core";
import ScrollBar from "../src/components/SheetOverlay/ScrollBar";
import Workbook from "../src/components/Workbook";
import WorkbookContext from "../src/context";

// The scrollbars were bare scrollable divs. Chrome makes any scrollable
// container focusable, so each already took a focus stop — announced as
// "group", with no name, no position, and no key that did anything. These cover
// what they now declare and what the keys do.
//
// Rendered against a hand-built context rather than a whole workbook: the
// component reads every extent it exposes from `Context`, and jsdom has no
// layout, so a real workbook would report zero for all of it.

const CELL_AREA_ID = "cell-area";

const makeContext = (over: Partial<Context> = {}) =>
  ({
    lang: "en",
    currentSheetId: "s1",
    scrollLeft: 0,
    scrollTop: 0,
    // Viewport, and content larger than it on both axes.
    cellmainWidth: 300,
    cellmainHeight: 200,
    ch_width: 1000,
    rh_height: 800,
    rowHeaderWidth: 46,
    // Cumulative row bottoms and column rights, the grid an arrow key steps
    // along: 20px rows and 100px columns.
    visibledatarow: Array.from({ length: 40 }, (_, i) => (i + 1) * 20),
    visibledatacolumn: Array.from({ length: 10 }, (_, i) => (i + 1) * 100),
    ...over,
  } as unknown as Context);

const Harness: React.FC<{
  axis: "x" | "y";
  over: Partial<Context>;
  refs: any;
  onKeyDown: () => void;
  setContext: (recipe: (ctx: any) => void) => void;
}> = ({ axis, over, refs, onKeyDown, setContext }) => {
  const value = React.useMemo(
    () => ({ context: makeContext(over), refs, setContext } as any),
    [over, refs, setContext]
  );
  return (
    <WorkbookContext.Provider value={value}>
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div onKeyDown={onKeyDown}>
        <ScrollBar axis={axis} controls={CELL_AREA_ID} />
      </div>
    </WorkbookContext.Provider>
  );
};

const renderBar = (
  axis: "x" | "y",
  over?: Partial<Context>,
  globalCache?: Record<string, any>
) => {
  const refs = {
    scrollbarX: React.createRef<HTMLDivElement>(),
    scrollbarY: React.createRef<HTMLDivElement>(),
    globalCache: { undoList: [], redoList: [], ...(globalCache ?? {}) },
  };
  const outerKeyDown = jest.fn();
  const setContext = jest.fn();
  const view = render(
    <Harness
      axis={axis}
      over={over ?? {}}
      refs={refs}
      onKeyDown={outerKeyDown}
      setContext={setContext}
    />
  );
  const bar = view.container.querySelector<HTMLDivElement>(
    `.luckysheet-scrollbar-${axis}`
  )!;
  const rerenderWith = (next: Partial<Context>) =>
    view.rerender(
      <Harness
        axis={axis}
        over={next}
        refs={refs}
        onKeyDown={outerKeyDown}
        setContext={setContext}
      />
    );
  return { bar, outerKeyDown, rerenderWith, setContext };
};

/**
 * jsdom has no scrolling box, so `scrollLeft`/`scrollTop` are inert there: the
 * assignment the component makes would read back as zero. The stub stands in
 * for the element, clamping the way a browser does — which is also the point of
 * writing the DOM rather than `Context`, so the clamp belongs in the stand-in
 * rather than being asserted as the component's own arithmetic.
 */
const stubOffset = (
  el: HTMLElement,
  prop: "scrollLeft" | "scrollTop",
  max: number,
  initial = 0
) => {
  let value = initial;
  Object.defineProperty(el, prop, {
    get: () => value,
    set: (v: number) => {
      value = Math.min(max, Math.max(0, v));
    },
    configurable: true,
  });
};

describe("scrollbar semantics", () => {
  it("declares the horizontal scrollbar", () => {
    const { bar } = renderBar("x");
    expect(bar.getAttribute("role")).toBe("scrollbar");
    expect(bar.getAttribute("aria-label")).toBe("Spreadsheet");
    expect(bar.getAttribute("aria-orientation")).toBe("horizontal");
    expect(bar.getAttribute("aria-controls")).toBe(CELL_AREA_ID);
  });

  it("takes both names from the active locale", () => {
    // Not a hardcoded string in the component: a screen-reader-only name that
    // silently falls back to English is invisible to review.
    expect(
      renderBar("x", { lang: "es" } as any).bar.getAttribute("aria-label")
    ).toBe("Hoja de cálculo");
    expect(
      renderBar("y", { lang: "es" } as any).bar.getAttribute("aria-label")
    ).toBe("Hoja de cálculo");
  });

  it("declares the vertical scrollbar", () => {
    const { bar } = renderBar("y");
    expect(bar.getAttribute("role")).toBe("scrollbar");
    expect(bar.getAttribute("aria-label")).toBe("Spreadsheet");
    expect(bar.getAttribute("aria-orientation")).toBe("vertical");
    expect(bar.getAttribute("aria-controls")).toBe(CELL_AREA_ID);
  });

  it.each(["x", "y"])("does not put the role in the %s name", (axis) => {
    // Assistive technology appends the role and the orientation itself, so a
    // name that contains them is spoken twice — "Horizontal scroll bar,
    // horizontal scroll bar". The name says what is scrolled; the role says
    // what the control is.
    const label = renderBar(axis as "x" | "y").bar.getAttribute("aria-label")!;
    expect(label.toLowerCase()).not.toContain("scroll");
    expect(label.toLowerCase()).not.toContain("horizontal");
    expect(label.toLowerCase()).not.toContain("vertical");
  });

  it("stays in the tab order", () => {
    // The audit asks for these to remain operable, not to be hidden away.
    expect(renderBar("x").bar.tabIndex).toBe(0);
    expect(renderBar("y").bar.tabIndex).toBe(0);
  });

  it("derives its value range from the scroll geometry", () => {
    const { bar } = renderBar("x", { scrollLeft: 120 });
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    // Content 1000 against a 300 viewport.
    expect(bar.getAttribute("aria-valuemax")).toBe("700");
    expect(bar.getAttribute("aria-valuenow")).toBe("120");
  });

  it("reports the vertical offset against the vertical extent", () => {
    const { bar } = renderBar("y", { scrollTop: 50 });
    expect(bar.getAttribute("aria-valuemax")).toBe("600");
    expect(bar.getAttribute("aria-valuenow")).toBe("50");
  });

  it("prefers the element's own extent over the computed geometry", () => {
    // The strip is not exactly the viewport it stands for — the vertical one
    // runs the full height of the row body, taller than the cell area — so
    // `rh_height - cellmainHeight` overstates the reach, and the value would
    // report a maximum the user can never scroll to. Stubbed because jsdom has
    // no layout and reports zero for all of it.
    const { bar, rerenderWith } = renderBar("y", {
      rh_height: 936,
      cellmainHeight: 657,
    });
    // Computed geometry alone, before anything is measurable.
    expect(bar.getAttribute("aria-valuemax")).toBe("279");

    Object.defineProperty(bar, "scrollHeight", {
      value: 936,
      configurable: true,
    });
    Object.defineProperty(bar, "clientHeight", {
      value: 677,
      configurable: true,
    });
    // Any layout change re-measures; a viewport of one more pixel stands in.
    rerenderWith({ rh_height: 936, cellmainHeight: 658 });
    // 936 - 677, not 936 - 658: the figure the user can actually reach.
    expect(bar.getAttribute("aria-valuemax")).toBe("259");
  });

  it.each([
    ["y", "visibledatarow", "Row 6"],
    // Columns are lettered and rows numbered, as everywhere else in a
    // spreadsheet. 100px columns, so offset 105 sits in the second — B, not 2.
    ["x", "visibledatacolumn", "Column B"],
  ])(
    "names the %s position rather than a pixel offset",
    (axis, key, expected) => {
      // A raw offset is read out as "120", or "17 percent" — neither of which
      // tells anyone where they are in a spreadsheet. The row or column does.
      const { bar } = renderBar(
        axis as "x" | "y",
        {
          [key === "visibledatarow" ? "scrollTop" : "scrollLeft"]: 105,
        } as any
      );
      expect(bar.getAttribute("aria-valuetext")).toBe(expected);
    }
  );

  it.each([
    // A *vertical* freeze line freezes columns, which the horizontal scrollbar
    // scrolls — the axis names invert, so both directions are pinned here.
    ["x", { vertical: { freezenverticaldata: [200], left: 0 } }, "Column C"],
    ["y", { horizontal: { freezenhorizontaldata: [80], top: 0 } }, "Row 5"],
  ])(
    "counts the frozen block when naming the %s position",
    (axis, freeze, expected) => {
      // Frozen rows and columns are painted over the scroll area rather than
      // scrolling with it, so the first one actually on screen sits a whole
      // frozen block past the raw offset. Without this the position was short
      // by exactly the frozen count. Columns here are 100px and rows 20px, so a
      // 200px / 80px frozen block is two columns / four rows.
      const { bar } = renderBar(
        axis as "x" | "y",
        { [axis === "x" ? "scrollLeft" : "scrollTop"]: 0 } as any,
        { freezen: { s1: freeze } }
      );
      expect(bar.getAttribute("aria-valuetext")).toBe(expected);
    }
  );

  it("is unaffected when the sheet has no frozen panes", () => {
    const { bar } = renderBar("x", { scrollLeft: 0 });
    expect(bar.getAttribute("aria-valuetext")).toBe("Column A");
  });

  it("collapses to a single value when the content does not overflow", () => {
    // Rather than reporting a range that cannot be moved through.
    const { bar } = renderBar("x", { ch_width: 200, cellmainWidth: 300 });
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("0");
    expect(bar.getAttribute("aria-valuenow")).toBe("0");
  });
});

describe("scrollbar keyboard operation", () => {
  it("steps the horizontal offset to the next column boundary", () => {
    const { bar } = renderBar("x");
    stubOffset(bar, "scrollLeft", 700, 100);
    fireEvent.keyDown(bar, { key: "ArrowRight" });
    expect(bar.scrollLeft).toBe(200);
    fireEvent.keyDown(bar, { key: "ArrowLeft" });
    expect(bar.scrollLeft).toBe(100);
  });

  it("steps the vertical offset to the next row boundary", () => {
    const { bar } = renderBar("y");
    stubOffset(bar, "scrollTop", 600, 100);
    fireEvent.keyDown(bar, { key: "ArrowDown" });
    expect(bar.scrollTop).toBe(120);
    fireEvent.keyDown(bar, { key: "ArrowUp" });
    expect(bar.scrollTop).toBe(100);
  });

  it("steps from part-way across a row onto the boundary either side", () => {
    // Landing mid-cell is what a fixed pixel step does; a step should leave the
    // grid aligned however it was reached.
    const { bar } = renderBar("y");
    stubOffset(bar, "scrollTop", 600, 107);
    fireEvent.keyDown(bar, { key: "ArrowDown" });
    expect(bar.scrollTop).toBe(120);
    stubOffset(bar, "scrollTop", 600, 107);
    fireEvent.keyDown(bar, { key: "ArrowUp" });
    expect(bar.scrollTop).toBe(100);
  });

  it("falls back to a fixed step when there is no grid to step along", () => {
    const { bar } = renderBar("y", { visibledatarow: [] });
    stubOffset(bar, "scrollTop", 600, 100);
    fireEvent.keyDown(bar, { key: "ArrowDown" });
    expect(bar.scrollTop).toBe(140);
  });

  it("pages by one viewport", () => {
    const { bar } = renderBar("y");
    stubOffset(bar, "scrollTop", 600, 250);
    fireEvent.keyDown(bar, { key: "PageDown" });
    expect(bar.scrollTop).toBe(450);
    fireEvent.keyDown(bar, { key: "PageUp" });
    expect(bar.scrollTop).toBe(250);
  });

  it("jumps to either extreme with Home and End", () => {
    const { bar } = renderBar("x");
    stubOffset(bar, "scrollLeft", 700, 300);
    fireEvent.keyDown(bar, { key: "End" });
    expect(bar.scrollLeft).toBe(700);
    fireEvent.keyDown(bar, { key: "Home" });
    expect(bar.scrollLeft).toBe(0);
  });

  it("holds at the bounds", () => {
    const { bar } = renderBar("x");
    stubOffset(bar, "scrollLeft", 700, 0);
    fireEvent.keyDown(bar, { key: "ArrowLeft" });
    expect(bar.scrollLeft).toBe(0);
    fireEvent.keyDown(bar, { key: "End" });
    fireEvent.keyDown(bar, { key: "ArrowRight" });
    expect(bar.scrollLeft).toBe(700);
  });

  it("leaves the off-axis arrows alone", () => {
    const { bar, outerKeyDown } = renderBar("x");
    stubOffset(bar, "scrollLeft", 700, 100);
    fireEvent.keyDown(bar, { key: "ArrowDown" });
    expect(bar.scrollLeft).toBe(100);
    // Not consumed, so whatever would normally handle it still can.
    expect(outerKeyDown).toHaveBeenCalled();
  });

  it("leaves the off-axis arrows alone on the vertical scrollbar", () => {
    const { bar, outerKeyDown } = renderBar("y");
    stubOffset(bar, "scrollTop", 600, 100);
    fireEvent.keyDown(bar, { key: "ArrowRight" });
    expect(bar.scrollTop).toBe(100);
    expect(outerKeyDown).toHaveBeenCalled();
  });

  it.each([["ctrlKey"], ["metaKey"], ["altKey"], ["shiftKey"]])(
    "ignores a key held with %s",
    (modifier) => {
      // `e.key === "PageDown"` is just as true for Ctrl+PageDown, so without a
      // modifier gate the scrollbar swallowed the browser's own tab-switch, and
      // took Ctrl+Home and Shift+Home away from the grid's shortcuts — while
      // scrolling, which is not what any of them mean.
      const { bar, outerKeyDown } = renderBar("y");
      stubOffset(bar, "scrollTop", 600, 100);
      fireEvent.keyDown(bar, { key: "PageDown", [modifier]: true });
      expect(bar.scrollTop).toBe(100);
      expect(outerKeyDown).toHaveBeenCalled();
    }
  );

  it("completes the round trip from a key to the context offset", () => {
    // The handler writes the DOM and lets the element's own `scroll` event push
    // the offset into `Context` — deliberately, so the browser does the
    // clamping. jsdom has no scrolling box and so never fires that event, which
    // is why the key tests above stop at the DOM write. Dispatching it by hand
    // covers the second half; the full loop is verified in a real browser.
    const { bar, setContext } = renderBar("y");
    stubOffset(bar, "scrollTop", 600, 0);
    fireEvent.keyDown(bar, { key: "ArrowDown" });
    fireEvent.scroll(bar);
    expect(setContext).toHaveBeenCalled();
    const draftCtx = { scrollTop: 0, scrollLeft: 0 };
    setContext.mock.calls.forEach(([recipe]: [(c: any) => void]) =>
      recipe(draftCtx)
    );
    expect(draftCtx.scrollTop).toBe(bar.scrollTop);
  });

  it("does not let a key it handles reach the grid", () => {
    // The workbook's global handler is what moves the cell cursor and runs the
    // region shortcuts; a Home that both scrolled and jumped the cursor would
    // be worse than either alone.
    const { bar, outerKeyDown } = renderBar("x");
    stubOffset(bar, "scrollLeft", 700, 100);
    ["ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End"].forEach(
      (key) => {
        fireEvent.keyDown(bar, { key });
      }
    );
    expect(outerKeyDown).not.toHaveBeenCalled();
  });
});

describe("scrollbars in a rendered workbook", () => {
  it("points aria-controls at the cell area it scrolls", () => {
    // The id is generated rather than literal, because a page can hold more
    // than one workbook — so what matters is that it resolves, not what it is.
    const { container } = render(
      <Workbook
        lang="en"
        data={
          [
            { name: "Sheet1", id: "s1", celldata: [], row: 10, column: 8 },
          ] as any
        }
      />
    );
    const cellArea = container.querySelector(".fortune-cell-area")!;
    expect(cellArea.id).toBeTruthy();
    ["x", "y"].forEach((axis) => {
      const bar = container.querySelector(`.luckysheet-scrollbar-${axis}`)!;
      expect(bar.getAttribute("aria-controls")).toBe(cellArea.id);
    });
  });
});
