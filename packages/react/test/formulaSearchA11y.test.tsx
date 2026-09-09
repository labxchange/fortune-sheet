import React, { useEffect, useMemo } from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import {
  defaultContext,
  defaultSettings,
  locale,
  Context,
} from "@fortune-sheet/core";
import WorkbookContext from "../src/context";
import { ModalProvider } from "../src/context/modal";
import { useDialog } from "../src/hooks/useDialog";
import { FormulaSearch } from "../src/components/FormulaSearch";

// The Search Function dialog reached the audit with no `role`, no accessible
// name on either input, ~400 tab stops in its function list, and OK/Cancel as
// focusable `<div>`s that ignored Enter and Space.
//
// Driving it through the real toolbar would mean opening a Combo the layout of
// which jsdom cannot measure, so these cases render the same composition the
// toolbar creates: FormulaSearch inside the real Dialog, through the real
// useDialog.

const TITLE_ID = "test-formula-search-title";

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Expected accessible names come from the locale, not from hardcoded English.
// The repo's own convention (`FilterMenu.test.tsx:21` and five siblings), and
// the reason matters here: written from memory, these asserted "Find function"
// against `findFunctionTitle: "Search function"`. A hardcoded expectation also
// silently defends the old wording whenever a key is reworded across the six
// locale files.
const { formulaMore, button } = locale({ lang: "en" } as any);
const exact = (text: string) => new RegExp(`^${escapeRegExp(text)}`);

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
  const ctx = defaultContext(makeRefs() as any);
  // Pinned rather than left to the default: the shared test setup seeds
  // localStorage with `locale: "zh"`, and although `locale()` reads ctx.lang
  // and not localStorage, the name assertions below are in English and should
  // not depend on that staying true.
  ctx.lang = "en";
  ctx.currentSheetId = "sheet-1";
  ctx.luckysheetfile = [
    { id: "sheet-1", name: "Sheet1", data: [[{ v: "1" }]] },
  ] as any;
  ctx.luckysheet_select_save = [{ row: [0, 0], column: [0, 0] }] as any;
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

/** Opens the dialog on mount, the way the toolbar's Formula row does. */
const OpenDialog: React.FC = () => {
  const { showDialog } = useDialog();
  useEffect(() => {
    showDialog(<FormulaSearch onCancel={() => {}} titleId={TITLE_ID} />, {
      labelledBy: TITLE_ID,
    });
  }, [showDialog]);
  return null;
};

// Scoped to the listbox, NOT `screen`. The category control is a native
// `<select>`, and a native `<option>` carries an implicit `role="option"` -- so
// an unscoped `getAllByRole("option")` returns the ~15 category entries FIRST,
// ahead of the function list, and `options()[1]` was a category rather than a
// function. That is what made the click and arrow-key cases read
// `aria-selected` as null.
//
// It also made two of the cases below pass for the wrong reason: the category
// options have no `tabindex` and no `aria-selected`, so they diluted the
// "exactly one tabbable" and "exactly one selected" filters instead of being
// counted by them. Both would have passed with the listbox itself broken.
const options = () =>
  within(screen.getByRole("listbox")).getAllByRole("option");

describe("Search Function dialog", () => {
  describe("rendered directly", () => {
    beforeEach(() => {
      render(
        <Harness>
          <FormulaSearch onCancel={() => {}} titleId={TITLE_ID} />
        </Harness>
      );
    });

    // Asserted through the accessible name, not `getAttribute`: an
    // aria-labelledby pointing at a missing id passes the attribute check and
    // still leaves the control unnamed.
    it("names the search field", () => {
      expect(
        screen.getByRole("textbox", {
          name: exact(formulaMore.findFunctionTitle),
        })
      ).toBeTruthy();
    });

    it("names the category control", () => {
      expect(
        screen.getByRole("combobox", {
          name: exact(formulaMore.selectCategory),
        })
      ).toBeTruthy();
    });

    it("names the function list", () => {
      expect(
        screen.getByRole("listbox", {
          name: exact(formulaMore.selectFunctionTitle),
        })
      ).toBeTruthy();
    });

    // Guards the two tests below, which are about a list long enough for
    // per-entry tab stops to matter. They would pass vacuously on a short one.
    it("renders a list long enough for this to matter", () => {
      expect(options().length).toBeGreaterThan(20);
    });

    // The heart of the ticket: every entry carried tabIndex={0}, so Tab could
    // not get past the list. Exactly one entry is tabbable now, and the count
    // must not scale with the number of functions.
    it("is a single tab stop however many functions it lists", () => {
      const tabbable = options().filter(
        (o) => o.getAttribute("tabindex") === "0"
      );

      expect(tabbable).toHaveLength(1);
    });

    it("marks exactly one option selected", () => {
      const selected = options().filter(
        (o) => o.getAttribute("aria-selected") === "true"
      );

      expect(selected).toHaveLength(1);
    });

    // The counter-path. Converting clickable divs into options is exactly the
    // change that breaks the mouse route everybody actually uses.
    it("still selects an entry when it is clicked", () => {
      const [, second] = options();

      fireEvent.click(second);

      expect(second.getAttribute("aria-selected")).toBe("true");
      expect(second.getAttribute("tabindex")).toBe("0");
    });

    // Selection follows focus, so the arrow keys move the selected option
    // rather than decoupling it from the one the dialog would insert.
    it("moves the selection with the arrow keys", () => {
      const [first] = options();
      first.focus();

      fireEvent.keyDown(first, { key: "ArrowDown" });

      const after = options();
      expect(after[0].getAttribute("aria-selected")).toBe("false");
      expect(after[1].getAttribute("aria-selected")).toBe("true");
    });

    // These were focusable <div>s with an onClick and no keyboard handler at
    // all, so they took focus and then did nothing on Enter or Space. A real
    // button gets role, keyboard activation and a focus ring from the platform.
    it("makes OK a real button", () => {
      const ok = screen.getByRole("button", { name: exact(button.confirm) });

      expect(ok.tagName).toBe("BUTTON");
    });

    it("makes Cancel a real button", () => {
      const cancel = screen.getByRole("button", { name: exact(button.cancel) });

      expect(cancel.tagName).toBe("BUTTON");
    });

    // Typing used to leave the index pointing into the old, longer list: the
    // dialog then had no tabbable option and OK dereferenced an entry that was
    // no longer there.
    it("keeps exactly one tabbable option after filtering the list", () => {
      fireEvent.change(
        screen.getByRole("textbox", {
          name: exact(formulaMore.findFunctionTitle),
        }),
        {
          target: { value: "SUM" },
        }
      );

      const tabbable = options().filter(
        (o) => o.getAttribute("tabindex") === "0"
      );
      expect(tabbable).toHaveLength(1);
    });
  });

  // Point 4 of the fix: a dialog whose controls are all named while its own
  // container is not would be a half-fix. `showDialog` forwarded no
  // `labelledBy` from this call site.
  it("names the dialog itself", () => {
    render(
      <Harness>
        <OpenDialog />
      </Harness>
    );

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("listbox")).toBeTruthy();

    // Resolved by hand rather than with a matcher: jest-dom is not set up in
    // this repo, and following the idref proves the name actually lands --
    // an aria-labelledby pointing at nothing would satisfy a bare attribute
    // check.
    const labelId = dialog.getAttribute("aria-labelledby");
    expect(labelId).toBe(TITLE_ID);
    expect(document.getElementById(labelId!)?.textContent).toContain(
      formulaMore.findFunctionTitle
    );
  });
});
