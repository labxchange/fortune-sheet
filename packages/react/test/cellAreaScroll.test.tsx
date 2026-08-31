import { render, fireEvent } from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";

/**
 * `.fortune-cell-area` is `overflow: hidden` with a fixed size, which still
 * makes it a scroll container: gestures are blocked, but the browser scrolls it
 * natively anyway, and both the add-row controls and the cell input live inside
 * it.
 *
 * That native scroll must not become the sheet's scroll position, and it must
 * not be left in place either. The canvas paints from `context.scrollTop` while
 * every DOM overlay is positioned in unscrolled container coordinates, so the
 * two only agree while the element's own offset equals the context's — leaving
 * a native scroll in place slides the add-row strip, the selection outline and
 * the cell input off their cells, and adopting it into context runs a producer
 * from inside a scroll event, which lands mid-commit and drops the pending edit
 * (established by the tarball diff and the red/green e2e; the browser's exact
 * reason for scrolling mid-commit is not pinned down, but is not a focus reveal
 * — no `focus()` fires during that commit). So the scroll handler snaps the
 * element back and changes no state.
 *
 * The one native scroll that was legitimate — the browser revealing a focused
 * control below the last row — is redone as a context scroll off the focus
 * event, so refusing every element-originated scroll does not strand keyboard
 * focus off-screen (WCAG 2.4.7).
 *
 * These cases cover the grid's core scroll path, not just the strip, because
 * that is the blast radius: the headers and both scrollbars all slave their
 * offsets to context.
 *
 * Deliberately NOT asserted here, because jsdom cannot show it and asserting it
 * would be theatre:
 *   - The scroll trigger itself. jsdom has no layout, so it never clamps
 *     `scrollTop` and never scrolls an ancestor natively; the native scroll has
 *     to be simulated by assigning and firing `scroll`, and the focus-reveal
 *     geometry has to be stubbed onto the elements.
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

  // jsdom has no layout: `getBoundingClientRect` is all zeros and `clientHeight`
  // /`clientWidth` are 0. Stand in the geometry so the focus-reveal math has
  // something to read. `viewport` fixes the visible box at the container's
  // origin; `place` positions a focus target in that same coordinate space.
  const rect = (
    top: number,
    left: number,
    width: number,
    height: number
  ): DOMRect => ({
    top,
    left,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON() {},
  });

  const viewport = (
    el: HTMLElement,
    { width, height }: { width: number; height: number }
  ) => {
    Object.defineProperty(el, "clientHeight", {
      value: height,
      configurable: true,
    });
    Object.defineProperty(el, "clientWidth", {
      value: width,
      configurable: true,
    });
    el.getBoundingClientRect = () => rect(0, 0, width, height);
  };

  const placeControl = (
    parent: HTMLElement,
    box: { top: number; left: number; width: number; height: number }
  ) => {
    const control = document.createElement("button");
    control.getBoundingClientRect = () =>
      rect(box.top, box.left, box.width, box.height);
    parent.appendChild(control);
    return control;
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

  it("reveals a focused control below the fold by scrolling context", () => {
    const { cellArea, scrollbarY } = renderGrid();

    // A 400px-tall viewport with a control 1200px down, entirely below the
    // fold — the add-row strip that Shift+Tab lands on.
    viewport(cellArea, { width: 900, height: 400 });
    const control = placeControl(cellArea, {
      top: 1200,
      left: 0,
      width: 100,
      height: 20,
    });

    fireEvent.focusIn(control);

    // The reveal goes through context (the scrollbar tracks context), not by
    // leaving a native offset on the element: 1220 - 400 = 820. That the canvas
    // repaints to match is exactly what a raw element scroll could not do.
    expect(scrollbarY.scrollTop).toBe(820);
    expect(cellArea.scrollTop).toBe(820);
  });

  it("reveals a focused control clipped to the right by scrolling context", () => {
    const { cellArea, scrollbarX } = renderGrid();

    viewport(cellArea, { width: 900, height: 400 });
    const control = placeControl(cellArea, {
      top: 10,
      left: 1000,
      width: 100,
      height: 20,
    });

    fireEvent.focusIn(control);

    // 1100 - 900 = 200 on the horizontal axis; the vertical axis is untouched.
    expect(scrollbarX.scrollLeft).toBe(200);
  });

  it("leaves context alone when the focused element is already visible", () => {
    const { cellArea, scrollbarX, scrollbarY } = renderGrid();

    viewport(cellArea, { width: 900, height: 400 });
    const control = placeControl(cellArea, {
      top: 100,
      left: 100,
      width: 100,
      height: 20,
    });

    fireEvent.focusIn(control);

    // Fully inside the box, so no reveal — otherwise focusing the active cell
    // input during normal editing would jog the sheet.
    expect(scrollbarY.scrollTop).toBe(0);
    expect(scrollbarX.scrollLeft).toBe(0);
    expect(cellArea.scrollTop).toBe(0);
    expect(cellArea.scrollLeft).toBe(0);
  });
});
