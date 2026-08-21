import { render, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";

// A sheet with a filter already applied to A1:B2, so the funnel buttons render.
const dataWithFilter = [
  {
    name: "Sheet1",
    celldata: [
      {
        r: 0,
        c: 0,
        v: { v: "Name", m: "Name", ct: { fa: "General", t: "s" } },
      },
      {
        r: 0,
        c: 1,
        v: { v: "Size", m: "Size", ct: { fa: "General", t: "s" } },
      },
      { r: 1, c: 0, v: { v: "a", m: "a", ct: { fa: "General", t: "s" } } },
      { r: 1, c: 1, v: { v: "1", m: "1", ct: { fa: "General", t: "n" } } },
    ],
    filter_select: { row: [0, 1], column: [0, 1] },
  },
];

const funnels = () =>
  Array.from(
    document.querySelectorAll<HTMLElement>(".luckysheet-filter-options")
  );

describe("Filter funnel keyboard accessibility", () => {
  it("exposes each funnel as a button that names its column", async () => {
    render(<Workbook data={dataWithFilter} />);

    await waitFor(() => expect(funnels().length).toBeGreaterThan(0));

    const [first] = funnels();
    expect(first.getAttribute("role")).toBe("button");
    expect(first.getAttribute("aria-haspopup")).toBe("menu");
    expect(first.getAttribute("aria-expanded")).toBe("false");
    expect(first.getAttribute("aria-label")).toContain("A");
  });

  it("opens the dropdown on Enter", async () => {
    // A div with only onClick never fires on Enter, so before this the funnel
    // was focusable but could not be operated by keyboard at all.
    render(<Workbook data={dataWithFilter} />);
    await waitFor(() => expect(funnels().length).toBeGreaterThan(0));

    const [first] = funnels();
    first.focus();
    fireEvent.keyDown(first, { key: "Enter" });

    await waitFor(() =>
      expect(document.querySelector(".fortune-filter-menu")).toBeTruthy()
    );
  });

  it("opens the dropdown on Space", async () => {
    render(<Workbook data={dataWithFilter} />);
    await waitFor(() => expect(funnels().length).toBeGreaterThan(0));

    const [first] = funnels();
    first.focus();
    fireEvent.keyDown(first, { key: " " });

    await waitFor(() =>
      expect(document.querySelector(".fortune-filter-menu")).toBeTruthy()
    );
  });

  it("reports the open state back on the funnel", async () => {
    render(<Workbook data={dataWithFilter} />);
    await waitFor(() => expect(funnels().length).toBeGreaterThan(0));

    const [first] = funnels();
    first.focus();
    fireEvent.keyDown(first, { key: "Enter" });

    await waitFor(() =>
      expect(funnels()[0].getAttribute("aria-expanded")).toBe("true")
    );
  });
});
