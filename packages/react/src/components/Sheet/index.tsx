import React, {
  useRef,
  useEffect,
  useLayoutEffect,
  useContext,
  useCallback,
} from "react";
import {
  Canvas,
  updateContextWithCanvas,
  updateContextWithSheetData,
  handleGlobalWheel,
  shouldCancelGlobalWheel,
  initFreeze,
  Sheet as SheetType,
} from "@fortune-sheet/core";
import "./index.css";
import WorkbookContext from "../../context";
import SheetOverlay from "../SheetOverlay";

type Props = {
  sheet: SheetType;
};

const Sheet: React.FC<Props> = ({ sheet }) => {
  const { data } = sheet;
  // const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const placeholderRef = useRef<HTMLDivElement>(null);
  const { context, setContext, refs, settings } = useContext(WorkbookContext);

  /**
   * Update data on window resize
   */
  useEffect(() => {
    function resize() {
      if (!data) return;
      setContext((draftCtx) => {
        if (settings.devicePixelRatio === 0) {
          draftCtx.devicePixelRatio = (
            typeof globalThis !== "undefined" ? globalThis : window
          ).devicePixelRatio;
        }
        updateContextWithSheetData(draftCtx, data);
        updateContextWithCanvas(
          draftCtx,
          refs.canvas.current!,
          placeholderRef.current!
        );
      });
    }
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
    };
  }, [data, refs.canvas, setContext, settings.devicePixelRatio]);

  /**
   * Recalculate row/col info when data changes
   */
  useEffect(() => {
    if (!data) return;
    setContext((draftCtx) => updateContextWithSheetData(draftCtx, data));
  }, [
    context.config?.rowlen,
    context.config?.columnlen,
    context.config?.rowhidden,
    context.config.colhidden,
    data,
    context.zoomRatio,
    setContext,
  ]);

  /**
   * Init canvas
   */
  useEffect(() => {
    setContext((draftCtx) =>
      updateContextWithCanvas(
        draftCtx,
        refs.canvas.current!,
        placeholderRef.current!
      )
    );
  }, [
    refs.canvas,
    setContext,
    context.rowHeaderWidth,
    context.columnHeaderHeight,
    context.devicePixelRatio,
  ]);

  /**
   * Recalculate freeze data when sheet changes or sheet.frozen changes
   * should be defined before redraw
   */
  useEffect(() => {
    initFreeze(context, refs.globalCache, context.currentSheetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    refs.globalCache,
    sheet.frozen,
    context.currentSheetId,
    context.visibledatacolumn,
    context.visibledatarow,
  ]);

  /**
   * Redraw canvas When context changes
   * All context changes will trigger this
   */
  useEffect(() => {
    // update formula chains value first if not empty
    if (context.groupValuesRefreshData.length > 0) {
      // wait for it to be refreshed
      return;
    }

    const tableCanvas = new Canvas(refs.canvas.current!, context);
    if (tableCanvas == null) return;
    const freeze = refs.globalCache.freezen?.[sheet.id!];
    if (
      freeze?.horizontal?.freezenhorizontaldata ||
      freeze?.vertical?.freezenverticaldata
    ) {
      // with frozen
      const horizontalData = freeze?.horizontal?.freezenhorizontaldata;
      const verticallData = freeze?.vertical?.freezenverticaldata;
      if (horizontalData && verticallData) {
        const [horizontalPx, , horizontalScrollTop] = horizontalData;
        const [verticalPx, , verticalScrollWidth] = verticallData;
        // main
        tableCanvas.drawMain({
          scrollWidth: context.scrollLeft + verticalPx - verticalScrollWidth,
          scrollHeight: context.scrollTop + horizontalPx - horizontalScrollTop,
          offsetLeft: verticalPx - verticalScrollWidth + context.rowHeaderWidth,
          offsetTop:
            horizontalPx - horizontalScrollTop + context.columnHeaderHeight,
          clear: true,
        });
        // right top
        tableCanvas.drawMain({
          scrollWidth: context.scrollLeft + verticalPx - verticalScrollWidth,
          scrollHeight: horizontalScrollTop,
          drawHeight: horizontalPx,
          offsetLeft: verticalPx - verticalScrollWidth + context.rowHeaderWidth,
        });
        // left down
        tableCanvas.drawMain({
          scrollWidth: verticalScrollWidth,
          scrollHeight: context.scrollTop + horizontalPx - horizontalScrollTop,
          drawWidth: verticalPx,
          offsetTop:
            horizontalPx - horizontalScrollTop + context.columnHeaderHeight,
        });
        // left top
        tableCanvas.drawMain({
          scrollWidth: verticalScrollWidth,
          scrollHeight: horizontalScrollTop,
          drawWidth: verticalPx,
          drawHeight: horizontalPx,
        });
        // headers
        tableCanvas.drawColumnHeader(
          context.scrollLeft + verticalPx - verticalScrollWidth,
          undefined,
          verticalPx - verticalScrollWidth + context.rowHeaderWidth
        );
        tableCanvas.drawColumnHeader(verticalScrollWidth, verticalPx);
        tableCanvas.drawRowHeader(
          context.scrollTop + horizontalPx - horizontalScrollTop,
          undefined,
          horizontalPx - horizontalScrollTop + context.columnHeaderHeight
        );
        tableCanvas.drawRowHeader(horizontalScrollTop, horizontalPx);
        tableCanvas.drawFreezeLine({
          horizontalTop:
            horizontalPx - horizontalScrollTop + context.columnHeaderHeight - 2,
          verticalLeft:
            verticalPx - verticalScrollWidth + context.rowHeaderWidth - 2,
        });
      } else if (horizontalData) {
        const [horizontalPx, , horizontalScrollTop] = horizontalData;
        // main
        tableCanvas.drawMain({
          scrollWidth: context.scrollLeft,
          scrollHeight: context.scrollTop + horizontalPx - horizontalScrollTop,
          offsetTop:
            horizontalPx - horizontalScrollTop + context.columnHeaderHeight,
          clear: true,
        });
        // top
        tableCanvas.drawMain({
          scrollWidth: context.scrollLeft,
          scrollHeight: horizontalScrollTop,
          drawHeight: horizontalPx,
        });
        // headers
        tableCanvas.drawColumnHeader(context.scrollLeft);
        tableCanvas.drawRowHeader(
          context.scrollTop + horizontalPx - horizontalScrollTop,
          undefined,
          horizontalPx - horizontalScrollTop + context.columnHeaderHeight
        );
        tableCanvas.drawRowHeader(horizontalScrollTop, horizontalPx);
        tableCanvas.drawFreezeLine({
          horizontalTop:
            horizontalPx - horizontalScrollTop + context.columnHeaderHeight - 2,
        });
      } else if (verticallData) {
        const [verticalPx, , verticalScrollWidth] = verticallData;
        // main
        tableCanvas.drawMain({
          scrollWidth: context.scrollLeft + verticalPx - verticalScrollWidth,
          scrollHeight: context.scrollTop,
          offsetLeft: verticalPx - verticalScrollWidth + context.rowHeaderWidth,
        });
        // left
        tableCanvas.drawMain({
          scrollWidth: verticalScrollWidth,
          scrollHeight: context.scrollTop,
          drawWidth: verticalPx,
        });
        // headers
        tableCanvas.drawRowHeader(context.scrollTop);
        tableCanvas.drawColumnHeader(
          context.scrollLeft + verticalPx - verticalScrollWidth,
          undefined,
          verticalPx - verticalScrollWidth + context.rowHeaderWidth
        );
        tableCanvas.drawColumnHeader(verticalScrollWidth, verticalPx);
        tableCanvas.drawFreezeLine({
          verticalLeft:
            verticalPx - verticalScrollWidth + context.rowHeaderWidth - 2,
        });
      }
    } else {
      // without frozen
      tableCanvas.drawMain({
        scrollWidth: context.scrollLeft,
        scrollHeight: context.scrollTop,
        clear: true,
      });
      tableCanvas.drawColumnHeader(context.scrollLeft);
      tableCanvas.drawRowHeader(context.scrollTop);
    }
  }, [context, refs.canvas, refs.globalCache.freezen, setContext, sheet.id]);

  // Read synchronously by onWheel below, which cannot reach `context` without
  // taking it as a dependency — and that would rebind the wheel listener on
  // every scroll, since scrolling is itself a context change.
  //
  // Only the two the *cancel* decision needs. `filterContextMenu` is the other
  // half of shouldSkipGlobalWheel, but that one is asked from inside the
  // recipe, which is handed the real context; mirroring it here would be state
  // nothing reads.
  const wheelGuard = useRef({
    showSearch: context.showSearch,
    showReplace: context.showReplace,
  });

  // Written in a layout effect rather than in the component body: a ref write
  // during render is a render-phase side effect, so a render that is discarded
  // — interrupted, replayed under a concurrent update, double-invoked by
  // StrictMode — still mutates it, and the guard would then answer for a
  // context that was never committed.
  //
  // A layout effect and not useEffect because this ref is read from a native
  // event handler. Layout effects flush synchronously with the commit, before
  // the browser can dispatch the next wheel event; passive effects are
  // deferred past paint, which would leave a frame in which the guard is one
  // render stale. Fields are assigned in place so the steady state allocates
  // nothing.
  useLayoutEffect(() => {
    wheelGuard.current.showSearch = context.showSearch;
    wheelGuard.current.showReplace = context.showReplace;
  });

  const onWheel = useCallback(
    (e: WheelEvent) => {
      // Cancelling the gesture has to happen here, not inside the recipe
      // below. setContext hands its recipe to React as a state updater, and
      // React only runs an updater eagerly while the fiber has no pending
      // work — during a continuous gesture it usually has, so the recipe runs
      // in the render pass instead, long after this event finished
      // dispatching. A preventDefault that late is ignored, and the browser
      // scrolls whatever is under the cursor on top of the grid scrolling
      // itself.
      //
      // Gated on shouldCancelGlobalWheel rather than on the recipe's own
      // shouldSkipGlobalWheel: the two agree only over the search dialog,
      // whose results list is asking for the browser's scrolling. A gesture
      // over the grid while a filter menu is open is one the grid declines to
      // scroll but still cancels, as it did before this branch, so it does not
      // fall through to whatever contains an embedded workbook.
      if (shouldCancelGlobalWheel(wheelGuard.current, refs.globalCache)) {
        e.preventDefault();
      }
      setContext((draftCtx) => {
        handleGlobalWheel(
          draftCtx,
          e,
          refs.globalCache,
          refs.scrollbarX.current!,
          refs.scrollbarY.current!
        );
      });
    },
    [refs.globalCache, refs.scrollbarX, refs.scrollbarY, setContext]
  );

  /**
   * Bind wheel event.
   * Note: cannot use onWheel directly on the container because it behaves strange
   */
  useEffect(() => {
    const container = containerRef.current;
    container?.addEventListener("wheel", onWheel);
    return () => {
      container?.removeEventListener("wheel", onWheel);
    };
  }, [onWheel]);

  return (
    <div ref={containerRef} className="fortune-sheet-container">
      {/* this is a placeholder div to help measure the empty space between toolbar and footer, directly measuring the canvas element is inaccurate, don't know why */}
      <div ref={placeholderRef} className="fortune-sheet-canvas-placeholder" />
      <canvas
        className="fortune-sheet-canvas"
        ref={refs.canvas}
        aria-hidden="true"
      />
      <SheetOverlay />
    </div>
  );
};

export default Sheet;
