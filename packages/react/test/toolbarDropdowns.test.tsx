import { render, fireEvent } from "@testing-library/react";
import React from "react";
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

  // The pointer route above cannot stand in for this one. `useOutsideClick`
  // listens on `document` in the bubble phase while the trigger's mousedown
  // calls stopPropagation, so neither route was closing anything -- but they
  // fail for different reasons and a fix could repair one alone.
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
});
