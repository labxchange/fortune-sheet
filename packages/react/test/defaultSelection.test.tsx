import { act, fireEvent, render } from "@testing-library/react";
import React from "react";
import Workbook, { WorkbookInstance } from "../src/components/Workbook";

// A sheet that carries no saved selection gets one on mount, and it used to be
// written as `{ row: [0], column: [0] }` — a one-element range, so `row[1]` was
// undefined. `normalizeSelection` fills only the focus cell, so every
// `for (r = row[0]; r <= row[1]; r += 1)` in core ran zero times: on a freshly
// mounted sheet the toolbar did nothing whatsoever, and every control read as
// broken until the user clicked a cell. These pin the range as a real cell.

describe("the selection a sheet mounts with", () => {
  const flush = async () => {
    await act(async () => {
      await Promise.resolve();
    });
  };

  const renderSheet = (props: Record<string, unknown> = {}) => {
    const ref = React.createRef<WorkbookInstance>();
    const view = render(
      <Workbook
        ref={ref}
        lang="en"
        // Deliberately no `luckysheet_select_save`: that is what makes the
        // mount effect supply one.
        data={[{ name: "Sheet1", id: "s1", row: 10, column: 6 }]}
        {...props}
      />
    );
    return { ...view, ref };
  };

  it("covers a whole cell rather than only the range's start", async () => {
    const { ref } = renderSheet();
    await flush();

    expect(ref.current?.getSelection()).toMatchObject([
      { row: [0, 0], column: [0, 0] },
    ]);
  });

  it("is usable by the toolbar without clicking a cell first", async () => {
    // The announcement is the assertion: `announceAfterCommit` speaks only when
    // the sheet actually moved, so "Bold on." is proof the action reached A1.
    // With a one-element range this was silent, because nothing was written.
    const { container, getByRole } = renderSheet({ toolbarItems: ["bold"] });
    await flush();

    act(() => {
      fireEvent.click(getByRole("button", { name: "Bold (Ctrl+B)" }));
    });
    await flush();

    // Resolved non-optionally: `?.textContent` on a missing region would make
    // this pass with the live region deleted outright.
    const region = container.querySelector("#sr-toolbar")!;
    expect(region.textContent).toContain("Bold on.");
  });

  it("still opens with the arrow-key intro, and drops it once moved", async () => {
    // The intro used to be reached by asking whether `rangeText` contained
    // `NaN` — which it did only because the mount selection was malformed. Now
    // that it is a real cell, the intro is asked for directly: shown until the
    // selection moves, replaced by the cell's value afterwards.
    const { container, ref } = renderSheet();
    await flush();

    const region = container.querySelector("#sr-selection")!;
    expect(region.textContent).toContain("Use the arrow keys");

    act(() => {
      ref.current?.setSelection([{ row: [1, 1], column: [0, 0] }]);
    });
    await flush();

    expect(region.textContent).not.toContain("Use the arrow keys");
  });

  it("writes the region once on the first move, not the intro and then the value", async () => {
    // `selectionHasMoved` used to latch in a passive effect keyed on the
    // reference, and a passive effect runs after the commit that carried it —
    // so the render that already said "A2" still said "Use the arrow keys",
    // and the value arrived in a second commit. One ArrowDown, two assertive
    // announcements, the first of them the message the flag exists to retire.
    const { container, ref } = renderSheet();
    await flush();

    const region = container.querySelector("#sr-selection")!;
    const writes: string[] = [];
    const observer = new MutationObserver(() => {
      writes.push(region.textContent ?? "");
    });
    observer.observe(region, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    act(() => {
      ref.current?.setSelection([{ row: [1, 1], column: [0, 0] }]);
    });
    await flush();
    await flush();
    observer.disconnect();

    // The move is announced, and announced once.
    expect(writes.length).toBe(1);
    // And what it announced was never the intro.
    expect(writes.filter((w) => w.includes("Use the arrow keys"))).toEqual([]);
  });

  it("does not repeat the intro when a sheet is left and returned to", async () => {
    // The intro used to be cleared on every sheet switch, which made hopping
    // between two sheets re-read "use the arrow keys" in place of the cell
    // value — every time, on a region a screen reader cannot skip, for a move
    // as ordinary as comparing two sheets. Upstream always spoke the value
    // here, because its only trigger was a malformed range.
    const { container, ref } = renderSheet({
      data: [
        { name: "Sheet1", id: "s1", row: 10, column: 6 },
        { name: "Sheet2", id: "s2", row: 10, column: 6 },
      ],
    });
    await flush();

    const region = container.querySelector("#sr-selection")!;
    expect(region.textContent).toContain("Use the arrow keys");

    act(() => {
      ref.current?.setSelection([{ row: [1, 1], column: [0, 0] }]);
    });
    await flush();
    expect(region.textContent).not.toContain("Use the arrow keys");

    act(() => {
      ref.current?.activateSheet({ id: "s2" });
    });
    await flush();
    expect(region.textContent).not.toContain("Use the arrow keys");

    act(() => {
      ref.current?.activateSheet({ id: "s1" });
    });
    await flush();
    expect(region.textContent).not.toContain("Use the arrow keys");
  });

  it("leaves a sheet that brought its own selection alone", async () => {
    const { ref } = renderSheet({
      data: [
        {
          name: "Sheet1",
          id: "s1",
          row: 10,
          column: 6,
          luckysheet_select_save: [
            { row: [2, 3], column: [1, 1], row_focus: 2, column_focus: 1 },
          ],
        },
      ],
    });
    await flush();

    expect(ref.current?.getSelection()).toMatchObject([
      { row: [2, 3], column: [1, 1] },
    ]);
  });
});
