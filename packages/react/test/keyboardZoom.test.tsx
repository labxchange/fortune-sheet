import { render, fireEvent } from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";

describe("Zoom control keyboard accessibility", () => {
  it("Enter on zoom in/out changes the displayed ratio", () => {
    const { getByRole, getByText } = render(
      <Workbook data={[{ name: "Sheet1" }]} />
    );
    expect(getByText("100%")).toBeTruthy();

    const zoomInButton = getByRole("button", { name: "Zoom in" });
    zoomInButton.focus();
    fireEvent.keyDown(zoomInButton, { key: "Enter" });
    expect(getByText("110%")).toBeTruthy();

    const zoomOutButton = getByRole("button", { name: "Zoom out" });
    zoomOutButton.focus();
    fireEvent.keyDown(zoomOutButton, { key: " " });
    fireEvent.keyDown(zoomOutButton, { key: " " });
    expect(getByText("90%")).toBeTruthy();
  });

  it("Enter opens the ratio menu and Escape closes it, restoring focus", () => {
    const { getByText, queryByText } = render(
      <Workbook data={[{ name: "Sheet1" }]} />
    );
    const ratioTrigger = getByText("100%");
    ratioTrigger.focus();
    fireEvent.keyDown(ratioTrigger, { key: "Enter" });

    // presets are listed 10%, 30%, 50%... so the first preset (10%) autofocuses
    const preset = getByText("10%").closest('[role="button"]') as HTMLElement;
    expect(document.activeElement).toBe(preset);

    fireEvent.keyDown(preset, { key: "Escape" });
    expect(queryByText("10%")).toBeNull();
    expect(document.activeElement).toBe(ratioTrigger);
  });
});
