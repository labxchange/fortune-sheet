import React, { useContext, useEffect, useLayoutEffect, useState } from "react";
import { indexToColumnChar, locale, replaceHtml } from "@fortune-sheet/core";
import WorkbookContext from "../../../context";
import "./index.css";

type Props = {
  axis: "x" | "y";
  /** id of the cell area this scrolls, for `aria-controls`. */
  controls?: string;
};

/**
 * What an arrow key falls back to when there is no row or column grid to step
 * along — an empty sheet, or a layout pass that has not run yet.
 */
const FALLBACK_STEP = 40;

/**
 * The next row or column boundary past `from`, so an arrow key lands on a cell
 * edge rather than part-way across one.
 *
 * A fixed pixel step was the obvious alternative and is what a browser's own
 * scrollbar does, but a spreadsheet has a natural unit and 40px is not it: at
 * the default sizes it is two rows down and half a column across. `edges` are
 * the cumulative row bottoms / column rights `Context` keeps, in the same
 * coordinate space as the scroll offset, so they carry zoom and per-row heights
 * for free.
 */
const stepTo = (
  edges: number[] | undefined,
  from: number,
  forward: boolean
) => {
  if (!edges?.length) return from + (forward ? FALLBACK_STEP : -FALLBACK_STEP);
  // Binary search, not a scan: these are the cumulative edges of every row or
  // column in the sheet, and this runs on the keydown path. A linear walk is
  // 100k comparisons per arrow press near the bottom of a large sheet.
  let lo = 0;
  let hi = edges.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (edges[mid] > from) hi = mid;
    else lo = mid + 1;
  }
  // `lo` is the first edge strictly past `from`.
  if (forward) return lo < edges.length ? edges[lo] : from + FALLBACK_STEP;
  // Walking back: the last edge strictly before `from`, or the start.
  let prev = lo - 1;
  while (prev >= 0 && edges[prev] >= from) prev -= 1;
  return prev >= 0 ? edges[prev] : 0;
};

/** The zero-based row or column the given offset sits in, for `aria-valuetext`. */
const indexAtOffset = (edges: number[] | undefined, offset: number) => {
  if (!edges?.length) return null;
  let lo = 0;
  let hi = edges.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (edges[mid] > offset) hi = mid;
    else lo = mid + 1;
  }
  return Math.min(lo, edges.length - 1);
};

/**
 * The sheet's horizontal and vertical scroll controls.
 *
 * They were bare scrollable divs. Chrome makes any scrollable container
 * focusable, so each already took a focus stop — announced as "group", with no
 * name, no position, and no key that did anything (WCAG 4.1.2, 2.1.1). They are
 * now declared scrollbars with value state and keys.
 *
 * The ARIA goes on the scroll container itself rather than on a wrapper around
 * it: `SheetOverlay` reads and writes `refs.scrollbarX/Y.current.scrollLeft`
 * and `.scrollTop` directly in half a dozen places (wheel, touch, drag-select
 * auto-scroll), and the consuming simulations' end-to-end tests drive the same
 * element. Wrapping it would mean rewriting all of that and hand-building a
 * thumb, for no accessibility gain.
 */
const ScrollBar: React.FC<Props> = ({ axis, controls }) => {
  const { context, refs, setContext } = useContext(WorkbookContext);
  const { info } = locale(context);
  const horizontal = axis === "x";
  const ref = horizontal ? refs.scrollbarX : refs.scrollbarY;

  useEffect(() => {
    if (horizontal) {
      refs.scrollbarX.current!.scrollLeft = context.scrollLeft;
    } else {
      refs.scrollbarY.current!.scrollTop = context.scrollTop;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horizontal ? context.scrollLeft : context.scrollTop]);

  // The content extent against the viewport, both of which `Context` already
  // recomputes on every layout pass. An axis whose content fits collapses to
  // `min === max`, which says "nothing to scroll" rather than inventing a range.
  const viewport = horizontal ? context.cellmainWidth : context.cellmainHeight;
  const content = horizontal ? context.ch_width : context.rh_height;
  const geometryMax = Math.max(0, Math.round(content - viewport));
  const valueNowRaw = Math.max(
    0,
    Math.round(horizontal ? context.scrollLeft : context.scrollTop)
  );

  // ...except that the strip is not exactly the viewport it stands for: the
  // vertical one runs the full height of the row body, some 20px taller than
  // the cell area, so `rh_height - cellmainHeight` overstates by that much and
  // the value would report a maximum the user can never reach. The element's
  // own extent is the honest figure where there is one to read.
  const [measuredMax, setMeasuredMax] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const extent = horizontal
        ? el.scrollWidth - el.clientWidth
        : el.scrollHeight - el.clientHeight;
      // Zero is ambiguous — an axis that genuinely does not overflow reads the
      // same as one the browser has not laid out yet, and as anything running
      // without layout at all — so it defers to the computed geometry rather
      // than asserting there is nothing to scroll.
      setMeasuredMax(extent > 0 ? extent : null);
    };
    measure();
    // `Context` only recomputes the viewport on a *window* resize, so a
    // container-driven one — a flex parent, the toolbar row being toggled,
    // fullscreen — changes the strip's height while every value this effect is
    // keyed on stays put, leaving `aria-valuemax` and the End target on the
    // pre-resize figure. Guarded because jsdom has no ResizeObserver.
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horizontal, content, viewport]);

  const valueMax = measuredMax ?? geometryMax;

  const positionIndex = indexAtOffset(
    horizontal ? context.visibledatacolumn : context.visibledatarow,
    valueNowRaw
  );
  // Columns are lettered and rows are numbered — a spreadsheet's own naming,
  // and what the name box and every formula use. "Column 3" would be a
  // coordinate the user never sees anywhere else in the sheet.
  const valueText =
    positionIndex == null
      ? undefined
      : replaceHtml(
          horizontal ? info.scrollbarColumnPosition : info.scrollbarRowPosition,
          {
            index: horizontal
              ? indexToColumnChar(positionIndex)
              : positionIndex + 1,
          }
        );
  const valueNow = Math.min(valueMax, valueNowRaw);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    // Bare keys only. `e.key === "PageDown"` is just as true for Ctrl+PageDown,
    // so without this the handler swallowed the browser's own tab-switch, and
    // took Ctrl+Home / Shift+Home away from the grid's shortcuts — while
    // scrolling, which is not what any of them mean.
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const current = horizontal ? el.scrollLeft : el.scrollTop;

    const edges = horizontal
      ? context.visibledatacolumn
      : context.visibledatarow;

    let next: number | null = null;
    if (e.key === (horizontal ? "ArrowLeft" : "ArrowUp")) {
      next = stepTo(edges, current, false);
    } else if (e.key === (horizontal ? "ArrowRight" : "ArrowDown")) {
      next = stepTo(edges, current, true);
    } else if (e.key === "PageUp") {
      next = current - viewport;
    } else if (e.key === "PageDown") {
      next = current + viewport;
    } else if (e.key === "Home") {
      next = 0;
    } else if (e.key === "End") {
      next = valueMax;
    }
    // Everything else — the off-axis arrows included — is left alone, so a
    // scrollbar never swallows a key it does not act on.
    if (next === null) return;

    e.preventDefault();
    // The grid's global handler is what moves the cell cursor and runs the
    // region shortcuts. A Home that both scrolled and jumped the cursor would
    // be worse than either alone, so a key this handles stops here — the same
    // reason `activateOnEnterOrSpace` stops propagation.
    e.stopPropagation();

    // Written to the DOM, not to `Context`: the effect above syncs `Context`
    // onto the element, so a direct `setContext` would leave the two fighting
    // over the offset. Going through the element also hands the browser the
    // clamping, which is how the bounds are held without arithmetic here.
    if (horizontal) {
      el.scrollLeft = next;
    } else {
      el.scrollTop = next;
    }
  };

  return (
    <div
      ref={ref}
      role="scrollbar"
      tabIndex={0}
      aria-label={
        horizontal ? info.horizontalScrollbar : info.verticalScrollbar
      }
      aria-orientation={horizontal ? "horizontal" : "vertical"}
      aria-controls={controls}
      aria-valuenow={valueNow}
      aria-valuemin={0}
      aria-valuemax={valueMax}
      // Without this a screen reader reads the raw offset — "120", or "17
      // percent" — which tells a user nothing about where they are in a
      // spreadsheet. The row or column under the offset does.
      aria-valuetext={valueText}
      style={
        horizontal
          ? {
              left: context.rowHeaderWidth,
              width: `calc(100% - ${context.rowHeaderWidth}px)`,
            }
          : { height: "100%" }
      }
      className={`luckysheet-scrollbars luckysheet-scrollbar-ltr luckysheet-scrollbar-${axis}`}
      onKeyDown={onKeyDown}
      onScroll={() => {
        if (horizontal) {
          setContext((draftCtx) => {
            draftCtx.scrollLeft = refs.scrollbarX.current!.scrollLeft;
          });
        } else {
          setContext((draftCtx) => {
            draftCtx.scrollTop = refs.scrollbarY.current!.scrollTop;
          });
        }
      }}
    >
      <div
        style={
          horizontal
            ? { width: context.ch_width, height: 10 }
            : { width: 10, height: context.rh_height }
        }
      />
    </div>
  );
};

export default ScrollBar;
