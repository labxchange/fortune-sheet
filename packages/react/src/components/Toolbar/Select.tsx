import React, { CSSProperties, useRef } from "react";
import SVGIcon from "../SVGIcon";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import { activateOnEnterOrSpace } from "../../utils/keyboardActivation";

const Select: React.FC<{
  children?: React.ReactNode;
  style?: CSSProperties;
}> = ({ children, style }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  useRovingFocus({ containerRef, orientation: "vertical" });
  return (
    <div className="fortune-toolbar-select" style={style} ref={containerRef}>
      {children}
    </div>
  );
};

type OptionProps = {
  onClick?: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
  iconId?: string;
  onMouseLeave?: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
  onMouseEnter?: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
  /** Override for options that open a nested submenu instead of clicking. */
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  "aria-haspopup"?: boolean | "menu";
  "aria-expanded"?: boolean;
};

const Option: React.FC<React.PropsWithChildren<OptionProps>> = ({
  iconId,
  onClick,
  children,
  onMouseLeave,
  onMouseEnter,
  onKeyDown,
  "aria-haspopup": ariaHasPopup,
  "aria-expanded": ariaExpanded,
}) => {
  return (
    <div
      onClick={onClick}
      onKeyDown={onKeyDown ?? activateOnEnterOrSpace}
      tabIndex={0}
      role="button"
      aria-haspopup={ariaHasPopup}
      aria-expanded={ariaExpanded}
      className="fortune-toolbar-select-option"
      onMouseLeave={(e) => onMouseLeave?.(e)}
      onMouseEnter={(e) => onMouseEnter?.(e)}
    >
      {iconId && <SVGIcon name={iconId} />}
      <div className="fortuen-toolbar-text">{children}</div>
    </div>
  );
};

export { Option };

export default Select;
