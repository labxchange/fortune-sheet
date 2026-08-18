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
      {tooltip && <div className="fortune-tooltip">{tooltip}</div>}
      {children}
    </div>
  );
};

export default CustomButton;
