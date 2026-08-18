import React, { useRef } from "react";
import { activateOnEnterOrSpace } from "../../utils/keyboardActivation";

type Props = React.PropsWithChildren<{
  onClick?: (
    e: React.MouseEvent<HTMLDivElement, MouseEvent>,
    container: HTMLDivElement
  ) => void;
  onMouseLeave?: (
    e: React.MouseEvent<HTMLDivElement, MouseEvent>,
    container: HTMLDivElement
  ) => void;
  onMouseEnter?: (
    e: React.MouseEvent<HTMLDivElement, MouseEvent>,
    container: HTMLDivElement
  ) => void;
  /** Override for items that open a nested submenu instead of clicking. */
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  "aria-haspopup"?: boolean;
  "aria-expanded"?: boolean;
}>;

const Menu: React.FC<Props> = ({
  onClick,
  onMouseLeave,
  onMouseEnter,
  onKeyDown,
  "aria-haspopup": ariaHasPopup,
  "aria-expanded": ariaExpanded,
  children,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={containerRef}
      className="luckysheet-cols-menuitem luckysheet-mousedown-cancel"
      onClick={(e) => onClick?.(e, containerRef.current!)}
      onKeyDown={onKeyDown ?? activateOnEnterOrSpace}
      onMouseLeave={(e) => onMouseLeave?.(e, containerRef.current!)}
      onMouseEnter={(e) => onMouseEnter?.(e, containerRef.current!)}
      tabIndex={0}
      role="button"
      aria-haspopup={ariaHasPopup}
      aria-expanded={ariaExpanded}
    >
      <div className="luckysheet-cols-menuitem-content luckysheet-mousedown-cancel">
        {children}
      </div>
    </div>
  );
};

export default Menu;
