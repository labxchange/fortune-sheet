import _ from "lodash";
import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { updateCell, addSheet, locale } from "@fortune-sheet/core";
// @ts-ignore
import WorkbookContext from "../../context";
import SVGIcon from "../SVGIcon";
import "./index.css";
import SheetItem from "./SheetItem";
import ZoomControl from "../ZoomControl";
import { SHEET_LIST_ID } from "../SheetList";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import {
  activateOnEnterOrSpace,
  mouseDownToggleHandlers,
} from "../../utils/keyboardActivation";

const SheetTab: React.FC = () => {
  const { context, setContext, settings, refs } = useContext(WorkbookContext);
  const allSheetsRef = useRef<HTMLDivElement>(null);
  const tabContainerRef = useRef<HTMLDivElement>(null);
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const [isShowScrollBtn, setIsShowScrollBtn] = useState<boolean>(false);
  const [isShowBoundary, setIsShowBoundary] = useState<boolean>(true);
  const { info } = locale(context);

  useRovingFocus({
    containerRef: tabContainerRef,
    orientation: "horizontal",
    itemSelector: ".luckysheet-sheets-item",
  });

  const scrollDelta = 150;

  const scrollBy = useCallback((amount: number) => {
    if (
      tabContainerRef.current == null ||
      tabContainerRef.current.scrollLeft == null
    ) {
      return;
    }
    const { scrollLeft } = tabContainerRef.current;
    if (scrollLeft + amount <= 0) setIsShowBoundary(true);
    else if (scrollLeft > 0) setIsShowBoundary(false);

    tabContainerRef.current?.scrollBy({
      left: amount,
      behavior: "smooth",
    });
  }, []);

  useEffect(() => {
    const tabCurrent = tabContainerRef.current;
    if (!tabCurrent) return;
    setIsShowScrollBtn(tabCurrent!.scrollWidth - 2 > tabCurrent!.clientWidth);
  }, [context.luckysheetfile]);

  const onAddSheetClick = useCallback(
    () =>
      setTimeout(() => {
        setContext(
          (draftCtx) => {
            if (draftCtx.luckysheetCellUpdate.length > 0) {
              updateCell(
                draftCtx,
                draftCtx.luckysheetCellUpdate[0],
                draftCtx.luckysheetCellUpdate[1],
                refs.cellInput.current!
              );
            }
            addSheet(draftCtx, settings);
          },
          { addSheetOp: true }
        );
        const tabCurrent = tabContainerRef.current;
        setIsShowScrollBtn(tabCurrent!.scrollWidth > tabCurrent!.clientWidth);
      }),
    [refs.cellInput, setContext, settings]
  );

  return (
    <div
      className="luckysheet-sheet-area luckysheet-noselected-text"
      onContextMenu={(e) => e.preventDefault()}
      id="luckysheet-sheet-area"
    >
      {/*
        A landmark, so the sheet switcher can be jumped to from a screen
        reader's landmark list (WCAG 1.3.1). Every other region of the chrome
        was already one — banner for the toolbar, complementary for the formula
        bar and the zoom control, main for the grid — leaving this strip the
        one set of controls reachable only by walking there.

        `region` rather than `nav`: the strip is not purely navigation, since
        the add-sheet button creates something rather than going anywhere. A
        region counts as a landmark only while it has an accessible name, so
        the label below is load-bearing, not decoration.

        On this element rather than its parent: the parent also holds
        ZoomControl, whose own `complementary` would then nest inside a region
        named for the sheet tabs.
      */}
      <div
        id="luckysheet-sheet-content"
        role="region"
        aria-label={info.sheetTabs}
      >
        {context.allowEdit && (
          <div
            className="fortune-sheettab-button"
            onClick={onAddSheetClick}
            onKeyDown={activateOnEnterOrSpace}
            tabIndex={0}
            aria-label={info.newSheet}
            role="button"
          >
            <SVGIcon name="plus" width={16} height={16} />
          </div>
        )}
        {context.allowEdit && (
          <div className="sheet-list-container">
            <div
              id="all-sheets"
              className="fortune-sheettab-button"
              ref={allSheetsRef}
              role="button"
              tabIndex={0}
              aria-label={info.allSheets}
              aria-haspopup
              aria-expanded={!!context.showSheetList}
              // Completes the pairing this button already half had, and is what
              // lets `isWithinPopup` recognise it as part of the sheet list
              // rather than as somewhere outside it — without which Shift+Tab
              // onto this button closes the list and the next Enter reopens it.
              // Only while open: an `aria-controls` naming an element that is
              // not in the document is itself a defect.
              aria-controls={context.showSheetList ? SHEET_LIST_ID : undefined}
              {...mouseDownToggleHandlers(() => {
                setContext((ctx) => {
                  ctx.showSheetList = _.isUndefined(ctx.showSheetList)
                    ? true
                    : !ctx.showSheetList;
                  ctx.sheetTabContextMenu = {};
                });
              })}
            >
              <SVGIcon name="all-sheets" width={16} height={16} />
            </div>
          </div>
        )}
        <div
          id="luckysheet-sheets-m"
          className="luckysheet-sheets-m lucky-button-custom"
        >
          <i className="iconfont luckysheet-iconfont-caidan2" />
        </div>
        <div
          className="fortune-sheettab-container"
          id="fortune-sheettab-container"
        >
          {!isShowBoundary && <div className="boundary boundary-left" />}
          <div
            className="fortune-sheettab-container-c"
            id="fortune-sheettab-container-c"
            ref={tabContainerRef}
            // Completes the manual-activation tabs pattern the arrow-key
            // navigation already implements: without tablist/tab/aria-selected
            // a screen reader heard the tab text and nothing else — no "tab",
            // no position, no selected state.
            role="tablist"
            aria-label={info.allSheets}
          >
            {_.sortBy(context.luckysheetfile, (s) => Number(s.order)).map(
              (sheet) => {
                return <SheetItem key={sheet.id} sheet={sheet} />;
              }
            )}
            {/* <SheetItem
              isDropPlaceholder
              sheet={{ name: "", id: "drop-placeholder" }}
            /> */}
          </div>
          {isShowBoundary && isShowScrollBtn && (
            <div className="boundary boundary-right" />
          )}
        </div>
        {isShowScrollBtn && (
          <div
            id="fortune-sheettab-leftscroll"
            className="fortune-sheettab-scroll"
            ref={leftScrollRef}
            onClick={() => {
              scrollBy(-scrollDelta);
            }}
            onKeyDown={activateOnEnterOrSpace}
            tabIndex={0}
            role="button"
            aria-label={info.scrollLeft}
          >
            <SVGIcon name="arrow-doubleleft" width={12} height={12} />
          </div>
        )}
        {isShowScrollBtn && (
          <div
            id="fortune-sheettab-rightscroll"
            className="fortune-sheettab-scroll"
            ref={rightScrollRef}
            onClick={() => {
              scrollBy(scrollDelta);
            }}
            onKeyDown={activateOnEnterOrSpace}
            tabIndex={0}
            role="button"
            aria-label={info.scrollRight}
          >
            <SVGIcon name="arrow-doubleright" width={12} height={12} />
          </div>
        )}
      </div>
      <div className="fortune-sheet-area-right">
        <ZoomControl />
      </div>
    </div>
  );
};

export default SheetTab;
