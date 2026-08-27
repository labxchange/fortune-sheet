import { render, fireEvent } from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";

/**
 * `.fortune-cell-area` is `overflow: hidden` with a fixed size, which still
 * makes it a scroll container: gestures are blocked, but the browser scrolls it
 * natively to bring a focused element into view — which is what Tabbing to the
 * add-row controls at the bottom of a scrolled sheet does.
 *
 * The sync used to be one-way (context -> DOM), so `context.scrollTop` never
 * learned about it: the canvas kept painting rows for the old offset while
 * every DOM overlay moved with the container. The add-row strip landing over
 * the wrong cells was the reported symptom; the selection outline, the cell
 * input and the notation boxes all drift the same way.
 *
 * These cases cover the grid's core scroll path, not just the strip, because
 * that is the blast radius of adopting the browser's offsets as the real ones.
 *
 * Two things deliberately are NOT asserted here, because jsdom cannot show
 * them and asserting them would be theatre:
 *   - The context -> DOM effect writes `scrollTop` straight back onto the
 *     element. Assigning `.scrollTop` in jsdom does not emit a `scroll` event,
 *     so the ping-pong this could cause in a browser is not reproducible; the
 *     equality guard and immer's structural sharing are what stop it.
 *   - Geometry (does the strip actually clear the last row) and computed colour
 *     need real layout and real CSS. Those belong in an e2e check.
 */
describe("Cell area native scroll adoption", () => {
  const renderGrid = (sheet: Record<string, unknown> = {}) => {
    const { container } = render(
      <Workbook data={[{ name: "Sheet1", ...sheet } as any]} />
    );
    const find = (selector: string) =>
      container.querySelector<HTMLElement>(selector)!;
    return {
      cellArea: find(".fortune-cell-area"),
      scrollbarX: find(".luckysheet-scrollbar-x"),
      scrollbarY: find(".luckysheet-scrollbar-y"),
      strip: find(".luckysheet-bottom-controll-row"),
      rowHeader: find(".fortune-row-header"),
      colHeader: find(".fortune-col-header"),
    };
  };

  it("adopts a native vertical scroll into context", () => {
    const { cellArea, scrollbarY } = renderGrid();

    // The scrollbar is driven off `context.scrollTop`, so it tracking the new
    // offset is the observable proof that context took it rather than ignoring
    // it. Before the handler this stayed at 0 while the DOM overlays moved.
    cellArea.scrollTop = 120;
    fireEvent.scroll(cellArea);

    expect(scrollbarY.scrollTop).toBe(120);
  });

  it("adopts a native horizontal scroll, and the floating strip tracks it", () => {
    const { cellArea, scrollbarX, strip } = renderGrid();

    // Tabbing rightwards scrolls this axis too. The add-row strip is positioned
    // at `left: context.scrollLeft` to stay put visually while the area
    // scrolls, so a scrollLeft that context never learned about is exactly what
    // slides the strip off its anchor.
    cellArea.scrollLeft = 90;
    fireEvent.scroll(cellArea);

    expect(scrollbarX.scrollLeft).toBe(90);
    expect(strip.style.left).toBe("90px");
  });

  it("adopts both axes from a single scroll event", () => {
    const { cellArea, scrollbarX, scrollbarY } = renderGrid();

    // A diagonal scroll arrives as one event, so handling one axis per event
    // would leave the other stale for a frame.
    cellArea.scrollTop = 60;
    cellArea.scrollLeft = 45;
    fireEvent.scroll(cellArea);

    expect(scrollbarY.scrollTop).toBe(60);
    expect(scrollbarX.scrollLeft).toBe(45);
  });

  it("adopts a scroll back to the top", () => {
    const { cellArea, scrollbarY } = renderGrid();

    cellArea.scrollTop = 200;
    fireEvent.scroll(cellArea);
    expect(scrollbarY.scrollTop).toBe(200);

    // 0 is a real offset, not an absence of one. The guard compares strictly
    // for this reason — a `if (!scrollTop) return` shortcut would strand the
    // grid at the bottom after Shift+Tab walked focus back up to the top.
    cellArea.scrollTop = 0;
    fireEvent.scroll(cellArea);

    expect(scrollbarY.scrollTop).toBe(0);
  });

  it("leaves the offsets put when the same scroll fires repeatedly", () => {
    const { cellArea, scrollbarY } = renderGrid();

    // Redundant scroll events are normal — momentum, and the effect writing
    // context back onto the element. Repeats must be inert rather than
    // accumulating, which is what a handler that added to the offset instead of
    // replacing it would do.
    cellArea.scrollTop = 75;
    fireEvent.scroll(cellArea);
    fireEvent.scroll(cellArea);
    fireEvent.scroll(cellArea);

    expect(scrollbarY.scrollTop).toBe(75);
  });

  it("carries the adopted offset through to the row and column headers", () => {
    const { cellArea, rowHeader, colHeader } = renderGrid();

    // This is the blast radius of the fix, and the reason it is a grid-core
    // change rather than a tweak to one strip. Both headers slave their own
    // scroll offset to context, so a scroll context never learned about leaves
    // the row numbers and column letters sitting still while the cells move —
    // i.e. every header labels the wrong row or column. The add-row strip
    // overlapping cells was the symptom that got reported; this is the same
    // defect on the controls a user reads positions off.
    cellArea.scrollTop = 150;
    cellArea.scrollLeft = 70;
    fireEvent.scroll(cellArea);

    expect(rowHeader.scrollTop).toBe(150);
    expect(colHeader.scrollLeft).toBe(70);
  });

  it("still adopts the scroll when panes are frozen", () => {
    const { cellArea, scrollbarY } = renderGrid({ frozen: { type: "both" } });

    // Freezing splits what the headers compute off context (both read
    // `sheet?.frozen` alongside the offset), so it is the configuration most
    // likely to disagree with a newly-adopted raw offset. Asserting only that
    // adoption still happens — whether the frozen band lands on the right pixel
    // needs real layout, so it is an e2e check, not this.
    cellArea.scrollTop = 110;
    fireEvent.scroll(cellArea);

    expect(scrollbarY.scrollTop).toBe(110);
  });
});
