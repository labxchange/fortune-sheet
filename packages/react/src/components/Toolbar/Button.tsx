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
  /**
   * For a button that discloses a popup: the popup's id while it is open, and
   * undefined while it is not.
   *
   * Two jobs, and the second is the one that is easy to miss. It declares the
   * relationship to a screen reader, and it is also how `isWithinPopup`
   * recognises this button as part of the popup's own widget — matching
   * `aria-controls` against the container's id. A disclosing button without it
   * reads as "outside" to `closeOnFocusOut`, so Shift+Tab onto it closes the
   * popup and the next Enter reopens it.
   */
  controls?: string;
  /**
   * Whether the popup this button discloses is open. Undefined for an ordinary
   * button, which must not announce a disclosure state at all.
   */
  expanded?: boolean;
  children?: React.ReactNode;
};

const Button: React.FC<Props> = ({
  tooltip,
  onClick,
  onMouseDown,
  iconId,
  disabled,
  selected,
  controls,
  expanded,
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
      aria-disabled={disabled || undefined}
      // Only on the buttons that actually disclose something, so the ordinary
      // toolbar buttons are not announced as having a popup they do not have.
      // `expanded` rather than `controls !== undefined` drives these two: a
      // collapsed disclosure still has to say `aria-expanded="false"`, and
      // `controls` is deliberately absent while the popup is unmounted.
      aria-haspopup={expanded === undefined ? undefined : "menu"}
      aria-expanded={expanded}
      aria-controls={controls}
      style={selected ? { backgroundColor: "#E7E5EB" } : {}}
    >
      <SVGIcon name={iconId} style={disabled ? { opacity: 0.3 } : {}} />
      {tooltip && <div className="fortune-tooltip">{tooltip}</div>}
      {children}
    </div>
  );
};

export default Button;
