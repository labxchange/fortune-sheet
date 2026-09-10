import React, { useEffect, useMemo } from "react";
import {
  render,
  screen,
  fireEvent,
  within,
  act,
  createEvent,
} from "@testing-library/react";
import {
  defaultContext,
  defaultSettings,
  locale,
  Context,
} from "@fortune-sheet/core";
import { virtual } from "@guidepup/virtual-screen-reader";
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

// The active option is named by id, not by focus, so this is the witness for
// "which entry is the user on" throughout.
const activeId = () =>
  screen.getByRole("listbox").getAttribute("aria-activedescendant");
const active = () => document.getElementById(activeId()!);

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

    // The heart of the ticket, in its own words: "non-interactive function
    // entries should not receive keyboard focus". Not one of them is
    // focusable -- no tabindex at all, not a roving 0/-1 -- and the count does
    // not scale with the number of functions.
    it("makes no function entry focusable", () => {
      const focusable = options().filter((o) => o.hasAttribute("tabindex"));

      expect(focusable).toHaveLength(0);
    });

    // ...and the other half of the same sentence: removing that focus must not
    // put the list out of reach. The list itself is the tab stop, and it is a
    // named region, so Tab arrives somewhere that announces what it is.
    it("makes the list itself the one tab stop, and names it", () => {
      const list = screen.getByRole("listbox", {
        name: exact(formulaMore.selectFunctionTitle),
      });

      expect(list.getAttribute("tabindex")).toBe("0");
    });

    // `aria-activedescendant` has to resolve, or the list announces nothing at
    // all. Asserted by looking the id up in the document rather than by
    // comparing strings, which is the failure an attribute check misses.
    it("points aria-activedescendant at a real option", () => {
      expect(active()).toBeTruthy();
      expect(active()!.getAttribute("role")).toBe("option");
      expect(active()!.getAttribute("aria-selected")).toBe("true");
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
      expect(activeId()).toBe(second.id);
    });

    // The arrow keys are handled by the list, and they must move the active
    // option WITHOUT moving focus -- that is the whole point of
    // activedescendant, and the assertion on `document.activeElement` is what
    // stops a future "simplification" back to `.focus()` on the option.
    it("moves the active option with the arrow keys, without moving focus", () => {
      const list = screen.getByRole("listbox");
      act(() => {
        list.focus();
      });

      fireEvent.keyDown(list, { key: "ArrowDown" });

      const after = options();
      expect(after[0].getAttribute("aria-selected")).toBe("false");
      expect(after[1].getAttribute("aria-selected")).toBe("true");
      expect(activeId()).toBe(after[1].id);
      expect(document.activeElement).toBe(list);
    });

    // Home/End are the rest of the listbox contract, and the reason the
    // ticket's fourth line is satisfied: a ~55-entry list stays traversable
    // without 55 tab stops.
    it("jumps to the last and first entries with End and Home", () => {
      const list = screen.getByRole("listbox");
      act(() => {
        list.focus();
      });

      fireEvent.keyDown(list, { key: "End" });
      expect(activeId()).toBe(options()[options().length - 1].id);

      fireEvent.keyDown(list, { key: "Home" });
      expect(activeId()).toBe(options()[0].id);
    });

    // The reported trap. With VoiceOver on, ArrowDown at the last entry
    // returned to the first, so arrow navigation was a closed ring with no
    // exit. The boundary now stops -- ARIA's listbox contract, and what makes
    // the end of the list discoverable.
    it("stops at the last function instead of wrapping to the first", () => {
      const list = screen.getByRole("listbox");
      act(() => {
        list.focus();
      });
      fireEvent.keyDown(list, { key: "End" });
      const lastId = activeId();

      fireEvent.keyDown(list, { key: "ArrowDown" });

      expect(activeId()).toBe(lastId);
      expect(options()[0].getAttribute("aria-selected")).toBe("false");
    });

    it("stops at the first function instead of wrapping to the last", () => {
      const list = screen.getByRole("listbox");
      act(() => {
        list.focus();
      });

      fireEvent.keyDown(list, { key: "ArrowUp" });

      expect(activeId()).toBe(options()[0].id);
    });

    // The counter-path for both boundaries: a list that stops must not be a
    // list that stopped moving. Without this, the two cases above would pass
    // just as well against arrow keys that had been broken outright.
    it("still moves backward from that last function", () => {
      const list = screen.getByRole("listbox");
      act(() => {
        list.focus();
      });
      fireEvent.keyDown(list, { key: "End" });

      fireEvent.keyDown(list, { key: "ArrowUp" });

      const all = options();
      expect(activeId()).toBe(all[all.length - 2].id);
    });

    // A boundary key that changes nothing must not be swallowed either: the
    // event stays uncancelled so the browser -- or the AT driving it -- can
    // still do whatever it would have done with that keystroke. The paired
    // `true` is the positive control; without it this would pass against a
    // handler that had stopped cancelling anything at all.
    it("leaves a boundary key uncancelled, but claims one that moves", () => {
      const list = screen.getByRole("listbox");
      act(() => {
        list.focus();
      });

      const atStart = createEvent.keyDown(list, { key: "ArrowUp" });
      fireEvent(list, atStart);
      expect(atStart.defaultPrevented).toBe(false);

      const moves = createEvent.keyDown(list, { key: "ArrowDown" });
      fireEvent(list, moves);
      expect(moves.defaultPrevented).toBe(true);
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

    // Typing used to leave the index pointing into the old, longer list, which
    // left the dialog with no active option at all and made OK dereference an
    // entry that was no longer there. Under activedescendant the witness is
    // the same requirement one layer over: the id still has to resolve, to an
    // option that is actually in the filtered list.
    it("keeps the active option pointing into the filtered list", () => {
      fireEvent.change(
        screen.getByRole("textbox", {
          name: exact(formulaMore.findFunctionTitle),
        }),
        {
          target: { value: "SUM" },
        }
      );

      const remaining = options();
      expect(remaining.length).toBeGreaterThan(0);
      expect(remaining.length).toBeLessThan(20);
      expect(activeId()).toBe(remaining[0].id);
      expect(active()).toBeTruthy();
    });
  });

  // Reaching the right entry is only half of operability -- acting on it is the
  // other half, and the list had no way to do that: Enter did nothing, and a
  // screen reader's activate did nothing, so a keyboard or AT user could walk
  // to SUMIF and then had to leave the list to find a button.
  //
  // All three routes end in the same `onConfirm`, so these cases assert that
  // they *reach* it rather than re-testing what it does. `setContext` is the
  // witness: `onConfirm` calls it unconditionally, and nothing else in this
  // dialog does on these gestures.
  describe("activating the active entry", () => {
    const renderWithSpy = () => {
      const setContext = jest.fn();
      const value = {
        context: makeContext(),
        setContext,
        settings: defaultSettings,
        refs: makeRefs() as any,
        handleUndo: () => {},
        handleRedo: () => {},
      };
      render(
        <WorkbookContext.Provider value={value as any}>
          <ModalProvider>
            <FormulaSearch onCancel={() => {}} titleId={TITLE_ID} />
          </ModalProvider>
        </WorkbookContext.Provider>
      );
      return { setContext };
    };

    it("inserts on Enter, the same way OK does", () => {
      const { setContext } = renderWithSpy();
      const list = screen.getByRole("listbox");
      act(() => {
        list.focus();
      });

      fireEvent.keyDown(list, { key: "Enter" });

      expect(setContext).toHaveBeenCalledTimes(1);
    });

    // The parity the request was actually about: whatever OK does, Enter does.
    // Asserted as "the same number of calls to the same producer" rather than
    // by reimplementing the insertion, because both go through one function.
    it("reaches the same producer OK reaches", () => {
      const { setContext } = renderWithSpy();

      fireEvent.click(
        screen.getByRole("button", { name: exact(button.confirm) })
      );

      expect(setContext).toHaveBeenCalledTimes(1);
    });

    // VoiceOver passes Space through to the focused element when it is not
    // consuming the key itself, and the focused element is the listbox.
    it("inserts on Space as well as Enter", () => {
      const { setContext } = renderWithSpy();
      const list = screen.getByRole("listbox");
      act(() => {
        list.focus();
      });

      fireEvent.keyDown(list, { key: " " });

      expect(setContext).toHaveBeenCalledTimes(1);
    });

    // The other AT route: VO-Space, NVDA's browse-mode Enter and a touch
    // reader's double-tap arrive as a click with no pointer event before it.
    // Dispatched here as a bare click for exactly that reason -- the absence
    // of the pointerdown IS the signal being tested.
    it("inserts when a screen reader activates an option", () => {
      const { setContext } = renderWithSpy();

      fireEvent.click(options()[2]);

      expect(setContext).toHaveBeenCalledTimes(1);
    });

    // The counter-path, and the whole reason the routes are told apart: this
    // dialog has an OK button, so a real mouse click has to keep meaning
    // "select this one" and must not insert and close. The full pointer
    // sequence is what makes it a mouse click; wiring the click straight to
    // onConfirm would pass every other case above.
    it("only selects, and does not insert, on a real mouse click", () => {
      const { setContext } = renderWithSpy();

      fireEvent.pointerDown(options()[2]);
      fireEvent.click(options()[2]);

      expect(setContext).not.toHaveBeenCalled();
      expect(options()[2].getAttribute("aria-selected")).toBe("true");
    });

    // A second mouse click must behave like the first -- the flag is consumed
    // by the click that follows the press, not left set. Without the reset a
    // pointer press would poison every later AT activation, which is the
    // failure mode that would only show up after a user had touched the list
    // with the mouse once.
    it("keeps selecting, not inserting, on a second mouse click", () => {
      const { setContext } = renderWithSpy();

      fireEvent.pointerDown(options()[2]);
      fireEvent.click(options()[2]);
      fireEvent.pointerDown(options()[3]);
      fireEvent.click(options()[3]);

      expect(setContext).not.toHaveBeenCalled();
    });

    // ...and the converse: an AT activation still works after a mouse click.
    it("still activates for a screen reader after a mouse click", () => {
      const { setContext } = renderWithSpy();

      fireEvent.pointerDown(options()[2]);
      fireEvent.click(options()[2]);
      fireEvent.click(options()[3]);

      expect(setContext).toHaveBeenCalledTimes(1);
    });

    // Every case above pairs a press with a click, which is the pairing the
    // discriminator was written against. The gap is a press that produces no
    // click on the option at all -- released somewhere else, so the browser
    // fires `click` on the nearest common ancestor (`.formulaList`, which has
    // no handler) and nothing consumes the flag. Left set, it makes the next
    // activation dead, and the user who hits that is the one who touched the
    // list with the mouse before reaching for the screen reader.
    it("still activates for a screen reader after a press that produced no click", () => {
      const { setContext } = renderWithSpy();

      fireEvent.pointerDown(options()[2]);
      fireEvent.pointerUp(document.body);
      fireEvent.click(options()[3]);

      expect(setContext).toHaveBeenCalledTimes(1);
    });

    // The other release that emits no click: a right-press, which produces
    // `contextmenu` instead. Told apart at the press rather than at the
    // release, because the release lands on the option like a real click's
    // does and the two are indistinguishable by target alone.
    //
    // Dispatched as a `MouseEvent` of type "pointerdown" rather than through
    // `fireEvent.pointerDown(el, { button: 2 })`, and that is not a style
    // choice: jsdom has no `PointerEvent`, so testing-library falls back to
    // the bare `Event` constructor, which silently drops `button` -- the init
    // would have been ignored and this case would have passed for the wrong
    // reason. `MouseEvent` exists in jsdom and carries `button` for real.
    it("ignores a non-primary press, which never becomes a click", () => {
      const { setContext } = renderWithSpy();

      fireEvent(
        options()[2],
        new MouseEvent("pointerdown", { bubbles: true, button: 2 })
      );
      fireEvent.click(options()[3]);

      expect(setContext).toHaveBeenCalledTimes(1);
    });
  });

  // The ticket's fourth line is about a screen reader, and every case above
  // asserts one layer removed from that: which attributes are set, not what
  // gets announced. `@guidepup/virtual-screen-reader` resolves the
  // accessibility tree and composes the announcement the way the ARIA spec
  // says to, which is what settles "is the list still traversable" mechanically
  // rather than by reading the spec and asserting the reading.
  //
  // It models the spec, not VoiceOver, so it does not replace the manual pass
  // -- it means the manual pass confirms platform behaviour instead of
  // discovering that the list was never traversable in the tree at all.
  describe("what a screen reader gets", () => {
    afterEach(async () => {
      await virtual.stop();
    });

    it("announces the list as a named listbox and reads the active option", async () => {
      render(
        <Harness>
          <FormulaSearch onCancel={() => {}} titleId={TITLE_ID} />
        </Harness>
      );
      const list = screen.getByRole("listbox");

      await virtual.start({ container: list });
      const spoken = await virtual.lastSpokenPhrase();
      await virtual.stop();

      expect(spoken).toContain("listbox");
      expect(spoken).toContain(formulaMore.selectFunctionTitle);
    });

    // The trap, read from the tree rather than from the DOM: arrowing to the
    // end must leave the reader on the last entry, not back at the first.
    it("walks to the last entry and stays there", async () => {
      render(
        <Harness>
          <FormulaSearch onCancel={() => {}} titleId={TITLE_ID} />
        </Harness>
      );
      const list = screen.getByRole("listbox");
      const all = options();
      // The function name alone, from the first of the option's two child
      // divs -- not the option's whole `textContent`, which runs the name and
      // the description together with no separator ("PRODUCTResult of...")
      // while the reader composes an accessible name with one. Matching the
      // name is what this case is about anyway.
      const lastName = all[all.length - 1].querySelector("div")!.textContent!;

      act(() => {
        list.focus();
      });
      fireEvent.keyDown(list, { key: "End" });
      fireEvent.keyDown(list, { key: "ArrowDown" });

      await virtual.start({ container: list });
      const spokenAll: string[] = [];
      // Generous, and deliberately not tuned to the list length: each option
      // yields several phrases (enter, name, description, exit), so a cap set
      // near the option count silently truncates the walk before the last
      // entry and the assertion below then fails for the wrong reason. The
      // loop exits on its own when the reader stops moving.
      for (let i = 0; i < 1000; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const phrase = await virtual.lastSpokenPhrase();
        if (spokenAll.length && phrase === spokenAll[spokenAll.length - 1])
          break;
        spokenAll.push(phrase);
        // eslint-disable-next-line no-await-in-loop
        await virtual.next();
      }
      await virtual.stop();

      // Every entry is reachable in the tree -- the list is traversable, which
      // is the half of the ticket that removing focus could have broken.
      expect(spokenAll.length).toBeGreaterThan(all.length);
      expect(spokenAll.join(" | ")).toContain(lastName!.replace(/\s+/g, " "));
      // ...and the boundary held: the active option is still the last one.
      expect(activeId()).toBe(all[all.length - 1].id);
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
