import { render, fireEvent, createEvent, within } from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";
import Button from "../src/components/Toolbar/Button";

// A trigger carrying `aria-haspopup` promises the APG menu-button contract,
// and Down Arrow opening the popup is part of it -- the gesture a screen
// reader trains its user to reach for once Enter is known to work. Six
// triggers made the promise and handled only Enter/Space, so the documented
// key did nothing: the reporter could open the Format dropdown with Enter and
// not with Down.
//
// The negative control is the half worth guarding. The fix is opt-in on
// "did this trigger say it discloses a popup", so an ordinary toolbar button
// must still let an arrow through rather than swallowing it for nothing.
describe("menu-button arrow keys", () => {
  /** Returns the event so the test can ask whether the key was claimed. */
  const press = (el: HTMLElement, key: string) => {
    const event = createEvent.keyDown(el, {
      key,
      bubbles: true,
      cancelable: true,
    });
    fireEvent(el, event);
    return event;
  };

  const openPopup = () =>
    document.querySelector<HTMLElement>(".fortune-toolbar-combo-popup");

  const formatCombo = (getAllByRole: any): HTMLElement =>
    getAllByRole("button", { name: /^Format:/ })[0];

  it("opens the Format dropdown with Down Arrow, on its first option", () => {
    const { getAllByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    const combo = formatCombo(getAllByRole);

    combo.focus();
    expect(openPopup()).toBeNull();

    press(combo, "ArrowDown");

    const popup = openPopup();
    expect(popup).not.toBeNull();
    // Same landing spot Enter produces (useEscapeToClose's autoFocus), which
    // is what makes the two gestures interchangeable to the user.
    const automatic = within(popup!)
      .getByText("Automatic")
      .closest('[role="button"]') as HTMLElement;
    expect(document.activeElement).toBe(automatic);
  });

  it("opens it with Up Arrow too", () => {
    const { getAllByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    const combo = formatCombo(getAllByRole);

    combo.focus();
    press(combo, "ArrowUp");

    expect(openPopup()).not.toBeNull();
  });

  it("still opens and closes on a mouse press", () => {
    // The pointer route must be exactly what it was: this change *wraps*
    // mouseDownToggleHandlers and passes its onMouseDown and onClick through
    // untouched, rather than reimplementing the trigger. Toggling shut again
    // is the half that would break first if it had been reimplemented, since
    // that is the behaviour the mousedown-not-click design exists to protect.
    const { getAllByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    const combo = formatCombo(getAllByRole);

    fireEvent.mouseDown(combo);
    expect(openPopup()).not.toBeNull();

    fireEvent.mouseDown(combo);
    expect(openPopup()).toBeNull();
  });

  it("claims the key, so it cannot reach the grid behind the toolbar", () => {
    // The grid's handleGlobalKeyDown is bound on .fortune-container, which
    // wraps the toolbar. An unclaimed arrow moves the selection instead --
    // the user presses "open this menu" and the sheet scrolls.
    const { getAllByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    const combo = formatCombo(getAllByRole);

    combo.focus();
    expect(press(combo, "ArrowDown").defaultPrevented).toBe(true);
  });

  it("does not close a dropdown that is already open", () => {
    // These keys only ever open. A toggle here would make the second press of
    // a repeated Down -- or a Down after Enter -- shut the menu.
    const { getAllByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    const combo = formatCombo(getAllByRole);

    combo.focus();
    press(combo, "ArrowDown");
    expect(openPopup()).not.toBeNull();

    press(combo, "ArrowDown");

    expect(openPopup()).not.toBeNull();
  });

  it("leaves an ordinary toolbar button's arrow keys alone", () => {
    // The control for the whole change, at the level the user meets it: Bold
    // discloses nothing, so it must not consume an arrow. If this fails, the
    // fix has been applied by handler rather than by promise and arrow keys
    // have gone dead across the toolbar.
    const { getByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    // Named "Bold (Ctrl+B)" -- the accessible name carries the shortcut.
    const bold = getByRole("button", { name: /^Bold/ });

    bold.focus();

    expect(press(bold, "ArrowDown").defaultPrevented).toBe(false);
  });

  // The single-control merge this toolbar went through -- one control that
  // opens the menu, instead of a primary action plus a redundant caret -- is
  // the shape these arrow keys are being added to, and it must survive them.
  // The risk is specific: the caret has its own toggle handlers, and giving
  // those handlers arrow keys would be a way to hand a merged control a
  // second keyboard-operable part and undo the merge.
  describe("the single-control merge is preserved", () => {
    it("exposes no redundant caret button beside the merged control", () => {
      const { getAllByRole, queryByRole } = render(
        <Workbook data={[{ name: "Sheet1" }]} />
      );

      // The control itself is there...
      expect(formatCombo(getAllByRole)).not.toBeNull();
      // ...and the caret is not a second button next to it. `${tooltip}:
      // ${info.Dropdown}` is the name an unmerged caret carries, so its
      // absence is the merge, asserted by name rather than by a count --
      // "format-painter" is also in the default toolbar, and a /^Format/
      // count catches that too.
      expect(queryByRole("button", { name: "Format: Dropdown" })).toBeNull();
    });

    it("leaves the merged control's caret out of the tree and off the tab order", () => {
      const { getAllByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);
      const combo = formatCombo(getAllByRole);
      const caret = combo.parentElement!.querySelector(
        ".fortune-toolbar-combo-arrow"
      )!;

      expect(caret.getAttribute("aria-hidden")).toBe("true");
      // Nothing can put focus here, so the arrow keys cannot have given the
      // caret a keyboard role on a merged control.
      expect(caret.hasAttribute("tabindex")).toBe(false);
    });

    it("still gives an unmerged control's caret its own button and arrow keys", () => {
      // The other side of the same gate: where the main button applies an
      // action, the caret really is the only route to the popup, so it keeps
      // its own tab stop and ARIA -- and owes the same Down Arrow. Selected
      // structurally rather than by name: `role="button"` on a caret is set
      // only when the control is unmerged, which is exactly the population
      // this case is about -- 11 of the toolbar's 16 combos, against 5 merged
      // ones. The `aria-haspopup` half of the selector skips the two colour
      // pickers, whose popup is a grid of swatches and which pass
      // `hasPopup={false}` on purpose; they are unmerged but are not menu
      // buttons, so they are not what this asserts.
      const { container } = render(<Workbook data={[{ name: "Sheet1" }]} />);
      const caret = container.querySelector<HTMLElement>(
        '.fortune-toolbar-combo-arrow[role="button"][aria-haspopup="menu"]'
      );
      expect(caret).not.toBeNull();

      caret!.focus();
      const event = press(caret!, "ArrowDown");

      expect(event.defaultPrevented).toBe(true);
      // Scoped to this combo, so a popup belonging to another one cannot
      // stand in for it.
      const ownContainer = caret!.closest(".fortune-toobar-combo-container")!;
      expect(
        ownContainer.querySelector(".fortune-toolbar-combo-popup")
      ).not.toBeNull();
    });
  });

  // `Button` picks its handlers on `expanded !== undefined` -- the same test
  // that decides whether it renders aria-haspopup. The app has exactly one
  // `onMouseDown` Button (More) and it *does* disclose, so the negative half
  // of that gate is unreachable from a rendered Workbook and is pinned here
  // instead. Without this pair, the branch could invert and only the More
  // button would notice.
  describe("Button's disclosure gate", () => {
    it("claims the arrow when the button discloses a popup", () => {
      const onMouseDown = jest.fn();
      const { getByRole } = render(
        <Button tooltip="Menu" onMouseDown={onMouseDown} expanded={false} />
      );
      const trigger = getByRole("button", { name: "Menu" });

      trigger.focus();
      const event = press(trigger, "ArrowDown");

      expect(event.defaultPrevented).toBe(true);
      expect(onMouseDown).toHaveBeenCalled();
    });

    it("still fires on a mouse press either way", () => {
      const disclosing = jest.fn();
      const plain = jest.fn();
      const { getByRole: getDisclosing } = render(
        <Button tooltip="Menu" onMouseDown={disclosing} expanded={false} />
      );
      const { getByRole: getPlain } = render(
        <Button tooltip="Plain" onMouseDown={plain} />
      );

      fireEvent.mouseDown(getDisclosing("button", { name: "Menu" }));
      fireEvent.mouseDown(getPlain("button", { name: "Plain" }));

      // Both branches of the gate reach the same onMouseDown -- only the
      // keyboard half differs between them.
      expect(disclosing).toHaveBeenCalled();
      expect(plain).toHaveBeenCalled();
    });

    it("ignores the arrow when it discloses nothing", () => {
      const onMouseDown = jest.fn();
      const { getByRole } = render(
        <Button tooltip="Plain" onMouseDown={onMouseDown} />
      );
      const trigger = getByRole("button", { name: "Plain" });

      trigger.focus();
      const event = press(trigger, "ArrowDown");

      expect(event.defaultPrevented).toBe(false);
      expect(onMouseDown).not.toHaveBeenCalled();
    });
  });
});
