import React, { useRef } from "react";
import { activateOnEnterOrSpace } from "../../utils/keyboardActivation";

/**
 * `role` and `expanded` are paired deliberately. `aria-expanded` is not a
 * global ARIA attribute, so on a roleless generic it is invalid — axe reports
 * `aria-allowed-attr` and AT ignores it, which is the worst case: the state
 * looks handled in the source and is silent in practice. The union makes
 * `<Menu expanded>` without a role a compile error.
 *
 * `role` itself is opt-in rather than always-on because several consumers
 * (insert row/column, row height, column width) nest a text <input> inside a
 * Menu, and `button` is a presentational-children role — setting it
 * unconditionally would strip those inputs from the accessibility tree. Only
 * pass it where the row really is just a button.
 */
type AriaProps =
  | { role?: undefined; expanded?: never; hasPopup?: never; controls?: never }
  | {
      role: "button";
      expanded?: boolean;
      hasPopup?: "menu";
      /** id of the role="menu" element this row's submenu renders, if any. */
      controls?: string;
    };

type Props = React.PropsWithChildren<
  {
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
    /** Override for menu items that open a nested submenu instead of clicking. */
    onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  } & AriaProps
>;

const Menu: React.FC<Props> = ({
  onClick,
  onMouseLeave,
  onMouseEnter,
  onKeyDown,
  role,
  expanded,
  hasPopup,
  controls,
  children,
}) => {
  // Autofocusing the first row on open is useEscapeToClose's job (every
  // consumer of this component uses it). This component used to do it too,
  // via a document-wide querySelector on mount — which fired once per row
  // (~8 times for one menu), could focus a row in a different, already-open
  // menu, and ran before useEscapeToClose captured document.activeElement,
  // so the element to restore focus to on close was recorded as a menu row
  // instead of the trigger. That row is unmounted by the time the menu
  // closes, so the restore was skipped and focus fell to <body>.
  const containerRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={containerRef}
      className="luckysheet-cols-menuitem luckysheet-mousedown-cancel"
      role={role}
      aria-expanded={expanded}
      aria-haspopup={hasPopup}
      aria-controls={controls}
      onClick={(e) => onClick?.(e, containerRef.current!)}
      onKeyDown={onKeyDown ?? activateOnEnterOrSpace}
      onMouseLeave={(e) => onMouseLeave?.(e, containerRef.current!)}
      onMouseEnter={(e) => onMouseEnter?.(e, containerRef.current!)}
      tabIndex={0}
    >
      <div className="luckysheet-cols-menuitem-content luckysheet-mousedown-cancel">
        {children}
      </div>
    </div>
  );
};

export default Menu;
