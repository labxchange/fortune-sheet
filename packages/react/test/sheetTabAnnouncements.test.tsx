import { render, act, fireEvent } from "@testing-library/react";
import React from "react";
import { virtual } from "@guidepup/virtual-screen-reader";
import Workbook, { WorkbookInstance } from "../src/components/Workbook";

/**
 * Sheet-tab actions (add, move, dropdown-select, tab colour) mutate context
 * state with no other feedback a screen reader can pick up — see
 * SheetTab/index.tsx's `sr-sheetSwitch` / `sr-sheetMove` / `sr-sheetColor`
 * regions and the hooks that feed them. This is the same virtual-reader
 * technique `sr-virtual.test.tsx` uses: assert what gets spoken, not just
 * which attributes are set.
 */

const sheet1 = { name: "Sheet1", id: "s1", celldata: [], row: 10, column: 8 };
const sheet2 = { name: "Sheet2", id: "s2", celldata: [], row: 10, column: 8 };

describe("sheet tab announcements", () => {
  let ref: React.RefObject<WorkbookInstance>;
  let container: HTMLElement;

  beforeEach(() => {
    ref = React.createRef<WorkbookInstance>();
    container = render(
      <Workbook ref={ref} lang="en" data={[sheet1, sheet2] as any} />
    ).container;
  });

  afterEach(async () => {
    await virtual.stop();
  });

  it("announces a new sheet as added and selected", async () => {
    await virtual.start({ container });
    await act(async () => {
      fireEvent.click(
        container.querySelector<HTMLElement>(
          ".fortune-sheettab-button[aria-label='New sheet']"
        )!
      );
      // onAddSheetClick defers its work a tick via setTimeout.
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    const spoken = await virtual.spokenPhraseLog();
    expect(spoken).toContain("polite: Sheet3 added and selected.");
  });

  it("announces a sheet picked from the all-sheets dropdown", async () => {
    await virtual.start({ container });
    await act(async () => {
      // The "all-sheets" id collides with an SVG icon symbol id elsewhere in
      // the document, so the trigger div must be selected specifically.
      fireEvent.mouseDown(
        container.querySelector<HTMLElement>("div#all-sheets")!
      );
    });
    const items = Array.from(
      container.querySelectorAll<HTMLElement>(".fortune-sheet-list-item")
    );
    const target = items.find((el) => el.textContent?.includes("Sheet2"))!;
    await act(async () => {
      fireEvent.click(target);
    });
    const spoken = await virtual.spokenPhraseLog();
    expect(spoken).toContain("polite: Sheet2 selected.");
  });

  it("announces a sheet moved via the options menu", async () => {
    const trigger = container.querySelector<HTMLElement>(
      ".luckysheet-sheets-item-function"
    )!;
    await act(async () => {
      fireEvent.mouseDown(trigger);
    });
    await virtual.start({ container });
    const moveRight = Array.from(
      container.querySelectorAll<HTMLElement>(
        '#fortune-sheet-tab-options-menu [role="button"]'
      )
    ).find((el) => el.textContent === "Move right")!;
    await act(async () => {
      fireEvent.click(moveRight);
    });
    const spoken = await virtual.spokenPhraseLog();
    expect(spoken).toContain("polite: Sheet1 moved to position 2 of 2.");
  });

  it("announces a sheet tab colour change and a subsequent reset", async () => {
    const trigger = container.querySelector<HTMLElement>(
      ".luckysheet-sheets-item-function"
    )!;
    await act(async () => {
      fireEvent.mouseDown(trigger);
    });
    const changeColor = Array.from(
      container.querySelectorAll<HTMLElement>(
        '#fortune-sheet-tab-options-menu [role="button"]'
      )
    ).find((el) => el.textContent?.includes("Change color"))!;
    await act(async () => {
      fireEvent.click(changeColor);
    });
    await virtual.start({ container });
    // Scoped to the sheet-tab's own colour submenu — the toolbar has its own
    // font/fill colour pickers with matching swatch aria-labels.
    const swatch = container.querySelector<HTMLElement>(
      `#fortune-sheet-tab-options-menu [role='gridcell'][aria-label='Black']`
    )!;
    await act(async () => {
      fireEvent.click(swatch);
    });
    // Read the log now rather than after the reset below: `spokenPhraseLog`
    // re-reads each logged mutation's *current* text, so a region with two
    // mutations reads as the same (final) phrase twice once both have
    // happened — this is the one point where only the first has.
    expect(await virtual.spokenPhraseLog()).toContain(
      "polite: Sheet1 tab colour changed to Black."
    );

    const reset = container.querySelector<HTMLElement>(".color-reset")!;
    await act(async () => {
      fireEvent.click(reset);
    });
    // This is the region's second write, so `markAsRepeat` appends a
    // (inaudible) zero-width space to make sure it is heard as a change.
    const zeroWidthSpace = String.fromCharCode(0x200b);
    const spoken = (await virtual.spokenPhraseLog()).map((p) =>
      p.split(zeroWidthSpace).join("")
    );
    expect(spoken).toContain("polite: Sheet1 tab colour reset.");
  });

  it("announces a copied sheet as added but not selected", async () => {
    // copySheet places the copy without switching to it (core's addSheet
    // skips changeSheet whenever a newSheetID is passed, which copySheet
    // always does) — the active sheet must still read Sheet1 throughout.
    const activeName = () =>
      container.querySelector<HTMLElement>(
        ".luckysheet-sheets-item.luckysheet-sheets-item-active .luckysheet-sheets-item-name"
      )?.textContent;
    expect(activeName()).toBe("Sheet1");

    await virtual.start({ container });
    const trigger = container.querySelector<HTMLElement>(
      ".luckysheet-sheets-item-function"
    )!;
    await act(async () => {
      fireEvent.mouseDown(trigger);
    });
    const copy = Array.from(
      container.querySelectorAll<HTMLElement>(
        '#fortune-sheet-tab-options-menu [role="button"]'
      )
    ).find((el) => el.textContent === "Copy")!;
    await act(async () => {
      fireEvent.click(copy);
    });

    expect(activeName()).toBe("Sheet1");
    const spoken = await virtual.spokenPhraseLog();
    expect(spoken).toContain("polite: Sheet1(Copy) added.");
    expect(spoken).not.toContain("polite: Sheet1(Copy) added and selected.");
  });

  it("stays silent when the colour submenu is opened under StrictMode without picking anything", async () => {
    // StrictMode double-invokes a mount effect (effect, cleanup, effect
    // again) to surface effects that aren't idempotent. ChangeColor's
    // colour-change counter must not mistake that replay for a real pick.
    const { container: strictContainer } = render(
      <React.StrictMode>
        <Workbook lang="en" data={[sheet1, sheet2] as any} />
      </React.StrictMode>
    );
    const trigger = strictContainer.querySelector<HTMLElement>(
      ".luckysheet-sheets-item-function"
    )!;
    await act(async () => {
      fireEvent.mouseDown(trigger);
    });
    const changeColor = Array.from(
      strictContainer.querySelectorAll<HTMLElement>(
        '#fortune-sheet-tab-options-menu [role="button"]'
      )
    ).find((el) => el.textContent?.includes("Change color"))!;
    await act(async () => {
      fireEvent.click(changeColor);
    });

    expect(strictContainer.querySelector("#sr-sheetColor")?.textContent).toBe(
      ""
    );
  });
});
