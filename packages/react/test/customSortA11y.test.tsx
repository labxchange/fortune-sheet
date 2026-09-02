import { readFileSync } from "fs";
import { join } from "path";
import React, { useEffect, useMemo } from "react";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
  within,
} from "@testing-library/react";
import { defaultContext, defaultSettings, Context } from "@fortune-sheet/core";
import WorkbookContext from "../src/context";
import { ModalProvider } from "../src/context/modal";
import { useDialog } from "../src/hooks/useDialog";
import CustomSort, { SORT_DIALOG_TITLE_ID } from "../src/components/CustomSort";
import Workbook from "../src/components/Workbook";
import { CONTEXT_MENU_REGION_ID_SUFFIX } from "../src/hooks/useContextMenuAnnouncements";

// The Sort modal reached the audit with none of its three inputs named and no
// name on the dialog itself: the `<span>` beside each control was never
// associated, and `showDialog` forwarded nothing to `Dialog`'s `labelledBy`.
// Three tickets' worth of WCAG 4.1.2, plus the 1.4.11 focus ring at the bottom.
//
// Driving this through the real context menu would mean right-clicking a cell,
// which jsdom cannot lay out. These cases render the same composition the fix
// creates: CustomSort inside the real Dialog, through the real useDialog.

const makeRefs = () => ({
  globalCache: { undoList: [], redoList: [] },
  cellInput: React.createRef<HTMLDivElement | null>(),
  fxInput: React.createRef<HTMLDivElement | null>(),
  canvas: React.createRef<HTMLCanvasElement | null>(),
  scrollbarX: React.createRef<HTMLDivElement | null>(),
  scrollbarY: React.createRef<HTMLDivElement | null>(),
  cellArea: React.createRef<HTMLDivElement | null>(),
  workbookContainer: React.createRef<HTMLDivElement | null>(),
});

const makeContext = (): Context => {
  const refs = makeRefs();
  const ctx = defaultContext(refs as any);
  ctx.currentSheetId = "sheet-1";
  ctx.luckysheetfile = [
    { id: "sheet-1", name: "Sheet1", data: [[{ v: "Header" }, { v: "B" }]] },
  ] as any;
  // A1:B3, so the column list the dialog offers has two entries.
  ctx.luckysheet_select_save = [{ row: [0, 2], column: [0, 1] }] as any;
  return ctx;
};

const Harness: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const value = useMemo(
    () => ({
      context: makeContext(),
      setContext: () => {},
      settings: defaultSettings,
      refs: makeRefs() as any,
      handleUndo: () => {},
      handleRedo: () => {},
    }),
    []
  );
  return (
    <WorkbookContext.Provider value={value as any}>
      <ModalProvider>{children}</ModalProvider>
    </WorkbookContext.Provider>
  );
};

/** Opens a dialog on mount, the way the context menu's sort row does. */
const OpenSortDialog: React.FC<{ labelledBy?: string }> = ({ labelledBy }) => {
  const { showDialog } = useDialog();
  useEffect(() => {
    showDialog(<CustomSort />, labelledBy ? { labelledBy } : undefined);
  }, [labelledBy, showDialog]);
  return null;
};

describe("Sort modal form controls", () => {
  beforeEach(() => {
    render(
      <Harness>
        <CustomSort />
      </Harness>
    );
  });

  it("names the ascending option and reports it as selected", () => {
    // The name comes from a <label>, not an aria-label: the text is already on
    // screen, so associating it also makes the words a click target. `sort.asc`
    // carries a trailing space in the locale file, hence the loose match.
    const asc = screen.getByRole("radio", { name: /Ascending/ });
    expect((asc as HTMLInputElement).checked).toBe(true);
  });

  it("names the descending option and reports it as unselected", () => {
    const desc = screen.getByRole("radio", { name: /Descending/ });
    expect((desc as HTMLInputElement).checked).toBe(false);
  });

  it("names the header-row checkbox", () => {
    // Not in the audit, but the identical defect three lines from the radios —
    // its id was already in the markup and referenced by nothing.
    expect(
      screen.getByRole("checkbox", { name: /Data has a header row/ })
    ).toBeTruthy();
  });

  it("associates each label with its control rather than relabelling it", () => {
    // A <label for> is what makes the text both the name and a click target. An
    // aria-label would satisfy the role query above while leaving the visible
    // text inert, so assert the association itself.
    const asc = screen.getByRole("radio", { name: /Ascending/ });
    const label = document.querySelector(`label[for="${asc.id}"]`);
    expect(label).not.toBeNull();
    expect(asc.getAttribute("aria-label")).toBeNull();
  });

  it("renders the heading the dialog is named from", () => {
    expect(document.getElementById(SORT_DIALOG_TITLE_ID)).not.toBeNull();
  });
});

describe("Sort modal accessible name", () => {
  it("names the dialog from its own heading", async () => {
    render(
      <Harness>
        <OpenSortDialog labelledBy={SORT_DIALOG_TITLE_ID} />
      </Harness>
    );

    const dialog = await waitFor(() => screen.getByRole("dialog"));
    expect(dialog.getAttribute("aria-labelledby")).toBe(SORT_DIALOG_TITLE_ID);

    // The reference has to resolve: Dialog previously hardcoded this exact id,
    // which meant every dialog that was not CustomSort pointed at nothing.
    const heading = document.getElementById(SORT_DIALOG_TITLE_ID);
    expect(heading).not.toBeNull();
    expect(dialog.contains(heading)).toBe(true);
    // And it must actually say something — an empty name passes aria-labelledby
    // while telling a screen-reader user nothing.
    expect(heading!.textContent).toMatch(/Sort range/);
  });

  it("separates the words in the computed name", () => {
    // The heading was four adjacent inline spans whose visible gaps came from a
    // CSS margin. Name computation concatenates descendant text and ignores CSS,
    // so the name resolved to "Sort range fromA1toB3" and VoiceOver read it as
    // one word. Asserting on textContent rather than on the markup, because the
    // markup is free to change as long as the spoken result has the spaces.
    render(
      <Harness>
        <CustomSort />
      </Harness>
    );
    const name = document
      .getElementById(SORT_DIALOG_TITLE_ID)!
      .textContent!.trim();

    expect(name).toMatch(/^Sort range from \w+ to \w+$/);
    // The specific regression: no letter or digit ever butts against another
    // word without a separator.
    expect(name).not.toMatch(/from\S/);
    expect(name).not.toMatch(/\Sto\S/);
    // And no run of collapsed whitespace, which is what keeping the margin as
    // well as the spaces would have produced.
    expect(name).not.toMatch(/ {2}/);
  });

  it("leaves a dialog that passes no name without a dangling reference", async () => {
    render(
      <Harness>
        <OpenSortDialog />
      </Harness>
    );

    const dialog = await waitFor(() => screen.getByRole("dialog"));
    // Absent, not pointing at a missing element. Both are unnamed; only one
    // makes the next reader think naming was attempted and works.
    expect(dialog.hasAttribute("aria-labelledby")).toBe(false);
  });
});

describe("Sort modal announces the sort it performed", () => {
  // Ticket 1217673938351666, reported as "Context Menu -> Sort -> No status
  // message". The menu's own sort rows announced; this dialog did not. Opening it
  // announces the dialog and closing it returns focus to the grid, but nothing
  // ever said the data had been reordered — the one thing that changed.
  const confirmSort = (descending: boolean) => {
    const ctx: any = makeContext();
    const setContext = (recipe: (c: any) => void) => recipe(ctx);
    render(
      <WorkbookContext.Provider
        value={
          {
            context: ctx,
            setContext,
            settings: defaultSettings,
            refs: makeRefs() as any,
            handleUndo: () => {},
            handleRedo: () => {},
          } as any
        }
      >
        <ModalProvider>
          <CustomSort />
        </ModalProvider>
      </WorkbookContext.Provider>
    );
    if (descending) {
      fireEvent.click(screen.getByRole("radio", { name: /Descending/ }));
    }
    fireEvent.click(screen.getByRole("button", { name: /Sort/ }));
    return ctx.contextMenuAnnouncement;
  };

  it("announces an ascending sort", () => {
    expect(confirmSort(false)?.key).toBe("rightclick.announceSortedAsc");
  });

  it("announces a descending sort", () => {
    expect(confirmSort(true)?.key).toBe("rightclick.announceSortedDesc");
  });
});

describe("the Sort modal's announcement reaches the focus it hands back", () => {
  // The describe above proves the *request* is recorded. It was, and the modal
  // was still silent: recorded at the wrong moment.
  //
  // The result is not delivered by the live region winning a race — VoiceOver
  // drops a region message queued alongside a focus change, which is why
  // `useContextMenuAnnouncements` hangs the text off the cell input's
  // `aria-describedby` and lets it ride the focus utterance instead. That only
  // works if the text is in the DOM *before* focus moves.
  //
  // Closing the modal moves focus: `Dialog` restores it to whatever held it
  // when it opened, which the sort row deliberately made the cell input. And it
  // restores synchronously, in its passive-effect cleanup — React runs unmount
  // cleanups ahead of mount effects, so the cleanup's focus() beat the effect
  // that writes the announcement. VoiceOver composed "text entry area, blank,
  // main" and the sort was never mentioned.
  //
  // So this asserts on the DOM *as it stood at the instant focus landed*, not on
  // the settled DOM. The settled DOM has always been right, which is exactly why
  // the bug survived the tests above.
  const plainData = [
    {
      name: "Sheet1",
      id: "s1",
      row: 10,
      column: 6,
      celldata: ["Fruit", "Cherry", "Apple", "Banana"].map((v, r) => ({
        r,
        c: 0,
        v: { v, m: v, ct: { fa: "General", t: "s" } },
      })),
    },
  ];

  /** Both the modal's close and `focusAfterCommit` defer by a task. */
  const flush = async () => {
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
  };

  /** Scoped to one workbook root, so a page holding several stays unambiguous. */
  const openSortModal = async (root: HTMLElement) => {
    const rightClick = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(rightClick, "pageX", { value: 5 });
    Object.defineProperty(rightClick, "pageY", { value: 5 });
    act(() => {
      root
        .querySelector<HTMLElement>(".fortune-cell-area")!
        .dispatchEvent(rightClick);
    });
    const row = Array.from(
      root.querySelectorAll<HTMLElement>('[role="button"]')
    ).find((el) => el.textContent === "Sort")!;
    act(() => {
      row.focus();
      fireEvent.keyDown(row, { key: "Enter" });
    });
    return waitFor(() => screen.getByRole("dialog"));
  };

  /** The description an assistive technology would resolve when focus lands. */
  const captureDescriptionAtFocus = async (dialog: HTMLElement) => {
    let atFocus: { id: string | null; text: string | null } = {
      id: null,
      text: null,
    };
    const onFocusIn = (e: Event) => {
      const id = (e.target as HTMLElement).getAttribute?.("aria-describedby");
      atFocus = {
        id: id ?? null,
        // getElementById, not a scoped query: that is how an IDREF resolves,
        // and resolving it globally is what exposes a collision with another
        // workbook's region.
        text: id ? document.getElementById(id)?.textContent ?? null : null,
      };
    };
    document.addEventListener("focusin", onFocusIn);
    fireEvent.click(within(dialog).getByRole("button", { name: /^Sort$/ }));
    await flush();
    document.removeEventListener("focusin", onFocusIn);
    return atFocus;
  };

  /**
   * What a screen reader would have to work with when focus arrives: the
   * description the focused element points at, resolved at that moment.
   */
  const confirmAndCaptureFocusUtterance = async (
    descending: boolean
  ): Promise<string | null> => {
    const { container } = render(<Workbook lang="en" data={plainData} />);
    const dialog = await openSortModal(container);

    if (descending) {
      fireEvent.click(
        within(dialog).getByRole("radio", { name: /Descending/ })
      );
    }

    let described: string | null = null;
    const onFocusIn = (e: Event) => {
      const el = e.target as HTMLElement;
      const id = el.getAttribute?.("aria-describedby");
      described = id ? document.getElementById(id)?.textContent ?? null : null;
    };
    document.addEventListener("focusin", onFocusIn);
    fireEvent.click(within(dialog).getByRole("button", { name: /^Sort$/ }));
    await flush();
    document.removeEventListener("focusin", onFocusIn);

    return described;
  };

  it("has the ascending result in the DOM before focus returns to the grid", async () => {
    expect(await confirmAndCaptureFocusUtterance(false)).toContain(
      "Sorted in ascending order."
    );
  });

  it("has the descending result in the DOM before focus returns to the grid", async () => {
    expect(await confirmAndCaptureFocusUtterance(true)).toContain(
      "Sorted in descending order."
    );
  });

  it("points the restored focus at the region carrying it", async () => {
    // The text existing is not enough on its own: it has to be the description
    // of the element focus lands on, or it stays a live-region message competing
    // with the focus utterance — the race this delivery mechanism avoids.
    const { container } = render(<Workbook lang="en" data={plainData} />);
    const dialog = await openSortModal(container);

    let describedBy: string | null = null;
    const onFocusIn = (e: Event) => {
      describedBy =
        (e.target as HTMLElement).getAttribute?.("aria-describedby") ?? null;
    };
    document.addEventListener("focusin", onFocusIn);
    fireEvent.click(within(dialog).getByRole("button", { name: /^Sort$/ }));
    await flush();
    document.removeEventListener("focusin", onFocusIn);

    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toBe(
      container.querySelector(`[id$="-${CONTEXT_MENU_REGION_ID_SUFFIX}"]`)
    );
  });

  it("resolves to its own workbook's region when the page holds several", async () => {
    // The failure the two reports above were actually describing, and the reason
    // every other test here passed while VoiceOver said "text entry area, blank,
    // main": the region's id was a module constant, so all five workbooks the
    // spreadsheet sim renders emitted `id="sr-contextMenuRegion"`. The
    // announcement went into the right region, but `aria-describedby` is an
    // IDREF and an IDREF resolves to the *first* match in the document — the
    // description of a cell input in any instance but the first pointed at the
    // first instance's permanently empty region.
    //
    // Sorting in the *second* workbook is the whole point of the test; doing it
    // in the first passes either way.
    const { container } = render(
      <>
        <Workbook lang="en" data={plainData} />
        <Workbook lang="en" data={plainData} />
      </>
    );
    const [first, second] =
      container.querySelectorAll<HTMLElement>(".fortune-container");
    const dialog = await openSortModal(second);

    const atFocus = await captureDescriptionAtFocus(dialog);

    expect(atFocus.text).toContain("Sorted in ascending order.");
    expect(document.getElementById(atFocus.id!)).toBe(
      second.querySelector(`[id$="-${CONTEXT_MENU_REGION_ID_SUFFIX}"]`)
    );
    // And the ids are actually distinct, rather than the assertion above passing
    // because both queries found the same element.
    expect(
      first.querySelector(`[id$="-${CONTEXT_MENU_REGION_ID_SUFFIX}"]`)!.id
    ).not.toBe(
      second.querySelector(`[id$="-${CONTEXT_MENU_REGION_ID_SUFFIX}"]`)!.id
    );
  });
});

// jest maps CSS through identity-obj-proxy, so no stylesheet loads and the ratio
// cannot be measured from a render. Reading the rule as text is the only
// mechanism here that fails when the ring goes back to sitting on the fill.
describe("the rule that governs the Sort button's focus ring", () => {
  const read = (path: string) => readFileSync(join(__dirname, path), "utf8");

  const ruleBody = (css: string, selector: string, file: string) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
    if (!match) throw new Error(`no rule for ${selector} in ${file}`);
    return match[1];
  };

  it("pushes the ring off the button's own fill", () => {
    // #0063c3 on the #0188fb .button-primary fill is 1.66:1 and fails 1.4.11.
    // Any positive offset moves it onto the white dialog panel, where the same
    // colour measures 5.88:1; 2px matches the filter menu's buttons.
    const body = ruleBody(
      read("../src/components/CustomSort/index.css"),
      ".fortune-sort-button .button-basic:focus-visible",
      "CustomSort/index.css"
    );
    const offset = body.match(/outline-offset:\s*(-?[\d.]+)px/);
    expect(offset).not.toBeNull();
    expect(Number(offset![1])).toBeGreaterThanOrEqual(2);
    expect(body).toMatch(/outline:/);
  });

  it("does not fix it by giving every .button-basic an offset", () => {
    // The global rule is shared with the Toolbar, ChangeColor, DataVerification,
    // LocationCondition, SplitColumn, ConditionFormat and LinkEditCard, several
    // of which sit in containers that clip an outset ring. Widening the fix
    // there is the regression this asserts against.
    const body = ruleBody(
      read("../src/components/Toolbar/index.css"),
      ".button-basic:focus-visible",
      "Toolbar/index.css"
    );
    expect(body).not.toMatch(/outline-offset/);
  });
});
