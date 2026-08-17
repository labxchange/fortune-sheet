import React, { useRef, useEffect } from "react";

type Props = React.PropsWithChildren<{
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
  /**
   * Exposes the row as a button to assistive tech. Opt-in on purpose: several
   * consumers (insert row/column, row height, column width) nest a text
   * <input> inside a Menu, and `button` is a presentational-children role, so
   * setting it unconditionally would strip those inputs from the
   * accessibility tree. Only pass it where the row really is just a button.
   */
  role?: "button";
  /**
   * Expanded state for rows that disclose a submenu or a collapsible list.
   * Omitted entirely when undefined, so non-disclosure rows stay unaffected.
   */
  expanded?: boolean;
}>;

const Menu: React.FC<Props> = ({
  onClick,
  onMouseLeave,
  onMouseEnter,
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
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
          if (e.repeat) return;
          e.preventDefault();
          e.stopPropagation();
          containerRef.current?.dispatchEvent(
            new MouseEvent("click", {
              bubbles: true,
              cancelable: true,
            })
          );
        }
      }}
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
