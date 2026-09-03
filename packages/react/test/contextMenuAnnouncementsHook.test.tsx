import { render, act, screen } from "@testing-library/react";
import React from "react";
import { Context } from "@fortune-sheet/core";
import useContextMenuAnnouncements, {
  CONTEXT_MENU_REGION_ID_SUFFIX,
} from "../src/hooks/useContextMenuAnnouncements";

// The hook's own rules, exercised without a workbook.
//
// Everything else that touches announcements goes through a rendered `Workbook`,
// which is the right level for "does this row announce" but leaves the hook's
// two time-dependent rules — the clear after a few seconds, and the alternating
// zero-width space — untestable in practice: fake timers cannot be installed
// before a render whose layout is driven by rAF and setTimeout, and the real
// 4-second wait would be the slowest case in the suite by an order of magnitude.
//
// A harness instead. It stands in for `SheetOverlay`: it renders the region at
// the id the hook hands back and holds the element the hook writes
// `aria-describedby` onto, which is the whole of the contract.

const CELL = "cell";

const Harness: React.FC<{ request?: Context["contextMenuAnnouncement"] }> = ({
  request,
}) => {
  const cellRef = React.useRef<HTMLDivElement>(null);
  const { regionId, announcement } = useContextMenuAnnouncements(
    { lang: "en", contextMenuAnnouncement: request } as unknown as Context,
    cellRef
  );
  return (
    <>
      <div id={regionId} role="alert" data-testid="region">
        {announcement}
      </div>
      <div ref={cellRef} data-testid={CELL} />
    </>
  );
};

/**
 * The cell input **outlives** the hook, which is the real topology: `cellInput`
 * is a workbook-level ref, so `SheetOverlay` unmounting does not take it with
 * it. A harness that unmounts both together cannot see an attribute left
 * pointing at a region that is gone.
 */
const Region: React.FC<{
  request?: Context["contextMenuAnnouncement"];
  cellRef: React.RefObject<HTMLElement | null>;
}> = ({ request, cellRef }) => {
  const { regionId, announcement } = useContextMenuAnnouncements(
    { lang: "en", contextMenuAnnouncement: request } as unknown as Context,
    cellRef
  );
  return (
    <div id={regionId} role="alert" data-testid="region">
      {announcement}
    </div>
  );
};

const SplitHarness: React.FC<{
  request?: Context["contextMenuAnnouncement"];
  regionMounted?: boolean;
}> = ({ request, regionMounted = true }) => {
  const cellRef = React.useRef<HTMLDivElement>(null);
  return (
    <>
      {regionMounted && <Region request={request} cellRef={cellRef} />}
      <div ref={cellRef} data-testid={CELL} />
    </>
  );
};

const copied = (seq: number) => ({ key: "rightclick.announceCopied", seq });

const region = () => screen.getByTestId("region");
const cell = () => screen.getByTestId(CELL);

describe("useContextMenuAnnouncements", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("writes the result and points the cell input at it", () => {
    render(<Harness request={copied(1)} />);

    expect(region().textContent).toBe("Selection copied.");
    // Resolved the way an assistive technology resolves an IDREF, so a
    // description naming an id that is not this region fails here.
    const describedBy = cell().getAttribute("aria-describedby");
    expect(document.getElementById(describedBy!)).toBe(region());
  });

  it("clears the result and the description after a few seconds", () => {
    // `CLEAR_AFTER_MS` exists so that returning to the same cell minutes later
    // does not hear the last action's result read as the cell's description. It
    // had no coverage: every other announcement case asserts on the settled DOM
    // well inside the window, so the region emptying was never observed.
    render(<Harness request={copied(1)} />);
    expect(region().textContent).toBe("Selection copied.");

    act(() => {
      jest.advanceTimersByTime(3999);
    });
    // Still readable a tick before the deadline — otherwise this case would
    // pass against a hook that cleared immediately.
    expect(region().textContent).toBe("Selection copied.");
    expect(cell().getAttribute("aria-describedby")).not.toBeNull();

    act(() => {
      jest.advanceTimersByTime(1);
    });

    expect(region().textContent).toBe("");
    // Both halves: text alone would leave the cell input describing an empty
    // element, which VoiceOver reads as a trailing "blank".
    expect(cell().getAttribute("aria-describedby")).toBeNull();
  });

  it("cancels the pending clear when the tree unmounts", () => {
    // The effect returns `clearTimeout`, so React runs it on unmount and there
    // is no 4-second timer left holding a `setAnnouncement` on a gone tree.
    // Asserted by advancing past the deadline after unmounting: an uncancelled
    // timer would fire its callback here.
    const { unmount } = render(<Harness request={copied(1)} />);
    // One timer armed, then none: checked *before* advancing, since advancing
    // drains the queue and would leave the count at zero either way.
    expect(jest.getTimerCount()).toBe(1);
    unmount();
    expect(jest.getTimerCount()).toBe(0);
  });

  it("takes the description off the cell input when the region goes away", () => {
    // Cancelling the timer is not enough on its own, and asserting only the
    // timer count is what made it look enough. `cellInputRef` is owned by the
    // workbook, so it survives this hook unmounting inside the 4s window — and
    // an `aria-describedby` left behind then names an element that no longer
    // exists. Readers resolve that to nothing, or fall back to the control's
    // own name; neither is the description this is here to provide.
    const { rerender } = render(<SplitHarness request={copied(1)} />);
    const describedBy = cell().getAttribute("aria-describedby");
    expect(document.getElementById(describedBy!)).not.toBeNull();

    rerender(<SplitHarness request={copied(1)} regionMounted={false} />);

    expect(screen.queryByTestId("region")).toBeNull();
    expect(cell().getAttribute("aria-describedby")).toBeNull();
  });

  it("still describes the cell input after a second result", () => {
    // The guard on the fix above: the cleanup runs on a `seq` change too, so
    // removing the attribute there must not outlive the next effect body
    // re-adding it. React's order — cleanup, then the new effect — is what
    // makes that safe, and this is the case that would catch it inverting.
    const { rerender } = render(<SplitHarness request={copied(1)} />);
    rerender(<SplitHarness request={copied(2)} />);

    const describedBy = cell().getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toBe(region());
  });

  it("restarts the window when a second result arrives", () => {
    // The cleanup runs on a `seq` change too, so the second result gets a full
    // window rather than inheriting the remainder of the first one's.
    const { rerender } = render(<Harness request={copied(1)} />);
    act(() => {
      jest.advanceTimersByTime(3500);
    });
    rerender(<Harness request={copied(2)} />);

    act(() => {
      jest.advanceTimersByTime(3500);
    });
    expect(region().textContent).toContain("Selection copied.");

    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(region().textContent).toBe("");
  });

  it("makes a repeated result differ so a reader speaks it twice", () => {
    const { rerender } = render(<Harness request={copied(1)} />);
    const first = region().textContent;
    rerender(<Harness request={copied(2)} />);
    const second = region().textContent;

    // Identical text is a no-op to a live region. The hook alternates a
    // zero-width space, which no reader speaks and which no test asserting
    // `toContain` would notice missing.
    expect(first).toBe("Selection copied.");
    expect(second).not.toBe(first);
    expect(second).toContain("Selection copied.");
    // Escaped, not literal: a bare ZWSP in source is invisible and `eslint`
    // rejects it outright (`no-irregular-whitespace`).
    expect(second!.replace(/\u200b/g, "")).toBe(first);
  });

  it("stays silent on a key that does not resolve", () => {
    // The fallback branch, and the reason `announce`'s key is typed: reaching
    // this is a WCAG 4.1.3 failure with nothing to notice at runtime. Cast
    // because the type is what makes it unreachable from real callers.
    render(<Harness request={{ key: "rightclick.nope", seq: 1 } as any} />);

    expect(region().textContent).toBe("");
    expect(cell().getAttribute("aria-describedby")).toBeNull();
  });

  it("interpolates params rather than rendering the template", () => {
    render(
      <Harness
        request={{
          key: "rightclick.announceColumnsInsertedLeft",
          params: { count: 3 },
          seq: 1,
        }}
      />
    );

    expect(region().textContent).toBe("3 columns inserted to the left.");
    expect(region().textContent).not.toContain("${count}");
  });

  it("gives each instance its own region id", () => {
    // The five-workbooks-per-page case, at the level the id is generated. An
    // `aria-describedby` IDREF resolves to the *first* match in the document,
    // so two instances sharing an id means one of them describes the other's
    // region.
    render(
      <>
        <Harness request={copied(1)} />
        <Harness request={copied(1)} />
      </>
    );

    const ids = screen.getAllByTestId("region").map((el) => el.id);
    expect(ids[0]).not.toBe(ids[1]);
    ids.forEach((id) => expect(id).toContain(CONTEXT_MENU_REGION_ID_SUFFIX));
    const describedBy = screen
      .getAllByTestId(CELL)
      .map((el) => el.getAttribute("aria-describedby"));
    expect(describedBy[0]).toBe(ids[0]);
    expect(describedBy[1]).toBe(ids[1]);
  });
});
