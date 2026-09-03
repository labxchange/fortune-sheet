import _ from "lodash";
import React, { useContext, useRef, useCallback } from "react";
import WorkbookContext from "../../context";
import { useOutsideClick } from "../../hooks/useOutsideClick";
import { useEscapeToClose } from "../../hooks/useEscapeToClose";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import "./index.css";
import SheetListItem from "./SheetListItem";

/**
 * Named so `#all-sheets` can point `aria-controls` at it.
 *
 * Not decoration for the accessibility tree: `isWithinPopup` recognises a
 * trigger as part of its own widget by matching `aria-controls`/`aria-owns`
 * against the container's `id`, and this container had neither. With
 * `closeOnFocusOut` on and no way to make that match, Shift+Tab from the first
 * item onto the trigger read as focus leaving, closed the list, and left focus
 * on a trigger whose next Enter reopened it — the exact loop `controlsPopup`'s
 * docstring describes. Two other popups were in the same state; see
 * `ZoomControl` and `MoreItemsContainer`.
 */
export const SHEET_LIST_ID = "fortune-sheet-list-popup";

const SheetList: React.FC = () => {
  const { context, setContext } = useContext(WorkbookContext);
  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setContext((ctx) => {
      ctx.showSheetList = false;
    });
  }, [setContext]);
  useOutsideClick(containerRef, close, [close]);
  // closeOnFocusOut: WCAG 2.4.11, as for every other popup here.
  useEscapeToClose({ onClose: close, containerRef, closeOnFocusOut: true });
  useRovingFocus({
    containerRef,
    orientation: "vertical",
    itemSelector: ".fortune-sheet-list-item",
  });

  return (
    <div
      id={SHEET_LIST_ID}
      className="fortune-context-menu luckysheet-cols-menu fortune-sheet-list"
      ref={containerRef}
    >
      {_.sortBy(context.luckysheetfile, (s) => Number(s.order)).map(
        (singleSheet) => {
          return <SheetListItem sheet={singleSheet} key={singleSheet.id} />;
        }
      )}
    </div>
  );
};

export default SheetList;
