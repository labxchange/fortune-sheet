import React, { useRef, useEffect } from "react";
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
  | { role?: undefined; expanded?: never }
  | { role: "button"; expanded?: boolean };

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
  children,
}) => {
  useEffect(() => {
    // focus on mount for keyboard nav
    const element = document.querySelector(".luckysheet-cols-menuitem");
    if (element) {
      (element as HTMLDivElement).focus();
    }
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={containerRef}
      className="luckysheet-cols-menuitem luckysheet-mousedown-cancel"
      role={role}
      aria-expanded={expanded}
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
