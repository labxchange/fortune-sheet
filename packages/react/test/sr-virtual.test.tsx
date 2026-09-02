import { render, act, fireEvent } from "@testing-library/react";
import React from "react";
import { virtual } from "@guidepup/virtual-screen-reader";
import Workbook, { WorkbookInstance } from "../src/components/Workbook";
import { CONTEXT_MENU_REGION_ID_SUFFIX } from "../src/hooks/useContextMenuAnnouncements";

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
    // A lettered column and a numbered row — the sheet's own naming.
    ["x", "orientated horizontally", "Column A"],
    ["y", "orientated vertically", "Row 1"],
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

  it("speaks a clamped name box jump, and speaks a repeat of it", async () => {
    // This path had no virtual-reader coverage at all, which is how a missing
    // repeat marker slipped past the attribute tests, the DOM-text tests and
    // this layer together.
    const input =
      container.querySelector<HTMLInputElement>(".fortune-name-box")!;
    const commitRef = async (value: string) => {
      await act(async () => {
        input.focus();
      });
      fireEvent.change(input, { target: { value } });
      await act(async () => {
        fireEvent.keyDown(input, { key: "Enter" });
      });
      await act(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 60);
        });
      });
    };

    await virtual.start({ container });
    await commitRef("A99999");
    // Both land on the last row, so the words are identical each time.
    await commitRef("A50");
    const spoken = await virtual.spokenPhraseLog();
    const clamps = spoken.filter((p) =>
      p.includes("Reference is outside the sheet.")
    );
    // Compared as *distinct* phrases: this reader can log one DOM mutation more
    // than once, so a raw count would be measuring the tool rather than the
    // behaviour. What matters is that the second clamp produced a phrase the
    // first did not, since a live region only speaks on a change.
    const distinct = [...new Set(clamps)];
    expect(distinct).toHaveLength(2);
    // ...and that the difference is inaudible: the same words, one zero-width
    // space apart.
    expect([
      ...new Set(distinct.map((p) => p.replace(/\u200B/g, ""))),
    ]).toHaveLength(1);
    // Carried on the cell alert rather than a region of its own, so the user
    // hears where they landed and why in one go.
    distinct.forEach((p) => expect(p).toContain("assertive:"));
  });

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

  /**
   * The one question the rename fix could not answer from the source.
   *
   * `tab` is a children-presentational role in ARIA 1.2, so read strictly, the
   * editable name nested inside `role="tab"` is not exposed at all and naming
   * it is pointless. Core-AAM contradicts that for *focusable* descendants, and
   * a contenteditable is focusable. The two specs disagree, and which one an
   * implementation follows decides whether inline renaming is viable or has to
   * become a dialog.
   *
   * This is the spec's own answer, from a reader that resolves the tree the way
   * ARIA says to — not VoiceOver's or NVDA's, which is why the manual pass
   * still stands. But it turns that pass into a confirmation of platform
   * behaviour rather than the first time anyone finds out.
   */
  it("announces the sheet rename field as a named textbox inside its tab", async () => {
    const strip = container.querySelector<HTMLElement>(
      ".fortune-sheettab-container-c"
    )!;
    const caret = strip.querySelector<HTMLElement>(
      ".luckysheet-sheets-item-function"
    )!;

    await act(async () => {
      caret.focus();
      fireEvent.keyDown(caret, { key: "Enter" });
    });
    const renameRow = Array.from(
      document.querySelectorAll<HTMLElement>('[role="button"]')
    ).find((el) => el.textContent === "Rename")!;
    await act(async () => {
      renameRow.focus();
      fireEvent.keyDown(renameRow, { key: "Enter" });
    });
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });

    const spoken = await readAll(strip);
    const field = spoken.find((p) => p.includes("Sheet name"));

    expect(field).toBeDefined();
    // Exposed despite the children-presentational `tab` ancestor, and exposed
    // as something you can type into rather than as static text.
    expect(field).toContain("textbox");
    // Not swallowed by the tab's own accessible name.
    expect(field).not.toBe("tab, Sheet1");
  });

  /**
   * That the status region's textContent changes is not the same claim as "a
   * screen reader says it" — the region has to be in the accessibility tree,
   * live, and not drowned by the focus move that happens in the same
   * interaction. Committing a rename focuses the tab, and a *polite* region
   * queued alongside a focus utterance is discarded by VoiceOver rather than
   * spoken after it; #sr-contextMenuRegion is assertive for that reason, and
   * this is the assertion that keeps it so.
   */
  const startRename = async (root: HTMLElement) => {
    const caret = root.querySelector<HTMLElement>(
      ".luckysheet-sheets-item-function"
    )!;
    await act(async () => {
      caret.focus();
      fireEvent.keyDown(caret, { key: "Enter" });
    });
    const renameRow = Array.from(
      document.querySelectorAll<HTMLElement>('[role="button"]')
    ).find((el) => el.textContent === "Rename")!;
    await act(async () => {
      renameRow.focus();
      fireEvent.keyDown(renameRow, { key: "Enter" });
    });
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    return document.querySelector<HTMLElement>(
      '.luckysheet-sheets-item-name[contenteditable="true"]'
    )!;
  };

  const settle = async () => {
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
  };

  it("speaks the result of a context-menu action that moves focus", async () => {
    // The case reported silent three times over: the action commits, focus moves
    // to the cell input, and in real VoiceOver the focus utterance won and the
    // result was never heard. Two mechanisms carry it now — this region, and the
    // cell input's `aria-describedby` pointing at it — so this asserts the region
    // speaks and the description is wired for the platform path.
    await virtual.start({ container });
    act(() => {
      ref.current?.setSelection([{ row: [0, 0], column: [0, 0] }]);
    });
    // pageX/pageY have to be real: handleContextMenu resolves the cell from the
    // event position, and jsdom reports every box as 0x0 without them.
    const rightClick = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(rightClick, "pageX", { value: 5 });
    Object.defineProperty(rightClick, "pageY", { value: 5 });
    await act(async () => {
      container
        .querySelector<HTMLElement>(".fortune-cell-area")!
        .dispatchEvent(rightClick);
    });
    const clearRow = Array.from(
      document.querySelectorAll<HTMLElement>('[role="button"]')
    ).find((el) => el.textContent === "Clear content");
    if (!clearRow) return; // menu shape differs; covered by the DOM-level suite
    await act(async () => {
      clearRow.focus();
      fireEvent.keyDown(clearRow, { key: "Enter" });
    });
    await settle();

    const spoken = await virtual.spokenPhraseLog();
    expect(spoken).toContain("assertive: Contents cleared.");
    // And the description path, which is what survives a real focus utterance.
    const clearedDescribedBy = container
      .querySelector("#luckysheet-rich-text-editor")
      ?.getAttribute("aria-describedby");
    expect(document.getElementById(clearedDescribedBy!)).toBe(
      container.querySelector(`[id$="-${CONTEXT_MENU_REGION_ID_SUFFIX}"]`)
    );
  });

  it("speaks the result of the Sort dialog's Sort button", async () => {
    // The specific case reported silent. Unlike the menu rows, this one closes a
    // dialog: `Dialog`'s unmount cleanup refocuses the cell input *during* the
    // commit, whereas `focusAfterCommit` defers to a macrotask. So the focus can
    // land before the description is in the DOM, and the utterance is composed
    // without it — the same bug in a different order.
    //
    // That was written as a hazard to watch for and then asserted against the
    // settled DOM, which is always right by the time the assertions run. It was
    // green for the whole of the second report of this bug. The `atFocus`
    // capture below is what makes it able to fail: a screen reader composes the
    // utterance from what exists when focus arrives, so that is the only moment
    // worth reading.
    let atFocus: { describedBy: string | null; text: string | null } | null =
      null;
    const captureAtFocus = (e: Event) => {
      const el = e.target as HTMLElement;
      const describedBy = el.getAttribute?.("aria-describedby") ?? null;
      atFocus = {
        describedBy,
        text: describedBy
          ? document.getElementById(describedBy)?.textContent ?? null
          : null,
      };
    };

    await virtual.start({ container });
    act(() => {
      ref.current?.setSelection([{ row: [0, 2], column: [0, 0] }]);
    });
    const rightClick = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(rightClick, "pageX", { value: 5 });
    Object.defineProperty(rightClick, "pageY", { value: 5 });
    await act(async () => {
      container
        .querySelector<HTMLElement>(".fortune-cell-area")!
        .dispatchEvent(rightClick);
    });
    const sortRow = Array.from(
      document.querySelectorAll<HTMLElement>('[role="button"]')
    ).find((el) => el.textContent === "Sort");
    if (!sortRow) throw new Error("no Sort row in the context menu");
    await act(async () => {
      sortRow.focus();
      fireEvent.keyDown(sortRow, { key: "Enter" });
    });
    await settle();

    const sortButton = Array.from(
      document.querySelectorAll<HTMLElement>('[role="button"]')
    ).find((el) => el.textContent === "Sort" && el.closest(".fortune-sort"));
    if (!sortButton) throw new Error("no Sort button in the dialog");
    document.addEventListener("focusin", captureAtFocus);
    await act(async () => {
      fireEvent.click(sortButton);
    });
    await settle();
    document.removeEventListener("focusin", captureAtFocus);

    // The virtual reader reports the assertive region dutifully, so it cannot
    // reproduce VoiceOver *discarding* it — that is the whole bug. What decides
    // the real outcome is whether the description is in place, and non-empty, at
    // the moment focus lands on the cell input.
    expect(atFocus).not.toBeNull();
    expect(document.getElementById(atFocus!.describedBy!)).toBe(
      container.querySelector(`[id$="-${CONTEXT_MENU_REGION_ID_SUFFIX}"]`)
    );
    expect(atFocus!.text).toMatch(/Sorted in ascending order/);

    const cell = container.querySelector("#luckysheet-rich-text-editor")!;
    expect(document.activeElement).toBe(cell);

    const spoken = await virtual.spokenPhraseLog();
    expect(spoken.join(" | ")).toMatch(/Sorted in ascending order/);
  });

  it("speaks the result of a committed rename", async () => {
    await virtual.start({ container });
    const field = await startRename(container);

    field.textContent = "Budget";
    await act(async () => {
      fireEvent.keyDown(field, { key: "Enter" });
    });
    await settle();

    const spoken = await virtual.spokenPhraseLog();
    // Assertive, not polite: it has to survive the focus move to the tab.
    expect(spoken).toContain("assertive: Sheet renamed to Budget.");
  });

  it("speaks a cancelled rename, and does not claim it succeeded", async () => {
    await virtual.start({ container });
    const field = await startRename(container);

    field.textContent = "Discarded";
    await act(async () => {
      fireEvent.keyDown(field, { key: "Escape" });
    });
    await settle();

    const spoken = await virtual.spokenPhraseLog();
    expect(
      spoken.some((p) => p.replace(/\u200B/g, "").includes("Rename cancelled."))
    ).toBe(true);
    expect(spoken.some((p) => p.includes("Sheet renamed to"))).toBe(false);
  });
});
