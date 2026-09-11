import { render, fireEvent } from "@testing-library/react";
import React from "react";
import { locale } from "@fortune-sheet/core";
import Workbook from "../src/components/Workbook";

// Toolbar dropdown exclusivity. Every `Combo` used to own a private
// `useState(false)`, so nothing knew another was open and opening a second
// could not close the first -- the reported defect. They now share one owner.
//
// The assertions are on `aria-expanded`, not on a CSS class or the popup's
// presence: that attribute is what assistive technology reads, and the ticket
// is about what a VoiceOver user is told.

const celldata = [
  { r: 0, c: 0, v: { v: "1", m: "1", ct: { fa: "General", t: "n" } } },
];

const renderSheet = () =>
  render(
    <Workbook
      lang="en"
      data={[{ name: "Sheet1", id: "s1", celldata, row: 10, column: 6 }]}
    />
  );

/**
 * The strip's dropdown triggers, in DOM order. Selected structurally rather
 * than by label so the test does not silently narrow to one product decision
 * about which items the default toolbar shows.
 */
const triggers = (container: HTMLElement) =>
  Array.from(
    container.querySelectorAll<HTMLElement>(
      ".fortune-toolbar-combo-button[aria-expanded]"
    )
  );

const expandedFlags = (container: HTMLElement) =>
  triggers(container).map((t) => t.getAttribute("aria-expanded"));

const { toolbar } = locale({ lang: "en" } as any);

/** The strip only -- the overflow popup is rendered outside `.fortune-toolbar`. */
const stripTriggers = (container: HTMLElement) =>
  Array.from(
    container.querySelectorAll<HTMLElement>(
      ".fortune-toolbar .fortune-toolbar-combo-button[aria-expanded]"
    )
  );

const overflowTriggers = (container: HTMLElement) =>
  Array.from(
    container.querySelectorAll<HTMLElement>(
      ".fortune-toolbar-more-container .fortune-toolbar-combo-button[aria-expanded]"
    )
  );

const moreButton = (container: HTMLElement) =>
  container.querySelector<HTMLElement>(
    `.fortune-toolbar-button[aria-label="${toolbar.toolMore}"]`
  );

// The six strip cases below are characterisation tests, not regression tests:
// they are green against `origin/master`'s sources too. Master gets strip
// exclusivity as a side effect -- opening a `Combo` autofocuses an item inside
// its popup, which is a focus move out of any popup already open, which that
// popup's `closeOnFocusOut` acts on. `Combo.tsx` has the full chain.
//
// They are worth keeping exactly as written: the explicit owner this PR adds
// replaces that chain for the strip, and these pin the behaviour it has to go
// on providing. The one case that fails on master is the seam --
// "closes an overflow dropdown when a strip dropdown is opened", in the nested
// describe -- which is the reported defect.
describe("toolbar dropdown exclusivity", () => {
  it("has at least two dropdowns to be exclusive about", () => {
    // Guards every other test in this file: they all compare two triggers, and
    // would pass vacuously if the fixture rendered fewer.
    const { container } = renderSheet();

    expect(triggers(container).length).toBeGreaterThanOrEqual(2);
  });

  it("starts with nothing expanded", () => {
    const { container } = renderSheet();

    expect(expandedFlags(container).every((f) => f === "false")).toBe(true);
  });

  it("closes the first dropdown when a second is opened by pointer", () => {
    const { container } = renderSheet();
    const [first, second] = triggers(container);

    fireEvent.mouseDown(first);
    expect(first.getAttribute("aria-expanded")).toBe("true");

    fireEvent.mouseDown(second);

    expect(first.getAttribute("aria-expanded")).toBe("false");
    expect(second.getAttribute("aria-expanded")).toBe("true");
  });

  // The pointer route above cannot stand in for this one: the two arrive at
  // the owner by different paths -- `mouseDownToggleHandlers` and
  // `onActivationKeyDown` -- and a change could repair or break one alone.
  // (`useOutsideClick` covers neither: it listens on `document` in the bubble
  // phase while the trigger's mousedown calls stopPropagation.)
  it("closes the first dropdown when a second is opened by keyboard", () => {
    const { container } = renderSheet();
    const [first, second] = triggers(container);

    fireEvent.keyDown(first, { key: "Enter" });
    expect(first.getAttribute("aria-expanded")).toBe("true");

    fireEvent.keyDown(second, { key: "Enter" });

    expect(first.getAttribute("aria-expanded")).toBe("false");
    expect(second.getAttribute("aria-expanded")).toBe("true");
  });

  it("never has more than one dropdown expanded", () => {
    const { container } = renderSheet();
    const all = triggers(container);

    all.forEach((t) => fireEvent.mouseDown(t));

    expect(expandedFlags(container).filter((f) => f === "true")).toHaveLength(
      1
    );
  });

  // Toggling off must still work -- the shared owner only ever clears its own
  // id, so a Combo closing itself must not be a no-op.
  it("still closes a dropdown by pressing its own trigger again", () => {
    const { container } = renderSheet();
    const [first] = triggers(container);

    fireEvent.mouseDown(first);
    fireEvent.mouseDown(first);

    expect(first.getAttribute("aria-expanded")).toBe("false");
  });

  // The seam every case above is blind to. The wrap index is measured from
  // `getBoundingClientRect` and `clientWidth`, both 0 in jsdom, so
  // `toolbarWrapIndex` stays -1, the "More" button never renders and the
  // overflow popup -- which used to own a SECOND exclusivity owner -- is never
  // exercised. Faking just enough layout brings the one route where the
  // invariant actually broke into jest, rather than leaving it to a browser
  // pass that would have to be repeated on every change.
  //
  // Why it broke: the strip trigger's mousedown calls stopPropagation, so the
  // popup's document-level `useOutsideClick` never fires, and with two owners
  // neither knew about the other's open dropdown.
  describe("across the More overflow seam", () => {
    const ITEM_WIDTH = 40;
    const CONTAINER_WIDTH = 300;
    let getRect: jest.SpyInstance;

    const domRect = (left: number, width: number) =>
      ({
        left,
        width,
        right: left + width,
        top: 0,
        bottom: 0,
        height: 0,
        x: left,
        y: 0,
        toJSON: () => {},
      } as DOMRect);

    beforeEach(() => {
      getRect = jest
        .spyOn(HTMLElement.prototype, "getBoundingClientRect")
        .mockImplementation(function mockRect(this: HTMLElement) {
          if (!this.classList.contains("fortune-toolbar-item")) {
            return domRect(0, CONTAINER_WIDTH);
          }
          const siblings = Array.from(
            this.parentElement?.querySelectorAll(".fortune-toolbar-item") ?? []
          );
          return domRect(siblings.indexOf(this) * ITEM_WIDTH, ITEM_WIDTH);
        });
      Object.defineProperty(HTMLElement.prototype, "clientWidth", {
        configurable: true,
        value: CONTAINER_WIDTH,
      });
    });

    afterEach(() => {
      getRect.mockRestore();
      delete (HTMLElement.prototype as any).clientWidth;
    });

    // The positive control, and it guards the case below rather than the file:
    // without a wrap index there is no More button, no popup and nothing to be
    // exclusive across, and the assertions would hold vacuously.
    it("renders the More button once the faked layout overflows the strip", () => {
      const { container } = renderSheet();

      expect(moreButton(container)).not.toBeNull();
    });

    it("closes an overflow dropdown when a strip dropdown is opened", () => {
      const { container } = renderSheet();

      fireEvent.mouseDown(moreButton(container)!);
      const [overflow] = overflowTriggers(container);
      // Second positive control: the popup has to contain a dropdown for the
      // rest of this to mean anything.
      expect(overflow).not.toBeUndefined();

      fireEvent.mouseDown(overflow);
      expect(overflow.getAttribute("aria-expanded")).toBe("true");

      const [strip] = stripTriggers(container);
      fireEvent.mouseDown(strip);

      expect(strip.getAttribute("aria-expanded")).toBe("true");
      expect(overflow.getAttribute("aria-expanded")).toBe("false");
      // ...and the invariant itself, counted across both regions at once,
      // which is the form the seam could break without either side noticing.
      expect(
        [...stripTriggers(container), ...overflowTriggers(container)].filter(
          (t) => t.getAttribute("aria-expanded") === "true"
        )
      ).toHaveLength(1);
    });
  });
});
