import React from "react";
import CustomIcon from "./CustomIcon";
import { activateOnEnterOrSpace } from "../../utils/keyboardActivation";

type Props = {
  tooltip?: string;
  onClick?: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
  selected?: boolean;
  children?: React.ReactNode;
  iconName?: string;
  icon?: React.ReactNode;
};

const CustomButton: React.FC<Props> = ({
  tooltip,
  onClick,
  selected,
  children,
  iconName,
  icon,
}) => {
  // const style: CSSProperties = { userSelect: "none" };
  return (
    <div
      className="fortune-toolbar-button fortune-toolbar-item"
      onClick={onClick}
      onKeyDown={activateOnEnterOrSpace}
      tabIndex={0}
      data-tips={tooltip}
      role="button"
      aria-label={tooltip}
      style={selected ? { backgroundColor: "#E7E5EB" } : {}}
    >
      <CustomIcon iconName={iconName} content={icon} />
      {tooltip && (
        // Hidden from AT: this is the visual-only hover tooltip, and its text
        // is the same string already carried as the control's aria-label. Left
        // exposed it lands in the accessibility tree as a second, static copy
        // of the name beside the button that owns it.
        <div className="fortune-tooltip" aria-hidden="true">
          {tooltip}
        </div>
      )}
      {children}
    </div>
  );
};

export default CustomButton;
