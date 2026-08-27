import { render, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";
import Workbook, { WorkbookInstance } from "../src/components/Workbook";

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
    // Named after the header cell ("Name" in A1) rather than by column letter:
    // a row of funnels distinguished only by letter is far less use by ear than
    // one named by the header the user reads. The letter remains the fallback
    // for a blank header, covered in filter-criterion-ui.test.tsx.
    expect(first.getAttribute("aria-label")).toBe("Filter Name.");
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

  // The React half of the Ctrl+Cmd+R shortcut. core's keyboardShortcuts suite
  // asserts only that the keypress sets `openFilterMenuForColumn`; nothing
  // covered the effect that consumes it and opens the funnel. That effect is
  // also where this branch changed two things at once — the funnel is addressed
  // through findFilterFunnel rather than a ref map, and the click it dispatches
  // now runs a toggle — so a break here would be silent.
  it("opens the requested column's dropdown when the shortcut asks for it", async () => {
    const ref = React.createRef<WorkbookInstance>();
    const { container } = render(
      <Workbook ref={ref} lang="en" data={dataWithFilter} />
    );
    await waitFor(() => expect(funnels().length).toBeGreaterThan(0));

    act(() => {
      ref.current?.setSelection([{ row: [0, 0], column: [1, 1] }]);
    });
    const cellInput = container.querySelector<HTMLElement>(
      "#luckysheet-rich-text-editor"
    )!;
    act(() => {
      cellInput.focus();
      fireEvent.keyDown(cellInput, {
        key: "r",
        code: "KeyR",
        ctrlKey: true,
        metaKey: true,
      });
    });

    await waitFor(() =>
      expect(document.querySelector(".fortune-filter-menu")).toBeTruthy()
    );
    // Column B's funnel, not column A's: the request carries a column and the
    // lookup has to honour it.
    const funnel = funnels().find(
      (f) => f.getAttribute("data-filter-col") === "1"
    )!;
    expect(funnel.getAttribute("aria-expanded")).toBe("true");
    expect(funnel.getAttribute("aria-controls")).toBe("fortune-filter-menu");
    // The effect focuses the funnel, then the popup's own autoFocus takes over
    // and moves into the menu — which is the useful end state for someone who
    // just asked for the menu by keyboard, and the reason Escape can bring them
    // back to the funnel.
    const popup = document.querySelector(".fortune-filter-menu")!;
    expect(popup.contains(document.activeElement)).toBe(true);
  });
});
