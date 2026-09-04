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
import { useRovingFocus } from "../../hooks/useRovingFocus";
import { useSheetSwitchAnnouncement } from "../../hooks/useSheetSwitchAnnouncement";
import { useSheetTabMoveAnnouncement } from "../../hooks/useSheetTabMoveAnnouncement";
import { useSheetTabColorAnnouncement } from "../../hooks/useSheetTabColorAnnouncement";
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
  const sheetSwitchAnnouncement = useSheetSwitchAnnouncement(context, info);
  const sheetMoveAnnouncement = useSheetTabMoveAnnouncement(context, info);
  const sheetColorAnnouncement = useSheetTabColorAnnouncement(context, info);

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
      <div id="luckysheet-sheet-content">
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
      {/* Sheet tab actions have no other feedback a screen reader picks up:
          the dropdown and Alt+Arrow shortcut switch sheets without moving
          focus onto the new tab, and Move left/right and tab colour are
          silent, visual-only changes. Polite, since none of these compete
          with an in-progress alert the way the grid's own selection does.

          These live with the controls they describe, which means they ride on
          `showSheetTabs` along with the rest of this bar. Move and colour are
          only reachable from the tabs, so that is right for them; the Alt+Arrow
          switch shortcut also works from the grid, so with the bar hidden a
          switch is unannounced again. Hoisting a region into `Workbook` for
          that one case would put it outside the component that owns the state
          it reports, so it stays here until a workbook that hides its tabs and
          still switches sheets by shortcut is a case someone has. */}
      <div id="sr-sheetSwitch" className="sr-only" role="status">
        {sheetSwitchAnnouncement}
      </div>
      <div id="sr-sheetMove" className="sr-only" role="status">
        {sheetMoveAnnouncement}
      </div>
      <div id="sr-sheetColor" className="sr-only" role="status">
        {sheetColorAnnouncement}
      </div>
      <div className="fortune-sheet-area-right">
        <ZoomControl />
      </div>
    </div>
  );
};

export default SheetTab;
