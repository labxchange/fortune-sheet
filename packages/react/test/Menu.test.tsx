import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import Menu from "../src/components/ContextMenu/Menu";

describe("Menu", () => {
  // The row itself is the focusable element (tabIndex={0}); the inner content
  // div that getByText returns is not, so it can never be the target of a real
  // keypress. Dispatching on it also made the auto-repeat test below pass
  // vacuously — it would have passed with no handler at all.
  const row = (text: string) =>
    screen.getByText(text).closest(".luckysheet-cols-menuitem") as HTMLElement;

  it("fires onClick on Enter", () => {
    const onClick = jest.fn();
    render(<Menu onClick={onClick}>Sort A-Z</Menu>);

    fireEvent.keyDown(row("Sort A-Z"), { key: "Enter" });

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("fires onClick on Space", () => {
    const onClick = jest.fn();
    render(<Menu onClick={onClick}>Sort A-Z</Menu>);

    fireEvent.keyDown(row("Sort A-Z"), { key: " " });

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("ignores auto-repeat so a held key does not fire repeatedly", () => {
    const onClick = jest.fn();
    render(<Menu onClick={onClick}>Sort A-Z</Menu>);

    fireEvent.keyDown(row("Sort A-Z"), { key: "Enter", repeat: true });

    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not activate the row when Enter is pressed inside a nested field", () => {
    const onClick = jest.fn();
    const { container } = render(
      <Menu onClick={onClick}>
        <input type="text" defaultValue="1" />
      </Menu>
    );
    const input = container.querySelector("input")!;

    // Without the target/currentTarget guard in activateOnEnterOrSpace, the
    // keypress bubbles to the row's handler and both types and activates —
    // e.g. Enter in "insert 3 rows" would submit the row it is nested in.
    input.focus();
    const notPrevented = fireEvent.keyDown(input, { key: "Enter" });

    expect(onClick).not.toHaveBeenCalled();
    // and the field keeps the key: not preventDefault'ed, not swallowed
    expect(notPrevented).toBe(true);
  });

  it("exposes no role by default, so nested inputs keep their semantics", () => {
    const { container } = render(
      <Menu onClick={() => {}}>
        <input type="text" defaultValue="1" />
      </Menu>
    );

    expect(container.querySelector("[role]")).toBeNull();
    expect(container.querySelector("input")).not.toBeNull();
  });

  it("exposes role and expanded state when asked", () => {
    render(
      <Menu onClick={() => {}} role="button" expanded={false}>
        Filter by values
      </Menu>
    );

    const button = screen.getByRole("button", { name: "Filter by values" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("omits aria-expanded on rows that are not disclosures", () => {
    render(
      <Menu onClick={() => {}} role="button">
        Sort A-Z
      </Menu>
    );

    const button = screen.getByRole("button", { name: "Sort A-Z" });
    expect(button.hasAttribute("aria-expanded")).toBe(false);
  });
});
