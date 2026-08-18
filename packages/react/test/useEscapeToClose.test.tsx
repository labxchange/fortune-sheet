import { render, fireEvent } from "@testing-library/react";
import React, { useRef, useState } from "react";
import { useEscapeToClose } from "../src/hooks/useEscapeToClose";

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
});
