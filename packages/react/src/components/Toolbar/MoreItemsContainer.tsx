import React, { useRef } from "react";
import { useOutsideClick } from "../../hooks/useOutsideClick";
import { useEscapeToClose } from "../../hooks/useEscapeToClose";
import { useRovingFocus } from "../../hooks/useRovingFocus";

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
  });
  useRovingFocus({ containerRef, orientation: "vertical" });

  return (
    <div ref={containerRef} className="fortune-toolbar-more-container">
      {children}
    </div>
  );
};

export default MoreItemsContaier;
