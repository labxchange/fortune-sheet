import { render, fireEvent } from "@testing-library/react";
import React, { useRef } from "react";
import { useRovingFocus } from "../src/hooks/useRovingFocus";

const VerticalList: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  useRovingFocus({ containerRef, orientation: "vertical" });
  return (
    <div ref={containerRef}>
      <div role="button" tabIndex={0}>
        Item 1
      </div>
      <div role="button" tabIndex={0} aria-disabled="true">
        Item 2 (disabled)
      </div>
      <div role="button" tabIndex={0}>
        Item 3
      </div>
    </div>
  );
};

const HorizontalList: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  useRovingFocus({ containerRef, orientation: "horizontal" });
  return (
    <div ref={containerRef}>
      <div role="button" tabIndex={0}>
        Tab 1
      </div>
      <div role="button" tabIndex={0}>
        Tab 2
      </div>
    </div>
  );
};

const ListWithTextEntry: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  useRovingFocus({ containerRef, orientation: "horizontal" });
  return (
    <div ref={containerRef}>
      <div role="button" tabIndex={0}>
        <span
          contentEditable
          suppressContentEditableWarning
          data-testid="rename-field"
        >
          Sheet1
        </span>
      </div>
      <div role="button" tabIndex={0}>
        Tab 2
      </div>
    </div>
  );
};

const Grid: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  useRovingFocus({ containerRef, orientation: "grid", columns: 3 });
  return (
    <div ref={containerRef}>
      {Array.from({ length: 6 }).map((_, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <div role="button" tabIndex={0} key={i}>
          {`Cell ${i}`}
        </div>
      ))}
    </div>
  );
};

describe("useRovingFocus", () => {
  it("moves focus down and wraps, skipping disabled items", () => {
    const { getByText } = render(<VerticalList />);
    const item1 = getByText("Item 1");
    const item3 = getByText("Item 3");
    item1.focus();
    fireEvent.keyDown(item1, { key: "ArrowDown" });
    // Item 2 is aria-disabled, so focus skips straight to Item 3
    expect(document.activeElement).toBe(item3);
    fireEvent.keyDown(item3, { key: "ArrowDown" });
    // wraps back to the first enabled item
    expect(document.activeElement).toBe(item1);
  });

  it("moves focus up and wraps backward", () => {
    const { getByText } = render(<VerticalList />);
    const item1 = getByText("Item 1");
    const item3 = getByText("Item 3");
    item1.focus();
    fireEvent.keyDown(item1, { key: "ArrowUp" });
    expect(document.activeElement).toBe(item3);
  });

  it("horizontal orientation responds to left/right arrows", () => {
    const { getByText } = render(<HorizontalList />);
    const tab1 = getByText("Tab 1");
    const tab2 = getByText("Tab 2");
    tab1.focus();
    fireEvent.keyDown(tab1, { key: "ArrowRight" });
    expect(document.activeElement).toBe(tab2);
    fireEvent.keyDown(tab2, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(tab1);
  });

  it("grid orientation wraps horizontally and clamps vertically", () => {
    const { getByText } = render(<Grid />);
    const cell0 = getByText("Cell 0");
    const cell2 = getByText("Cell 2");
    const cell3 = getByText("Cell 3");
    cell2.focus();
    // wraps to the start of the same row
    fireEvent.keyDown(cell2, { key: "ArrowRight" });
    expect(document.activeElement).toBe(cell0);
    fireEvent.keyDown(cell0, { key: "ArrowDown" });
    expect(document.activeElement).toBe(cell3);
    // no row above the first row: clamps instead of wrapping
    cell0.focus();
    fireEvent.keyDown(cell0, { key: "ArrowUp" });
    expect(document.activeElement).toBe(cell0);
  });

  it("Home/End jump to the first/last item", () => {
    const { getByText } = render(<HorizontalList />);
    const tab1 = getByText("Tab 1");
    const tab2 = getByText("Tab 2");
    tab1.focus();
    fireEvent.keyDown(tab1, { key: "End" });
    expect(document.activeElement).toBe(tab2);
    fireEvent.keyDown(tab2, { key: "Home" });
    expect(document.activeElement).toBe(tab1);
  });

  it("does not hijack arrow/Home/End keys from a contentEditable field, but still roves from a plain item", () => {
    const { getByTestId, getByText } = render(<ListWithTextEntry />);
    const renameField = getByTestId("rename-field");
    const tab2 = getByText("Tab 2");

    renameField.focus();
    fireEvent.keyDown(renameField, { key: "ArrowRight" });
    expect(document.activeElement).toBe(renameField);
    fireEvent.keyDown(renameField, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(renameField);
    fireEvent.keyDown(renameField, { key: "End" });
    expect(document.activeElement).toBe(renameField);
    fireEvent.keyDown(renameField, { key: "Home" });
    expect(document.activeElement).toBe(renameField);

    // the guard only exempts text-entry targets; roving still works from a
    // plain item in the same container
    tab2.focus();
    fireEvent.keyDown(tab2, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(renameField.closest('[role="button"]'));
  });
});
