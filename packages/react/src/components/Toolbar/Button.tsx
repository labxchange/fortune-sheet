import React from "react";
import SVGIcon from "../SVGIcon";
import {
  mouseDownToggleHandlers,
  onActivationKeyDown,
} from "../../utils/keyboardActivation";

type Props = {
  tooltip: string;
  iconId: string;
  onClick?: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
  /**
   * Use instead of onClick for a trigger that toggles a popup closed by
   * useOutsideClick (which listens on mousedown): runs on mousedown with
   * stopPropagation instead, so a press on this same button can't be
   * treated as an outside click that closes the popup a moment before
   * click reopens it. When set, onClick is ignored and Enter/Space call
   * this directly rather than forwarding to .click().
   */
  onMouseDown?: () => void;
  disabled?: boolean;
  selected?: boolean;
  children?: React.ReactNode;
};

const Button: React.FC<Props> = ({
  tooltip,
  onClick,
  onMouseDown,
  iconId,
  disabled,
  selected,
  children,
}) => {
  // const style: CSSProperties = { userSelect: "none" };
  // Every activation path honours `disabled` identically, so that the
  // aria-disabled announced below is the truth for mouse, keyboard and screen
  // reader alike. In onMouseDown mode all three handlers come from the shared
  // helper, which owns that consistency (and the target === currentTarget
  // guard) rather than each trigger re-deriving it.
  const toggleHandlers = onMouseDown
    ? mouseDownToggleHandlers<HTMLDivElement>(onMouseDown, disabled)
    : undefined;
  return (
    <div
      className="fortune-toolbar-button fortune-toolbar-item"
      onMouseDown={toggleHandlers?.onMouseDown}
      onClick={toggleHandlers?.onClick ?? (disabled ? undefined : onClick)}
      onKeyDown={toggleHandlers?.onKeyDown ?? onActivationKeyDown(disabled)}
      tabIndex={0}
      data-tips={tooltip}
      role="button"
      aria-label={tooltip}
      // `selected` is the toggle state of bold, italic, underline and
      // strikethrough, and until now it reached the user as a background colour
      // and nothing else — a screen reader was told these were plain buttons
      // and could not report whether the attribute was on. Left undefined for
      // the buttons that are not toggles, so they stay plain buttons rather
      // than claiming a state they do not have.
      aria-pressed={selected}
      aria-disabled={disabled || undefined}
      style={selected ? { backgroundColor: "#E7E5EB" } : {}}
    >
      <SVGIcon name={iconId} style={disabled ? { opacity: 0.3 } : {}} />
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

export default Button;
