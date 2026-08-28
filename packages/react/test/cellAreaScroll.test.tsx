import { render, fireEvent } from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";

/**
 * `.fortune-cell-area` is `overflow: hidden` with a fixed size, which still
 * makes it a scroll container: gestures are blocked, but the browser scrolls it
 * natively to bring a focused element into view, and both the add-row controls
 * and the cell input live inside it.
 *
 * That native scroll must not become the sheet's scroll position, and it must
 * not be left in place either. The canvas paints from `context.scrollTop` while
 * every DOM overlay is positioned in unscrolled container coordinates, so the
 * two only agree while the element's own offset equals the context's — leaving
 * a native scroll in place slides the add-row strip, the selection outline and
 * the cell input off their cells, and adopting it into context runs a producer
 * from inside a scroll event, which is emitted mid-commit (confirming an edit
 * moves focus to the next cell's input, and the browser scrolls to reveal it)
 * and drops the pending edit. So the handler snaps the element back and changes
 * no state.
 *
 * These cases cover the grid's core scroll path, not just the strip, because
 * that is the blast radius: the headers and both scrollbars all slave their
 * offsets to context.
 *
 * Deliberately NOT asserted here, because jsdom cannot show it and asserting it
 * would be theatre:
 *   - The trigger itself. jsdom has no layout, so it never clamps `scrollTop`
 *     and never scrolls an ancestor to reveal a focused element; the native
 *     scroll has to be simulated by assigning and firing `scroll`.
 *   - That a cell edit survives a native scroll landing on the commit. That
 *     needs a real browser: it is covered by the e2e that caught the
 *     regression, `practicing-imputation-methods` Protocol 4.C/4.D.
 *   - Geometry (does the strip clear the last row) and computed colour, which
 *     need real layout and real CSS.
 */
describe("Cell area native scroll", () => {
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

  it("refuses a native vertical scroll and snaps the element back", () => {
    const { cellArea, scrollbarY } = renderGrid();

    // The scrollbar is driven off `context.scrollTop`, so it staying at 0 is the
    // observable proof that context did not take the offset. The element
    // returning to 0 is the other half: an offset left in place is what slid
    // the overlays off their cells.
    cellArea.scrollTop = 120;
    fireEvent.scroll(cellArea);

    expect(scrollbarY.scrollTop).toBe(0);
    expect(cellArea.scrollTop).toBe(0);
  });

  it("refuses a native horizontal scroll, and the strip keeps its anchor", () => {
    const { cellArea, scrollbarX, strip } = renderGrid();

    // Tabbing rightwards scrolls this axis too. The strip is positioned at
    // `left: context.scrollLeft` to stay put visually while the area scrolls,
    // so a scrollLeft context never learned about is exactly what slides it off
    // its anchor.
    cellArea.scrollLeft = 90;
    fireEvent.scroll(cellArea);

    expect(scrollbarX.scrollLeft).toBe(0);
    expect(cellArea.scrollLeft).toBe(0);
    expect(strip.style.left).toBe("0px");
  });

  it("refuses both axes from a single scroll event", () => {
    const { cellArea, scrollbarX, scrollbarY } = renderGrid();

    // A diagonal scroll arrives as one event, so handling one axis per event
    // would strand the other.
    cellArea.scrollTop = 60;
    cellArea.scrollLeft = 45;
    fireEvent.scroll(cellArea);

    expect(scrollbarY.scrollTop).toBe(0);
    expect(scrollbarX.scrollLeft).toBe(0);
    expect(cellArea.scrollTop).toBe(0);
    expect(cellArea.scrollLeft).toBe(0);
  });

  it("still lets a scroll that came through context reach the element", () => {
    const { cellArea, scrollbarY } = renderGrid();

    // The scroll a user asks for arrives on the scrollbar, which writes it into
    // context; the context -> DOM effect then puts it on the cell area. The
    // snap-back must compare equal there and leave it alone — otherwise the
    // grid could not scroll at all.
    scrollbarY.scrollTop = 120;
    fireEvent.scroll(scrollbarY);

    expect(cellArea.scrollTop).toBe(120);

    // And a native scroll away from that offset is still refused, rather than
    // the handler only defending offset 0.
    cellArea.scrollTop = 260;
    fireEvent.scroll(cellArea);

    expect(scrollbarY.scrollTop).toBe(120);
    expect(cellArea.scrollTop).toBe(120);
  });

  it("stays inert when the same scroll fires repeatedly", () => {
    const { cellArea, scrollbarY } = renderGrid();

    // Snapping back re-fires `scroll`, and momentum fires it too. Repeats must
    // compare equal and stop rather than accumulate.
    cellArea.scrollTop = 75;
    fireEvent.scroll(cellArea);
    fireEvent.scroll(cellArea);
    fireEvent.scroll(cellArea);

    expect(scrollbarY.scrollTop).toBe(0);
    expect(cellArea.scrollTop).toBe(0);
  });

  it("leaves the row and column headers where context put them", () => {
    const { cellArea, rowHeader, colHeader } = renderGrid();

    // This is the blast radius, and the reason this is a grid-core change
    // rather than a tweak to one strip. Both headers slave their offset to
    // context, so a native scroll that reached context would move the row
    // numbers and column letters relative to the cells they label.
    cellArea.scrollTop = 150;
    cellArea.scrollLeft = 70;
    fireEvent.scroll(cellArea);

    expect(rowHeader.scrollTop).toBe(0);
    expect(colHeader.scrollLeft).toBe(0);
  });

  it("refuses the scroll when panes are frozen", () => {
    const { cellArea, scrollbarY } = renderGrid({ frozen: { type: "both" } });

    // Freezing splits what the headers compute off context (both read
    // `sheet?.frozen` alongside the offset), so it is the configuration most
    // likely to disagree with a raw offset arriving from the element.
    cellArea.scrollTop = 110;
    fireEvent.scroll(cellArea);

    expect(scrollbarY.scrollTop).toBe(0);
    expect(cellArea.scrollTop).toBe(0);
  });
});
