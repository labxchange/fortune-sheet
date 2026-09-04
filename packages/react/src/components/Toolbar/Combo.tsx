import React, {
  CSSProperties,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useContext,
} from "react";
import { locale } from "@fortune-sheet/core";
import { useOutsideClick } from "../../hooks/useOutsideClick";
import { useEscapeToClose } from "../../hooks/useEscapeToClose";
import {
  onActivationKeyDown,
  mouseDownToggleHandlers,
} from "../../utils/keyboardActivation";
import SVGIcon from "../SVGIcon";
import WorkbookContext from "../../context";

type Props = {
  tooltip: string;
  iconId?: string;
  text?: string;
  /**
   * Gives the main button its own action instead of opening the popup. The
   * arrow still opens the popup, so with this set the two controls do
   * different things and only the arrow carries the popup's ARIA.
   */
  onClick?: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
  /**
   * Applies to the main button only, for when its onClick action is
   * unavailable (e.g. "apply the most recent colour" before any colour has
   * been picked). The arrow is never disabled — it is the only way to reach
   * the popup, which is where the action becomes available again.
   */
  disabled?: boolean;
  /**
   * What the popup actually is, for aria-haspopup. Defaults to "menu"; pass
   * false where the popup is not a menu (the colour pickers are a grid of
   * swatch buttons), since aria-expanded plus aria-controls is a complete
   * disclosure relationship on its own and claiming a menu that isn't there is
   * worse than omitting the attribute. Explicitly false rather than undefined,
   * which a default parameter cannot distinguish from "not passed".
   */
  hasPopup?: "menu" | false;
  children: (
    setOpen: React.Dispatch<React.SetStateAction<boolean>>
  ) => React.ReactNode;
};

const Combo: React.FC<Props> = ({
  tooltip,
  onClick,
  text,
  iconId,
  disabled,
  hasPopup = "menu",
  children,
}) => {
  const { context } = useContext(WorkbookContext);
  const style: CSSProperties = { userSelect: "none" };
  const [open, setOpen] = useState(false);
  const [popupPosition, setPopupPosition] = useState({ left: 0 });
  const popupRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const popupId = useId();
  const { info } = locale(context);
  /** Without an onClick, the main button is itself the popup's toggle. */
  const ownsPopup = !onClick;
  // Unconditionally appending ": " left every icon-only Combo named
  // "Font color: ", "Horizontal align: " and so on.
  const label = text ? `${tooltip}: ${text}` : tooltip;

  useOutsideClick(popupRef, () => {
    setOpen(false);
  });

  useEscapeToClose({
    open,
    onClose: () => setOpen(false),
    containerRef: popupRef,
    /* WCAG 2.4.11. The riskiest of the eight: these popups host colour pickers
     * and native inputs, and opening an OS colour picker takes focus out of the
     * document entirely. That reports a null relatedTarget, which the hook
     * never treats as leaving — see the focusout handler. */
    closeOnFocusOut: true,
  });

  useLayoutEffect(() => {
    // re-position the popup menu if it overflows the window
    if (!popupRef.current) {
      return;
    }
    if (!open) {
      setPopupPosition({ left: 0 });
    }
    const winW = window.innerWidth;
    const rect = popupRef.current.getBoundingClientRect();
    const menuW = rect.width;
    const { left } = rect;
    if (left + menuW > winW) {
      setPopupPosition({ left: -rect.width + buttonRef.current!.clientWidth });
    }
  }, [open]);

  return (
    <div className="fortune-toobar-combo-container fortune-toolbar-item">
      <div ref={buttonRef} className="fortune-toolbar-combo">
        <div
          className="fortune-toolbar-combo-button"
          {...(ownsPopup
            ? mouseDownToggleHandlers(() => setOpen(!open))
            : {
                onClick: disabled ? undefined : onClick,
                onKeyDown: onActivationKeyDown(disabled),
              })}
          tabIndex={0}
          data-tips={tooltip}
          role="button"
          // Only when this button is the thing that opens the popup. With an
          // onClick it applies an action instead and never calls setOpen, so
          // advertising a popup here told the user to expect a menu that
          // pressing it would never produce — and left aria-expanded stuck at
          // "collapsed" while the arrow's popup was open.
          aria-haspopup={ownsPopup ? hasPopup || undefined : undefined}
          aria-expanded={ownsPopup ? open : undefined}
          aria-controls={ownsPopup && open ? popupId : undefined}
          aria-disabled={disabled || undefined}
          aria-label={label}
          style={style}
        >
          {iconId ? (
            <SVGIcon name={iconId} style={disabled ? { opacity: 0.3 } : {}} />
          ) : (
            <span className="fortune-toolbar-combo-text">
              {text !== undefined ? text : ""}
            </span>
          )}
        </div>
        <div
          className="fortune-toolbar-combo-arrow"
          {...mouseDownToggleHandlers(() => setOpen(!open))}
          tabIndex={0}
          data-tips={tooltip}
          role="button"
          aria-haspopup={hasPopup || undefined}
          aria-expanded={open}
          // gated on `open` because the popup is rendered conditionally below,
          // so the id does not exist while closed and the reference would dangle
          aria-controls={open ? popupId : undefined}
          aria-label={`${tooltip}: ${info.Dropdown}`}
          style={style}
        >
          <SVGIcon name="combo-arrow" width={10} />
        </div>
        {tooltip && <div className="fortune-tooltip">{tooltip}</div>}
      </div>
      {open && (
        <div
          ref={popupRef}
          id={popupId}
          className="fortune-toolbar-combo-popup"
          style={popupPosition}
        >
          {children?.(setOpen)}
        </div>
      )}
    </div>
  );
};

export default Combo;
