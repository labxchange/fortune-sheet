import { render, act, fireEvent } from "@testing-library/react";
import React from "react";
import { virtual } from "@guidepup/virtual-screen-reader";
import Workbook, { WorkbookInstance } from "../src/components/Workbook";

/**
 * What a screen reader actually says, rather than which attributes are set.
 *
 * Every other suite here asserts one layer removed from the requirement: that
 * `role="scrollbar"` is present, not that the thing is announced as a scrollbar
 * rather than as "group". This one closes that gap as far as it can be closed
 * without a real screen reader — the virtual reader resolves the accessibility
 * tree and composes the announcement the way the ARIA spec says to, so it
 * catches a wrong role, a missing name, a value that reads as nonsense, and a
 * live region that is assertive when it should be polite.
 *
 * It is a model of the spec, not VoiceOver or NVDA, so it does not replace the
 * manual pass on either — it just means the manual pass is confirming platform
 * behaviour rather than discovering that the name was missing all along.
 */

const celldata = [];
for (let r = 0; r <= 5; r += 1) {
  for (let c = 0; c <= 5; c += 1) {
    celldata.push({ r, c, v: { v: `r${r}c${c}`, m: `r${r}c${c}` } });
  }
}
const sheet = { name: "Sheet1", id: "s1", celldata, row: 10, column: 8 };

describe("what a screen reader announces", () => {
  let ref: React.RefObject<WorkbookInstance>;
  let container: HTMLElement;

  /** Everything spoken while walking the given subtree, start to end. */
  const readAll = async (root: Element) => {
    await virtual.start({ container: root as HTMLElement });
    const seen: string[] = [];
    for (let i = 0; i < 40; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const phrase = await virtual.lastSpokenPhrase();
      if (seen.length && phrase === seen[seen.length - 1]) break;
      seen.push(phrase);
      // eslint-disable-next-line no-await-in-loop
      await virtual.next();
    }
    await virtual.stop();
    return seen;
  };

  beforeEach(() => {
    ref = React.createRef<WorkbookInstance>();
    container = render(
      <Workbook ref={ref} lang="en" data={[sheet as any]} />
    ).container;
  });

  afterEach(async () => {
    await virtual.stop();
  });

  it("announces the name box as an edit field with its name and value", async () => {
    const spoken = await readAll(
      container.querySelector(".fortune-name-box-container")!
    );
    const nameBox = spoken.find((p) => p.includes("Name box"));
    // An edit field, not static text — and carrying the reference it holds.
    expect(nameBox).toContain("textbox");
    expect(nameBox).toContain("A1");
    expect(nameBox).not.toContain("NaN");
  });

  it("announces the select-all corner as a button with its name", async () => {
    const spoken = await readAll(
      container.querySelector(".fortune-col-header-wrap")!
    );
    expect(spoken.some((p) => p.includes("button, Select all cells"))).toBe(
      true
    );
  });

  it.each([
    ["x", "orientated horizontally", "Column"],
    ["y", "orientated vertically", "Row"],
  ])(
    "announces the %s scroll control as a scrollbar, not a group",
    async (axis, orientation, position) => {
      const spoken = await readAll(
        container.querySelector(`.luckysheet-scrollbar-${axis}`)!
      );
      const bar = spoken.find((p) => p.includes("scrollbar"));
      expect(bar).toBeDefined();
      // The finding this change exists to fix: they announced as "group".
      expect(bar).not.toContain("group");
      expect(bar).toContain(orientation);
      // Named for what it scrolls, and positioned by row/column rather than by
      // a pixel offset.
      expect(bar).toContain("Spreadsheet");
      expect(bar).toContain(position);
      // The role and orientation come from the role itself; repeating them in
      // the name is what made VoiceOver say "horizontal scroll bar" twice.
      expect(bar!.match(/scrollbar/g)).toHaveLength(1);
      expect(
        bar!.toLowerCase().match(new RegExp(orientation.split(" ")[1], "g"))
      ).toHaveLength(1);
    }
  );

  it("speaks the select-all announcement politely", async () => {
    await virtual.start({ container: container.querySelector("main")! });
    await act(async () => {
      fireEvent.click(
        container.querySelector<HTMLElement>(".fortune-left-top")!
      );
    });
    const spoken = await virtual.spokenPhraseLog();
    // Politely: the grid's own cell description is an alert, and this must
    // queue behind it rather than cut it off.
    expect(spoken).toContain("polite: All cells selected.");
    expect(spoken).not.toContain("assertive: All cells selected.");
  });

  it("speaks a repeated select-all both times", async () => {
    await virtual.start({ container: container.querySelector("main")! });
    const corner = container.querySelector<HTMLElement>(".fortune-left-top")!;
    await act(async () => {
      fireEvent.click(corner);
    });
    await act(async () => {
      fireEvent.click(corner);
    });
    const spoken = await virtual.spokenPhraseLog();
    const announcements = spoken.filter((p) =>
      p.replace(/\u200B/g, "").includes("polite: All cells selected.")
    );
    // A live region is silent when written the same text twice running; the
    // zero-width space is what makes the second write a change.
    expect(announcements).toHaveLength(2);
  });
});
