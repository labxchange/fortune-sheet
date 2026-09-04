import React, { useRef } from "react";
import { useOutsideClick } from "../../hooks/useOutsideClick";
import { useEscapeToClose } from "../../hooks/useEscapeToClose";
import { useRovingFocus } from "../../hooks/useRovingFocus";

/** See `SHEET_LIST_ID` in `SheetList` for why the container needs an id. */
export const MORE_ITEMS_ID = "fortune-toolbar-more-container-popup";

const MoreItemsContaier: React.FC<{
  onClose?: () => void;
  children?: React.ReactNode;
}> = ({ onClose, children }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  useOutsideClick(
    containerRef,
    () => {
      onClose?.();
    },
    [containerRef, onClose]
  );
  useEscapeToClose({
    onClose: () => onClose?.(),
    containerRef,
    // WCAG 2.4.11.
    closeOnFocusOut: true,
  });
  useRovingFocus({ containerRef, orientation: "vertical" });

  return (
    <div
      id={MORE_ITEMS_ID}
      ref={containerRef}
      className="fortune-toolbar-more-container"
    >
      {children}
    </div>
  );
};

export default MoreItemsContaier;
