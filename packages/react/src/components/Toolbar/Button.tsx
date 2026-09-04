import React from "react";
import SVGIcon from "../SVGIcon";
import {
  mouseDownToggleHandlers,
  onActivationKeyDown,
} from "../../utils/keyboardActivation";

type Props = {
  tooltip: string;
  /**
   * The accessible name, when it has to differ from the tooltip. Defaults to
   * `tooltip`, which is the right answer everywhere the visible label and the
   * name are the same string.
   *
   * The shortcuts button is the exception: it carries its key binding on its
   * face in a `<kbd>`, so putting the same keys in the tooltip printed them
   * twice on hover — while the name still has to include them, because that is
   * the whole of what the ticket asked for. Splitting the two keeps the name a
   * superset of the visible label, which is what Label in Name (WCAG 2.5.3)
   * requires.
   */
  ariaLabel?: string;
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
  ariaLabel,
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
      aria-label={ariaLabel ?? tooltip}
      // `selected` is the toggle state of bold, italic, underline and
      // strikethrough, and until now it reached the user as a background colour
      // and nothing else — a screen reader was told these were plain buttons
      // and could not report whether the attribute was on. Left undefined for
      // the buttons that are not toggles, so they stay plain buttons rather
      // than claiming a state they do not have.
      aria-pressed={selected}
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
