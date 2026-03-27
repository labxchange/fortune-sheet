import React from "react";
type Props = React.PropsWithChildren<{
    onClick?: (e: React.MouseEvent<HTMLDivElement, MouseEvent>, container: HTMLDivElement) => void;
    onMouseLeave?: (e: React.MouseEvent<HTMLDivElement, MouseEvent>, container: HTMLDivElement) => void;
    onMouseEnter?: (e: React.MouseEvent<HTMLDivElement, MouseEvent>, container: HTMLDivElement) => void;
}>;
declare const Menu: React.FC<Props>;
export default Menu;
