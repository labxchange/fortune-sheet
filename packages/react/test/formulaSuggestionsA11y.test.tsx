import React from "react";
import { render, fireEvent, act } from "@testing-library/react";
import axe from "axe-core";
import { produce } from "immer";
import {
  defaultContext,
  defaultSettings,
  functionHTMLGenerate,
  Context,
} from "@fortune-sheet/core";
import WorkbookContext from "../src/context";
import InputBox from "../src/components/SheetOverlay/InputBox";

// The suggestion list as an input surface and as something a screen reader can
// perceive. It used to be neither: no click handler at all, and no role, so a
// pointer user could not accept an entry and a screen-reader user was not told
// the list existed.
//
// The highlight lives in `functionCandidatesIndex` rather than in a DOM class,
// which is what lets the rendered highlight, the pointer, the keyboard and
// `aria-activedescendant` all read one answer. Previously the class was
// mutated by hand while the renderer re-asserted `index === 0` every render,
// so a re-render silently moved the learner back to the first entry.
describe("formula suggestion list", () => {
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

  const setup = ({
    candidates = [
      { n: "AVERAGE", d: "Returns the average" },
      { n: "AVERAGEA", d: "Returns the average of values" },
      { n: "AVERAGEIF", d: "Conditional average" },
    ] as any[],
    index = 0,
    typed = "=AV",
  } = {}) => {
    const refs = makeRefs();
    const ctx = defaultContext(refs as any) as Context;
    ctx.allowEdit = true;
    ctx.currentSheetId = "sheet-1";
    ctx.luckysheetfile = [
      {
        id: "sheet-1",
        name: "Sheet1",
        order: 0,
        data: [
          [null, null, null],
          [null, null, null],
          [null, null, null],
        ],
      },
    ] as any;
    ctx.luckysheet_select_save = [
      { row: [1, 1], column: [1, 1], row_focus: 1, column_focus: 1 } as any,
    ];
    ctx.luckysheetCellUpdate = [1, 1];
    ctx.visibledatarow = [20, 40, 60];
    ctx.visibledatacolumn = [74, 148, 222];
    ctx.config = {};
    ctx.functionCandidates = candidates;
    ctx.functionCandidatesIndex = index;

    // Committed straight back onto `ctx`, so a re-render reads what the
    // producer wrote -- the point of several of these tests is what survives a
    // re-render.
    const setContext = (recipe: (draft: Context) => void) => {
      Object.assign(ctx, produce(ctx, recipe));
    };

    const fxInput = document.createElement("div");
    fxInput.id = "luckysheet-functionbox-cell";
    document.body.appendChild(fxInput);
    refs.fxInput.current = fxInput;

    const value = {
      context: ctx,
      setContext,
      settings: defaultSettings,
      refs,
      handleUndo: () => {},
      handleRedo: () => {},
    } as any;

    const view = render(
      <WorkbookContext.Provider value={value}>
        <InputBox />
      </WorkbookContext.Provider>
    );

    const cellInput = view.container.querySelector<HTMLElement>(
      "#luckysheet-rich-text-editor"
    )!;
    cellInput.innerHTML = functionHTMLGenerate(typed);
    // The list only renders while the cell input holds focus.
    cellInput.focus();

    const rerender = () =>
      view.rerender(
        <WorkbookContext.Provider value={{ ...value, context: ctx }}>
          <InputBox />
        </WorkbookContext.Provider>
      );

    act(() => {
      rerender();
    });

    return { ctx, refs, view, cellInput, fxInput, rerender };
  };

  const listbox = () => document.querySelector('[role="listbox"]');
  const options = () =>
    Array.from(document.querySelectorAll('[role="option"]'));

  afterEach(() => {
    document.body.innerHTML = "";
  });

  describe("pointer", () => {
    it("accepts a suggestion on mousedown", () => {
      const { cellInput } = setup();

      act(() => {
        fireEvent.mouseDown(options()[0]);
      });

      expect(cellInput.innerText).toBe("=AVERAGE(");
    });

    it("prevents the default so the editor keeps focus", () => {
      setup();

      // A `click` handler would be too late: the press blurs the
      // contenteditable first, committing or cancelling the edit, so there is
      // no edit session left to insert into by the time click fires.
      const prevented = !fireEvent.mouseDown(options()[0]);

      expect(prevented).toBe(true);
    });

    it("accepts the entry pointed at, not the highlighted one", () => {
      const { cellInput } = setup({ index: 0 });

      act(() => {
        fireEvent.mouseEnter(options()[2]);
      });
      act(() => {
        fireEvent.mouseDown(options()[2]);
      });

      expect(cellInput.innerText).toBe("=AVERAGEIF(");
    });

    it("moves the highlight on hover, so pointer and keyboard agree", () => {
      const { ctx } = setup({ index: 0 });

      act(() => {
        fireEvent.mouseEnter(options()[1]);
      });

      expect(ctx.functionCandidatesIndex).toBe(1);
    });
  });

  // A host cannot see a programmatic edit. Typing fires `input`; writing
  // `innerHTML` fires nothing — so anything watching the editor through
  // `input` saw the learner type `=AV` and then apparently stop.
  //
  // The spreadsheet simulations do exactly that: they track the in-progress
  // cell text on `document` `input` and validate steps against it, so a step
  // reading "type AVERAGE" could never pass from an accept. That is the whole
  // of the reported defect on the keyboard route.
  describe("announcing the edit to the host", () => {
    const countInputEvents = (run: () => void) => {
      let n = 0;
      const onInput = () => {
        n += 1;
      };
      document.addEventListener("input", onInput);
      run();
      document.removeEventListener("input", onInput);
      return n;
    };

    it("fires an input event on a keyboard accept", () => {
      const { cellInput } = setup();

      const n = countInputEvents(() => {
        act(() => {
          cellInput.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "Tab",
              code: "Tab",
              bubbles: true,
              cancelable: true,
            })
          );
        });
      });

      expect(n).toBe(1);
    });

    it("fires an input event on a pointer accept", () => {
      setup();

      const n = countInputEvents(() => {
        act(() => {
          fireEvent.mouseDown(options()[0]);
        });
      });

      expect(n).toBe(1);
    });

    it("carries the accepted text, not the fragment it replaced", () => {
      const { cellInput } = setup();
      let seen = "";
      const onInput = () => {
        seen = cellInput.innerText;
      };
      document.addEventListener("input", onInput);
      act(() => {
        fireEvent.mouseDown(options()[0]);
      });
      document.removeEventListener("input", onInput);

      // Dispatched after the edit, so a host reading the editor from inside
      // the handler sees the result rather than `=AV`.
      expect(seen).toBe("=AVERAGE(");
    });

    it("does not let the workbook process its own announcement", () => {
      const { ctx, refs, cellInput } = setup();

      act(() => {
        fireEvent.mouseDown(options()[0]);
      });

      // `handleFormulaInput` must not run for this event: it would use the
      // `preText` of whatever keydown came last, and its caret restore cannot
      // survive a whole identifier changing at once. The flag is consumed, so
      // the *next* real keystroke is processed normally.
      expect(cellInput.innerText).toBe("=AVERAGE(");
      expect(ctx.functionCandidates).toEqual([]);
      expect(refs.globalCache.ignoreNextInput).toBeUndefined();
    });

    it("still processes the next real keystroke after an accept", () => {
      // The suppression must last exactly one dispatch. If it leaked, the
      // learner's next character would be dropped from the formula pipeline —
      // a far worse bug than the one being fixed, and a silent one.
      const { cellInput } = setup();

      act(() => {
        fireEvent.mouseDown(options()[0]);
      });

      // A real keystroke: the browser mutates the DOM, then `input` fires.
      // Plain text, so that `handleFormulaInput` re-tokenising it into spans
      // is observable proof the pipeline ran rather than returned early.
      act(() => {
        cellInput.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "B",
            code: "KeyB",
            keyCode: 66,
            bubbles: true,
            cancelable: true,
          })
        );
        cellInput.innerHTML = "=AVERAGE(B";
        fireEvent.input(cellInput);
      });

      expect(cellInput.innerHTML).toContain("<span");
      expect(cellInput.innerText).toBe("=AVERAGE(B");
    });
  });

  describe("keyboard navigation", () => {
    const arrow = (cellInput: HTMLElement, key: string) =>
      act(() => {
        cellInput.dispatchEvent(
          new KeyboardEvent("keydown", {
            key,
            code: key,
            bubbles: true,
            cancelable: true,
          })
        );
      });

    it("moves down through the entries", () => {
      const { ctx, cellInput } = setup({ index: 0 });

      arrow(cellInput, "ArrowDown");

      expect(ctx.functionCandidatesIndex).toBe(1);
    });

    it("wraps from the last entry to the first", () => {
      const { ctx, cellInput } = setup({ index: 2 });

      arrow(cellInput, "ArrowDown");

      expect(ctx.functionCandidatesIndex).toBe(0);
    });

    it("wraps from the first entry to the last", () => {
      const { ctx, cellInput } = setup({ index: 0 });

      arrow(cellInput, "ArrowUp");

      expect(ctx.functionCandidatesIndex).toBe(2);
    });

    it("keeps its position across a re-render", () => {
      const { ctx, cellInput, rerender } = setup({ index: 0 });

      arrow(cellInput, "ArrowDown");
      act(() => {
        rerender();
      });

      // The defect this whole state move exists for: the renderer used to
      // re-assert `index === 0`, so a re-render wiped the hand-set class and
      // put the learner silently back on the first entry -- and an accept then
      // inserted a function they had navigated away from.
      expect(ctx.functionCandidatesIndex).toBe(1);
      expect(options()[1].getAttribute("aria-selected")).toBe("true");
      expect(options()[0].getAttribute("aria-selected")).toBe("false");
    });
  });

  describe("structure exposed to assistive technology", () => {
    it("is a named listbox of options", () => {
      setup();

      expect(listbox()).not.toBeNull();
      expect(listbox()!.getAttribute("aria-label")).toBe("Formula suggestions");
      expect(options()).toHaveLength(3);
    });

    it("marks the current entry as selected and the others as not", () => {
      setup({ index: 1 });

      expect(options().map((o) => o.getAttribute("aria-selected"))).toEqual([
        "false",
        "true",
        "false",
      ]);
    });

    it("points the cell input at the current option", () => {
      const { cellInput } = setup({ index: 1 });

      const active = cellInput.getAttribute("aria-activedescendant");
      expect(active).toBe(options()[1].id);
      expect(cellInput.getAttribute("aria-controls")).toBe(listbox()!.id);
    });

    it("gives every option a non-empty id", () => {
      setup();

      const ids = options().map((o) => o.id);
      expect(ids.every(Boolean)).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("keeps ids unique across two mounted instances", () => {
      // The simulations mount one Workbook per notebook section, so this is the
      // real arrangement rather than a hypothetical: a fixed id would put
      // duplicates in the document and let aria-activedescendant resolve into
      // the other sheet's list.
      const first = setup();
      const firstIds = options().map((o) => o.id);
      const firstActive = first.cellInput.getAttribute("aria-activedescendant");

      const second = setup();
      const allIds = options().map((o) => o.id);
      const secondOwnIds = allIds.filter((id) => !firstIds.includes(id));

      expect(secondOwnIds.length).toBe(3);
      expect(new Set(allIds).size).toBe(allIds.length);
      // Each input references an option from its own list.
      expect(firstIds).toContain(firstActive);
      expect(secondOwnIds).toContain(
        second.cellInput.getAttribute("aria-activedescendant")
      );
    });

    it("clears the reference when the list closes", () => {
      const { ctx, cellInput, rerender } = setup();

      act(() => {
        ctx.functionCandidates = [];
        rerender();
      });

      // Not merely re-pointed: an aria-activedescendant naming an element that
      // no longer exists is worse than none, because some screen readers go
      // silent on the owning field entirely.
      expect(cellInput.getAttribute("aria-activedescendant")).toBeNull();
      expect(cellInput.getAttribute("aria-controls")).toBeNull();
      expect(listbox()).toBeNull();
    });

    it("leaves the cell input's own role, name and read-only state alone", () => {
      const { cellInput, ctx, rerender } = setup();
      const before = {
        role: cellInput.getAttribute("role"),
        label: cellInput.getAttribute("aria-label"),
        readonly: cellInput.getAttribute("aria-readonly"),
        multiline: cellInput.getAttribute("aria-multiline"),
      };

      act(() => {
        ctx.functionCandidates = [];
        rerender();
      });

      // The suggestion work is additive. Re-roling this element to `combobox`
      // would have changed what is announced on every cell move in every
      // consumer, which is why `aria-expanded` is absent -- it is not permitted
      // on `role="textbox"`.
      expect({
        role: cellInput.getAttribute("role"),
        label: cellInput.getAttribute("aria-label"),
        readonly: cellInput.getAttribute("aria-readonly"),
        multiline: cellInput.getAttribute("aria-multiline"),
      }).toEqual(before);
      expect(before.role).toBe("textbox");
      expect(cellInput.getAttribute("aria-expanded")).toBeNull();
    });
  });

  describe("announcement", () => {
    const region = () => document.getElementById("sr-formulaSuggestions");

    // The count trails, after a colon, rather than leading the sentence. These
    // locale files carry no plural machinery, so "${count} formula suggestions
    // available." announces "1 formula suggestions available." for every prefix
    // matching exactly one function — `=AVEDEV`, `=SUMIFS` and plenty more.
    it("announces the count when the list appears", () => {
      setup();

      expect(region()!.textContent).toBe("Formula suggestions available: 3.");
    });

    it("reads correctly when exactly one function matches", () => {
      const { ctx, rerender } = setup();

      act(() => {
        ctx.functionCandidates = [];
        rerender();
      });
      act(() => {
        ctx.functionCandidates = [{ n: "AVEDEV" }] as any;
        rerender();
      });

      expect(region()!.textContent).toBe("Formula suggestions available: 1.");
    });

    it("is polite, not assertive", () => {
      setup();

      // The learner is mid-typing; interrupting them is the wrong trade. It
      // also does not race `#sr-selection`, which is assertive but silent
      // while the selection is not moving.
      expect(region()!.getAttribute("role")).toBe("status");
    });

    it("does not re-announce when the list narrows", () => {
      const { ctx, rerender } = setup();
      expect(region()!.textContent).toBe("Formula suggestions available: 3.");

      act(() => {
        ctx.functionCandidates = [{ n: "AVERAGE" }];
        rerender();
      });

      // Movement within an open list is spoken by the screen reader following
      // aria-activedescendant, so re-announcing the count on every keystroke
      // would only talk over the typing.
      expect(region()!.textContent).toBe("Formula suggestions available: 3.");
    });

    it("clears when the list closes, and speaks again next time it opens", () => {
      const { ctx, rerender } = setup();

      act(() => {
        ctx.functionCandidates = [];
        rerender();
      });
      expect(region()!.textContent).toBe("");

      act(() => {
        ctx.functionCandidates = [{ n: "SUM" }, { n: "SUMIF" }];
        rerender();
      });
      expect(region()!.textContent).toBe("Formula suggestions available: 2.");
    });

    it("keeps the region mounted while the list is closed", () => {
      const { ctx, rerender } = setup();

      act(() => {
        ctx.functionCandidates = [];
        rerender();
      });

      // A live region has to be in the document before its text changes for
      // the change to be announced at all.
      expect(region()).not.toBeNull();
    });
  });
  // The ARIA claims this change makes, checked by axe rather than only by the
  // attribute assertions above -- those say what was written, this says whether
  // the combination is legal. The rule set is the subset that can actually
  // judge a listbox/option/activedescendant structure; colour-contrast rules
  // are omitted because jsdom loads no stylesheets, following the reasoning in
  // `contextMenuSortAxe.test.tsx`.
  //
  // `duplicate-id-aria` is the one that matters most here: it covers ids
  // reached through an IDREF, which is exactly what the per-instance `useId()`
  // base exists to keep unique.
  describe("axe audit of the open list", () => {
    const RULES = [
      "aria-required-children",
      "aria-required-parent",
      "aria-required-attr",
      "aria-allowed-attr",
      "aria-allowed-role",
      "aria-valid-attr-value",
      "aria-valid-attr",
      "duplicate-id-aria",
      "nested-interactive",
      "presentation-role-conflict",
    ];

    const runAxe = async (root: HTMLElement) => {
      const results = await axe.run(root, {
        runOnly: { type: "rule", values: RULES },
      });
      const flatten = (list: axe.Result[]) =>
        list.flatMap((r) => r.nodes.map(() => r.id));
      // `incomplete` is reported, not dropped: axe-core does not support jsdom,
      // so a check needing layout or an unresolvable reference says "can't
      // tell" rather than "violation". Reading only `violations` would count an
      // unknown share of these rules as passes.
      return {
        violations: flatten(results.violations),
        incomplete: flatten(results.incomplete),
      };
    };

    it("reports no violations with a suggestion list open", async () => {
      setup();

      const { violations } = await runAxe(document.body);

      expect(violations).toEqual([]);
    });

    it("reports no IDREF collisions across two mounted instances", async () => {
      setup();
      setup();

      const { violations } = await runAxe(document.body);

      // Two lists, two inputs, two aria-activedescendant references. A fixed id
      // would have every option colliding and each input pointing at the wrong
      // list's entry.
      expect(violations).toEqual([]);
    });
  });
});
