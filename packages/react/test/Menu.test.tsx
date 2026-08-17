import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import Menu from "../src/components/ContextMenu/Menu";

describe("Menu", () => {
  it("fires onClick on Enter", () => {
    const onClick = jest.fn();
    render(<Menu onClick={onClick}>Sort A-Z</Menu>);

    fireEvent.keyDown(screen.getByText("Sort A-Z"), { key: "Enter" });

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("fires onClick on Space", () => {
    const onClick = jest.fn();
    render(<Menu onClick={onClick}>Sort A-Z</Menu>);

    fireEvent.keyDown(screen.getByText("Sort A-Z"), { key: " " });

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("ignores auto-repeat so a held key does not fire repeatedly", () => {
    const onClick = jest.fn();
    render(<Menu onClick={onClick}>Sort A-Z</Menu>);

    fireEvent.keyDown(screen.getByText("Sort A-Z"), {
      key: "Enter",
      repeat: true,
    });

    expect(onClick).not.toHaveBeenCalled();
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
