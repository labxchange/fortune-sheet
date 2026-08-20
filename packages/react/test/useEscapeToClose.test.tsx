import { render, fireEvent } from "@testing-library/react";
import React, { useRef, useState } from "react";
import { useEscapeToClose } from "../src/hooks/useEscapeToClose";
import { useOutsideClick } from "../src/hooks/useOutsideClick";

const Harness: React.FC = () => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useEscapeToClose({
    open,
    onClose: () => setOpen(false),
    containerRef,
  });
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Trigger
      </button>
      {open && (
        <div ref={containerRef}>
          <div role="button" tabIndex={0}>
            First
          </div>
          <div role="button" tabIndex={0}>
            Second
          </div>
        </div>
      )}
    </div>
  );
};

const NestedHarness: React.FC = () => {
  const [outerOpen, setOuterOpen] = useState(false);
  const [innerOpen, setInnerOpen] = useState(false);
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useEscapeToClose({
    open: outerOpen,
    onClose: () => setOuterOpen(false),
    containerRef: outerRef,
  });
  useEscapeToClose({
    open: innerOpen,
    onClose: () => setInnerOpen(false),
    containerRef: innerRef,
  });

  return (
    <div>
      <button type="button" onClick={() => setOuterOpen(true)}>
        Open Outer
      </button>
      {outerOpen && (
        <div ref={outerRef}>
          <div role="button" tabIndex={0}>
            Outer Item
          </div>
          <button type="button" onClick={() => setInnerOpen(true)}>
            Open Inner
          </button>
          {innerOpen && (
            <div ref={innerRef}>
              <div role="button" tabIndex={0}>
                Inner Item
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Mirrors how every real call site wires the two hooks together: opening a
// popup, then clicking outside it (e.g. a grid cell) closes it via
// useOutsideClick, entirely independent of this hook's own Escape handling.
const HarnessWithOutsideClick: React.FC = () => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useOutsideClick(containerRef, () => setOpen(false), []);
  useEscapeToClose({
    open,
    onClose: () => setOpen(false),
    containerRef,
  });
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Trigger
      </button>
      {/* Stands in for a grid cell: a real click there both takes focus and,
          via the mousedown continuing to bubble to document, triggers
          useOutsideClick's close. */}
      <button type="button" onMouseDown={(e) => e.currentTarget.focus()}>
        Elsewhere
      </button>
      {open && (
        <div ref={containerRef}>
          <div role="button" tabIndex={0}>
            First
          </div>
        </div>
      )}
    </div>
  );
};

describe("useEscapeToClose", () => {
  it("autofocuses the first item on open, and Escape closes and restores focus", () => {
    const { getByText, queryByText } = render(<Harness />);
    const trigger = getByText("Trigger");
    trigger.focus();
    fireEvent.click(trigger);

    const first = getByText("First");
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(first, { key: "Escape" });

    expect(queryByText("First")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("does nothing when closed", () => {
    const { getByText, queryByText } = render(<Harness />);
    const trigger = getByText("Trigger");
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(queryByText("First")).toBeNull();
  });

  it("Escape closes only the innermost open popup, not an outer one it's nested in", () => {
    const { getByText, queryByText } = render(<NestedHarness />);
    fireEvent.click(getByText("Open Outer"));
    expect(queryByText("Outer Item")).toBeTruthy();

    fireEvent.click(getByText("Open Inner"));
    expect(queryByText("Inner Item")).toBeTruthy();

    fireEvent.keyDown(getByText("Inner Item"), { key: "Escape" });
    expect(queryByText("Inner Item")).toBeNull();
    // the outer popup must still be open after only one Escape press
    expect(queryByText("Outer Item")).toBeTruthy();

    fireEvent.keyDown(getByText("Outer Item"), { key: "Escape" });
    expect(queryByText("Outer Item")).toBeNull();
  });

  it("does not drag focus back to the trigger when an outside click closes the popup after focus already moved elsewhere", () => {
    const { getByText, queryByText } = render(<HarnessWithOutsideClick />);
    const trigger = getByText("Trigger");
    const elsewhere = getByText("Elsewhere");

    trigger.focus();
    fireEvent.click(trigger);
    expect(document.activeElement).toBe(getByText("First"));

    fireEvent.mouseDown(elsewhere);

    expect(queryByText("First")).toBeNull();
    expect(document.activeElement).toBe(elsewhere);
  });
});
