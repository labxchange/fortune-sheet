import { render, fireEvent, createEvent } from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";
import Button from "../src/components/Toolbar/Button";
import { menuButtonToggleHandlers } from "../src/utils/keyboardActivation";

// The pointer counterpart to menuButtonArrowKeys: a menu button must survive
// the very press that opens it.
//
// `useEscapeToClose` autoFocuses the popup's first item from a passive effect,
// which React flushes inside the discrete mousedown -- so focus is already in
// the popup when the browser applies mousedown's *default* action and focuses
// the pressed element instead. That is a focusout from the popup, and
// `closeOnFocusOut` closes on it.
//
// Whether that shows depends entirely on where the default lands. A focusable
// trigger carrying `aria-controls` is matched by `controlsPopup`, so the move
// reads as "still inside" and nothing happens -- which is why the unmerged
// carets were always fine. A merged caret is `aria-hidden` with no tabindex
// and no `aria-controls`, so the browser walks past it to the nearest
// focusable ancestor; in an embedder that has one (LabXchange's sim wraps the
// workbook in a `tabIndex={-1}` container) that is a real node outside the
// popup, and the menu closed before it painted. This package's own Storybook
// has no such ancestor, focus went nowhere, `relatedTarget` was null and the
// handler returned early -- so it reproduced only in the embedder.
//
// jsdom does not implement focus-on-mousedown, so these assert the property
// that removes the second focus move at its source: the default is prevented.
describe("menu-button pointer focus", () => {
  /** Returns the event so the test can ask whether the default was claimed. */
  const pressMouse = (el: HTMLElement) => {
    const event = createEvent.mouseDown(el, {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(el, event);
    return event;
  };

  const formatCombo = (getAllByRole: any): HTMLElement =>
    getAllByRole("button", { name: /^Format:/ })[0];

  /** The popup belonging to this combo, never one from a neighbour. */
  const ownPopup = (el: HTMLElement) =>
    el
      .closest(".fortune-toobar-combo-container")!
      .querySelector(".fortune-toolbar-combo-popup");

  it("prevents the default on a merged control's main button", () => {
    const { getAllByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    const combo = formatCombo(getAllByRole);

    const event = pressMouse(combo);

    expect(event.defaultPrevented).toBe(true);
    expect(ownPopup(combo)).not.toBeNull();
  });

  it("prevents it on the merged caret -- the shape that could not survive", () => {
    // The reported case. Demoted to decoration, this caret keeps its mouse
    // handlers on purpose ("clicking the arrow must keep opening the popup"),
    // and it is precisely its lack of a tab stop that sent the browser's
    // default focus past it and out of the widget.
    const { getAllByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    const combo = formatCombo(getAllByRole);
    const caret = combo
      .closest(".fortune-toolbar-combo")!
      .querySelector<HTMLElement>(".fortune-toolbar-combo-arrow")!;

    // Pinned, because the fix only matters for a caret in this state: were it
    // focusable and `aria-controls`-wired, the default would land somewhere
    // the widget already recognises and there would be nothing to prevent.
    expect(caret.getAttribute("aria-hidden")).toBe("true");
    expect(caret.hasAttribute("tabindex")).toBe(false);

    const event = pressMouse(caret);

    expect(event.defaultPrevented).toBe(true);
    expect(ownPopup(combo)).not.toBeNull();
  });

  it("still toggles shut on a second press", () => {
    // The behaviour the mousedown-not-click design exists to protect.
    // `preventDefault` suppresses focus and text selection, not the toggle,
    // and `click` still fires -- so this must be unchanged by the fix.
    const { getAllByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    const combo = formatCombo(getAllByRole);

    pressMouse(combo);
    expect(ownPopup(combo)).not.toBeNull();

    pressMouse(combo);
    expect(ownPopup(combo)).toBeNull();
  });

  it("leaves an ordinary toolbar button's default alone", () => {
    // The negative control, mirroring the keyboard half: the fix is opt-in on
    // "did this trigger say it discloses a popup". A button that discloses
    // nothing has no popup to protect, and swallowing its default would cost
    // it the focus a click is supposed to give it for no gain.
    const onMouseDown = jest.fn();
    const { getByRole } = render(
      <Button tooltip="Plain" onMouseDown={onMouseDown} />
    );

    const event = pressMouse(getByRole("button", { name: "Plain" }));

    expect(event.defaultPrevented).toBe(false);
    expect(onMouseDown).toHaveBeenCalled();
  });

  it("leaves a disabled trigger's default alone", () => {
    // Same rule `mouseDownToggleHandlers` already states for propagation: a
    // disabled trigger stays out of the way entirely. Exercised through the
    // helper because no rendered trigger passes `disabled` to it today, so
    // the branch would otherwise be unreachable and free to rot.
    const onToggle = jest.fn();
    const handlers = menuButtonToggleHandlers(onToggle, false, true);
    const preventDefault = jest.fn();

    handlers.onMouseDown({
      preventDefault,
      stopPropagation: jest.fn(),
    } as any);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(onToggle).not.toHaveBeenCalled();
  });
});
