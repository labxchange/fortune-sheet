import React, { useEffect, useRef } from "react";
import { isWithinPopup } from "../utils/containment";

export function useOutsideClick(
  containerRef: React.RefObject<HTMLElement | null>,
  handler: () => void,
  deps?: React.DependencyList,
  /**
   * Submenus rendered outside `containerRef` that a press must not be treated
   * as "outside". See `isWithinPopup` — without this, mousing a row in
   * `FilterMenu`'s sibling colour submenu unmounted the entire filter popup.
   */
  withinRefs?: React.RefObject<HTMLElement | null>[]
) {
  const withinRefsRef = useRef(withinRefs);
  withinRefsRef.current = withinRefs;
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !isWithinPopup(e.target as Node, containerRef, withinRefsRef.current)
      ) {
        handler();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
