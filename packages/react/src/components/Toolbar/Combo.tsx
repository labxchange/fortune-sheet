import React, {
  CSSProperties,
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
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

/**
 * The one owner of "which dropdown is open" for a group of sibling `Combo`s.
 *
 * Each `Combo` used to hold a private `useState(false)`, so nothing knew another
 * was open and opening a second could not close the first. `onMouseLeave` on
 * some triggers hid that from mouse users, which is why the ticket reported it
 * as a VoiceOver problem: take the pointer away and nothing closed anything.
 *
 * One owner rather than each dropdown closing the others through callbacks --
 * that would be O(n^2) wiring across 16 instances, and every dropdown added
 * later would have to remember to join in.
 *
 * A `Combo` rendered with no provider above it keeps its own local state, so it
 * still works standalone.
 */
type ComboExclusivityValue = {
  openId: string | null;
  setOpenId: React.Dispatch<React.SetStateAction<string | null>>;
};

const ComboExclusivityContext =
  React.createContext<ComboExclusivityValue | null>(null);

/**
 * For an owner that has to be held *above* the provider -- the toolbar keeps
 * one so the "More" button can close any open dropdown before it opens the
 * overflow popup, which it cannot do from inside its own JSX.
 */
export function useComboExclusivityOwner(): ComboExclusivityValue {
  const [openId, setOpenId] = useState<string | null>(null);
  return useMemo(() => ({ openId, setOpenId }), [openId]);
}

export const ComboExclusivity: React.FC<{
  /** Omit to let this provider own the state itself. */
  value?: ComboExclusivityValue;
  children?: React.ReactNode;
}> = ({ value, children }) => {
  const owned = useComboExclusivityOwner();
  return (
    <ComboExclusivityContext.Provider value={value ?? owned}>
      {children}
    </ComboExclusivityContext.Provider>
  );
};

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
  const [popupPosition, setPopupPosition] = useState({ left: 0 });
  const popupRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const popupId = useId();
  // `popupId` doubles as this instance's identity in the shared owner -- it is
  // already stable per instance, so a second `useId` would be redundant.
  const exclusivity = useContext(ComboExclusivityContext);
  const [localOpen, setLocalOpen] = useState(false);
  const open = exclusivity ? exclusivity.openId === popupId : localOpen;
  const setOpen = useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    (next) => {
      if (!exclusivity) {
        setLocalOpen(next);
        return;
      }
      exclusivity.setOpenId((prevId) => {
        const wasOpen = prevId === popupId;
        const wantOpen = typeof next === "function" ? next(wasOpen) : next;
        if (wantOpen) return popupId;
        // Only ever clear our own id. `useOutsideClick` and the escape hook
        // both close unconditionally, so a closed Combo must not be able to
        // shut whichever one is actually open.
        return wasOpen ? null : prevId;
      });
    },
    [exclusivity, popupId]
  );
  const { info } = locale(context);
  /** Without an onClick, the main button is itself the popup's toggle. */
  const ownsPopup = !onClick;
  // Unconditionally appending ": " left every icon-only Combo named
  // "Font color: ", "Horizontal align: " and so on.
  const label = text ? `${tooltip}: ${text}` : tooltip;

  /**
   * When the main button is itself the popup's toggle, the arrow is a second
   * tab stop with byte-identical behaviour: same handler, same popup, same
   * accessible name bar a "dropdown" suffix. Two controls, one action — nothing
   * for a keyboard or screen-reader user to choose between, and one more stop
   * to pass on every traversal of the toolbar. So there it is demoted to
   * decoration and hidden from the accessibility tree.
   *
   * No tabindex at all rather than -1: an element that is focusable but not
   * tabbable inside aria-hidden is itself a violation, and nothing needs to
   * focus this programmatically. The mouse handlers stay on it regardless —
   * clicking the arrow must keep opening the popup.
   *
   * With an onClick the two genuinely differ: the main button applies an
   * action and the arrow is the only route to the popup, so it keeps its own
   * tab stop and its own ARIA.
   */
  const arrowToggle = mouseDownToggleHandlers<HTMLDivElement>(() =>
    setOpen(!open)
  );
  const arrowProps: React.HTMLAttributes<HTMLDivElement> = ownsPopup
    ? { "aria-hidden": true }
    : {
        tabIndex: 0,
        role: "button",
        "aria-haspopup": hasPopup || undefined,
        "aria-expanded": open,
        // gated on `open` because the popup is rendered conditionally below,
        // so the id does not exist while closed and the reference would dangle
        "aria-controls": open ? popupId : undefined,
        "aria-label": `${tooltip}: ${info.Dropdown}`,
      };

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
      {/* `data-single-control` marks the case where the caret is decoration
          rather than a control of its own, so the stylesheet knows the focus
          ring belongs on this box (which contains both) instead of on the
          button alone. With an onClick the two genuinely differ and each keeps
          its own ring. */}
      <div
        ref={buttonRef}
        className="fortune-toolbar-combo"
        data-single-control={ownsPopup ? "" : undefined}
      >
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
          onMouseDown={arrowToggle.onMouseDown}
          onClick={arrowToggle.onClick}
          // Keyboard activation only while this arrow is a control in its own
          // right. Demoted, it is `aria-hidden` with no tabindex, so nothing
          // can put focus on it and the handler was unreachable code that read
          // as a promise the element does not keep.
          //
          // The `data-tips` that was here went with it: no stylesheet in this
          // package renders that attribute — it is luckysheet residue — and the
          // tooltip the user actually sees is the `.fortune-tooltip` sibling
          // below.
          onKeyDown={ownsPopup ? undefined : arrowToggle.onKeyDown}
          {...arrowProps}
          style={style}
        >
          <SVGIcon name="combo-arrow" width={10} />
        </div>
        {tooltip && (
          // Hidden from AT: the visual-only hover tooltip repeats the string
          // already carried as the buttons' aria-label, and left exposed it
          // reads as a second, static copy of the name.
          <div className="fortune-tooltip" aria-hidden="true">
            {tooltip}
          </div>
        )}
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
