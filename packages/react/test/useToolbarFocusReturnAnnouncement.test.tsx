import { renderHook } from "@testing-library/react";

import { useToolbarFocusReturnAnnouncement } from "../src/hooks/useToolbarFocusReturnAnnouncement";

/** Drive the hook through a sequence of (count, cellText) pairs. */
function driveFrom(count: number | undefined, cellText: string) {
  const { result, rerender } = renderHook(
    ({ count: c, cellText: t }: { count?: number; cellText: string }) =>
      useToolbarFocusReturnAnnouncement(c, t),
    { initialProps: { count, cellText } }
  );
  return {
    result,
    move: (nextCount: number | undefined, nextCellText: string) => {
      rerender({ count: nextCount, cellText: nextCellText });
      return result.current;
    },
  };
}

describe("useToolbarFocusReturnAnnouncement", () => {
  it("says nothing on first paint", () => {
    const { result } = driveFrom(0, "B. 5 hello");
    expect(result.current).toBe("");
  });

  it("says nothing when a workbook restores mid-session with a non-zero count", () => {
    // The first observation is always the baseline, whatever value it holds --
    // otherwise a restored session would announce a return nobody just made.
    const { result } = driveFrom(3, "B. 5 hello");
    expect(result.current).toBe("");
  });

  it("announces the cell once the count actually bumps", () => {
    const { move } = driveFrom(0, "B. 5 hello");
    expect(move(1, "B. 5 hello")).toBe("B. 5 hello");
  });

  it("does not announce again on an unrelated rerender", () => {
    const { move } = driveFrom(0, "B. 5 hello");
    move(1, "B. 5 hello");
    // Same count, same text -- nothing happened, so nothing new should speak.
    expect(move(1, "B. 5 hello")).toBe("B. 5 hello");
  });

  it("speaks a second return to the same cell, distinguishably", () => {
    const { move } = driveFrom(0, "B. 5 hello");
    const first = move(1, "B. 5 hello");
    const second = move(2, "B. 5 hello");
    // Landing back on the same cell twice running -- e.g. Bold then Italic --
    // is a real return each time and must speak both times, not just once. A
    // live region only speaks on a text *change*, so identical text needs the
    // zero-width-space alternation to force a difference.
    expect(second).not.toBe(first);
    expect(second.replace(/\u200B/g, "")).toBe(first.replace(/\u200B/g, ""));
  });

  it("carries whatever cell text the count bump lands on", () => {
    const { move } = driveFrom(0, "B. 5 hello");
    expect(move(1, "C. 9 world")).toBe("C. 9 world");
  });

  it("treats an undefined count the same as zero", () => {
    const { move } = driveFrom(undefined, "A. 1 x");
    expect(move(1, "A. 1 x")).toBe("A. 1 x");
  });
});
