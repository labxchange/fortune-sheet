import { render } from "@testing-library/react";
import React, { useRef } from "react";
import { useAdjacentSubmenuPosition } from "../src/hooks/useAdjacentSubmenuPosition";

// jsdom does no layout: getBoundingClientRect returns all zeros and
// offsetParent is always null, so every input this hook reads has to be fed
// in. That is the whole setup cost — the arithmetic under test is real.
type Box = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const stubRect = (el: HTMLElement, box: Box) => {
  const rect = {
    ...box,
    right: box.left + box.width,
    bottom: box.top + box.height,
    x: box.left,
    y: box.top,
    toJSON: () => "",
  } as DOMRect;
  el.getBoundingClientRect = () => rect;
};

const Harness: React.FC<{ open: boolean }> = ({ open }) => {
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const boundaryRef = useRef<HTMLDivElement>(null);
  useAdjacentSubmenuPosition({ open, triggerRef, menuRef, boundaryRef });
  return (
    <div ref={boundaryRef} data-testid="boundary">
      <div ref={triggerRef} data-testid="trigger" />
      {/* The submenu is a sibling of the trigger, not a descendant, so its
          containing block is this unrelated positioned ancestor. */}
      <div data-testid="offset-parent" style={{ position: "relative" }}>
        <div
          ref={menuRef}
          data-testid="menu"
          style={{ position: "absolute" }}
        />
      </div>
    </div>
  );
};

const VIEWPORT: Box = { top: 0, left: 0, width: 1000, height: 800 };
const MENU: Box = { top: 0, left: 0, width: 180, height: 200 };
const OFFSET_PARENT: Box = { top: 40, left: 20, width: 500, height: 500 };

/**
 * Renders closed, stubs the geometry, then opens — the hook's effect is keyed
 * on `open`, so it measures once the numbers are in place.
 */
const position = ({
  trigger,
  boundary = VIEWPORT,
  menu = MENU,
  offsetParent = OFFSET_PARENT,
}: {
  trigger: Box;
  boundary?: Box;
  menu?: Box;
  offsetParent?: Box;
}) => {
  const { getByTestId, rerender } = render(<Harness open={false} />);
  const menuEl = getByTestId("menu");
  const offsetParentEl = getByTestId("offset-parent");

  stubRect(getByTestId("trigger"), trigger);
  stubRect(getByTestId("boundary"), boundary);
  stubRect(menuEl, menu);
  stubRect(offsetParentEl, offsetParent);
  Object.defineProperty(menuEl, "offsetParent", {
    get: () => offsetParentEl,
    configurable: true,
  });

  rerender(<Harness open />);
  return menuEl;
};

const ROOM_TO_SPARE: Box = { top: 100, left: 50, width: 200, height: 30 };

describe("useAdjacentSubmenuPosition", () => {
  it("opens to the right of the trigger when there is room", () => {
    // boundary.right 1000 - trigger.right 250 = 750, well over the menu's 180
    const menu = position({ trigger: ROOM_TO_SPARE });
    // trigger.right 250 - offsetParent.left 20
    expect(menu.style.left).toBe("230px");
  });

  it("flips to the left of the trigger when it would overflow the boundary", () => {
    // boundary.right 1000 - trigger.right 990 = 10, short of the menu's 180
    const menu = position({
      trigger: { top: 100, left: 850, width: 140, height: 30 },
    });
    // trigger.left 850 - offsetParent.left 20 - menu.width 180
    expect(menu.style.left).toBe("650px");
  });

  it("top-aligns with the trigger when there is room below", () => {
    // boundary.bottom 800 - trigger.top 100 = 700, over the menu's 200
    const menu = position({ trigger: ROOM_TO_SPARE });
    // trigger.top 100 - offsetParent.top 40
    expect(menu.style.top).toBe("60px");
  });

  it("flips to open upward when it would overflow the bottom", () => {
    // boundary.bottom 800 - trigger.top 700 = 100, short of the menu's 200
    const menu = position({
      trigger: { top: 700, left: 50, width: 200, height: 30 },
    });
    // trigger.bottom 730 - offsetParent.top 40 - menu.height 200
    expect(menu.style.top).toBe("490px");
  });

  it("subtracts the submenu's own offsetParent, not a fixed offset", () => {
    // The regression this hook exists for: the submenu's containing block is
    // whatever positioned ancestor it lands under, which differs per row. With
    // the trigger and boundary held still, moving only the offsetParent has to
    // move the computed offsets by exactly as much — a hardcoded `top: -8px`
    // would not.
    const menu = position({
      trigger: ROOM_TO_SPARE,
      offsetParent: { top: 140, left: 120, width: 500, height: 500 },
    });
    // 100px further down and left than the OFFSET_PARENT cases above
    expect(menu.style.top).toBe("-40px");
    expect(menu.style.left).toBe("130px");
  });

  it("leaves the submenu alone while it is closed", () => {
    const { getByTestId } = render(<Harness open={false} />);
    expect(getByTestId("menu").style.top).toBe("");
    expect(getByTestId("menu").style.left).toBe("");
  });
});
