import {
  Context,
  acceptFormulaSuggestion,
  formulaTextAfterAccept,
  functionHTMLGenerate,
  rangeHightlightselected,
} from "../src";
import { contextFactory } from "./factories/context";

// The suggestion list a learner gets while typing a formula: which entries it
// offers, in which order, and what accepting one puts in the cell.
//
// Order is the part that mattered. The list's first entry is what Enter, Tab
// or a click accepts, and the buckets were built with `unshift` against an
// ascending `functionlist` -- so the *longest* match was offered first. Typing
// "=AVER" pre-selected AVERAGEIFS, which inserts and evaluates perfectly well
// while being the wrong function, so a step checking for `=AVERAGE(...)` could
// only ever be satisfied by typing the whole name out.
describe("formula suggestions", () => {
  /**
   * A cell editor holding a part-typed formula, with the caret at the end.
   *
   * `rangeHightlightselected` reads the caret to find the identifier the
   * suggestions are for, so the Selection is the input here, not an
   * afterthought.
   *
   * Only `innerHTML` is assigned. This jsdom implements `innerText` in both
   * directions, so the getter the production code reads already derives from
   * the markup -- and assigning it as well would *replace* the tokenised spans
   * with a single text node, leaving nothing for the caret to sit inside.
   */
  const editorWithFormula = (text: string) => {
    const editor = document.createElement("div");
    editor.id = "luckysheet-rich-text-editor";
    document.body.appendChild(editor);
    editor.innerHTML = functionHTMLGenerate(text);

    const spans = editor.querySelectorAll("span");
    const lastText = spans[spans.length - 1].firstChild!;
    const range = document.createRange();
    range.setStart(lastText, lastText.textContent!.length);
    range.collapse(true);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    return editor;
  };

  const suggestionsFor = (text: string) => {
    const ctx = contextFactory({}) as Context;
    const editor = editorWithFormula(text);
    rangeHightlightselected(ctx, editor);
    return { ctx, editor, names: ctx.functionCandidates.map((c) => c.n) };
  };

  afterEach(() => {
    document.body.innerHTML = "";
  });

  describe("ordering", () => {
    it("offers prefix matches in ascending order, shortest first", () => {
      const { names } = suggestionsFor("=AVER");

      // The defect, stated as an assertion: AVERAGE must come before
      // AVERAGEIFS, because the first entry is the one an accept takes.
      expect(names.indexOf("AVERAGE")).toBeLessThan(
        names.indexOf("AVERAGEIFS")
      );
      expect(names[0]).toBe("AVERAGE");
    });

    it("puts an exact match first, ahead of longer names extending it", () => {
      const { names } = suggestionsFor("=AVERAGE");

      expect(names[0]).toBe("AVERAGE");
      expect(names).toContain("AVERAGEIFS");
    });

    it("puts prefix matches ahead of mere substring matches", () => {
      const { names } = suggestionsFor("=AVER");

      // DAVERAGE contains "AVER" but does not start with it.
      expect(names.indexOf("AVERAGE")).toBeLessThan(names.indexOf("DAVERAGE"));
    });

    it("starts the highlight at the first entry", () => {
      const { ctx } = suggestionsFor("=AVER");

      expect(ctx.functionCandidatesIndex).toBe(0);
    });
  });

  describe("a search that matches nothing", () => {
    it("clears the previous list rather than leaving it open", () => {
      const ctx = contextFactory({}) as Context;

      rangeHightlightselected(ctx, editorWithFormula("=AVER"));
      expect(ctx.functionCandidates.length).toBeGreaterThan(0);
      document.body.innerHTML = "";

      // Returning early on no match used to leave the previous list in place,
      // so narrowing a search until nothing matched kept a dropdown of stale
      // entries open and acceptable. Survivable while the list was only
      // painted; not once its count is announced and its entries are exposed
      // as options describing what was typed.
      rangeHightlightselected(ctx, editorWithFormula("=ZZZZQQ"));
      expect(ctx.functionCandidates).toEqual([]);
      expect(ctx.functionCandidatesIndex).toBe(0);
    });
  });

  describe("accepting a suggestion", () => {
    it("replaces the typed identifier and opens the bracket", () => {
      const ctx = contextFactory({}) as Context;
      const editor = editorWithFormula("=AV");

      acceptFormulaSuggestion(
        ctx,
        null,
        editor,
        "AVERAGE",
        formulaTextAfterAccept(editor.innerText, "AVERAGE")
      );

      expect(editor.innerText).toBe("=AVERAGE(");
    });

    it("replaces only the trailing identifier, leaving the rest of the formula", () => {
      const ctx = contextFactory({}) as Context;
      const editor = editorWithFormula("=1+AV");

      // The hardcoded child offset the previous implementation inserted at
      // assumed the function was the first thing in the cell.
      acceptFormulaSuggestion(
        ctx,
        null,
        editor,
        "AVERAGE",
        formulaTextAfterAccept(editor.innerText, "AVERAGE")
      );

      expect(editor.innerText).toBe("=1+AVERAGE(");
    });

    it("leaves flat markup, not spans nested inside the replaced one", () => {
      const ctx = contextFactory({}) as Context;
      const editor = editorWithFormula("=AV");

      acceptFormulaSuggestion(
        ctx,
        null,
        editor,
        "AVERAGE",
        formulaTextAfterAccept(editor.innerText, "AVERAGE")
      );

      // The Range-surgery version inserted the function and bracket *inside*
      // the emptied identifier span and stranded an empty text node there. The
      // text was right, so it committed correctly and self-healed on the next
      // keystroke -- but the markup disagreed with what typing produces.
      editor.querySelectorAll("span").forEach((span) => {
        expect(span.querySelector("span")).toBeNull();
      });
    });

    it("mirrors the result into the formula bar", () => {
      const ctx = contextFactory({}) as Context;
      const editor = editorWithFormula("=AV");
      const fx = document.createElement("div");
      fx.id = "luckysheet-functionbox-cell";
      document.body.appendChild(fx);

      acceptFormulaSuggestion(
        ctx,
        fx,
        editor,
        "AVERAGE",
        formulaTextAfterAccept(editor.innerText, "AVERAGE")
      );

      // The bar used to keep showing the fragment the learner had typed,
      // because the old path never reached handleFormulaInput's `$copyTo`.
      expect(fx.innerHTML).toContain("AVERAGE");
    });

    it("closes the list and records the accepted function as the hint", () => {
      const ctx = contextFactory({}) as Context;
      const editor = editorWithFormula("=AV");
      ctx.functionCandidates = [{ n: "AVERAGE" }];
      ctx.functionCandidatesIndex = 0;

      acceptFormulaSuggestion(
        ctx,
        null,
        editor,
        "AVERAGE",
        formulaTextAfterAccept(editor.innerText, "AVERAGE")
      );

      expect(ctx.functionCandidates).toEqual([]);
      expect(ctx.functionCandidatesIndex).toBe(0);
      expect(ctx.functionHint).toBe("AVERAGE");
    });

    it("is idempotent, because a React state recipe may run twice", () => {
      const ctx = contextFactory({}) as Context;
      const editor = editorWithFormula("=AV");
      const nextText = formulaTextAfterAccept(editor.innerText, "AVERAGE");

      acceptFormulaSuggestion(ctx, null, editor, "AVERAGE", nextText);
      acceptFormulaSuggestion(ctx, null, editor, "AVERAGE", nextText);

      // Both callers run this inside a `setContext` recipe, and React may
      // invoke an updater more than once per event. When the text was derived
      // in here the second pass read what the first had written, found no
      // trailing identifier, and appended another bracket -- one click gave
      // `=AVERAGE((`. Caught in the browser, not by a unit test, which is why
      // this one exists.
      expect(editor.innerText).toBe("=AVERAGE(");
    });

    it("appends rather than corrupting when there is no trailing identifier", () => {
      // What the doubled-invocation case reduces to: text already ending in a
      // bracket has no identifier to replace.
      expect(formulaTextAfterAccept("=AVERAGE(", "AVERAGE")).toBe("=AVERAGE((");
    });

    it("produces the same text as typing the whole name by hand", () => {
      const ctx = contextFactory({}) as Context;
      const accepted = editorWithFormula("=AV");
      acceptFormulaSuggestion(
        ctx,
        null,
        accepted,
        "AVERAGE",
        formulaTextAfterAccept(accepted.innerText, "AVERAGE")
      );
      const acceptedText = accepted.innerText;
      document.body.innerHTML = "";

      const typed = editorWithFormula("=AVERAGE(");

      // What makes a step unable to tell the two routes apart: the committed
      // formula is read from the editor's text, so if these agree, so do the
      // stored formulas.
      expect(acceptedText).toBe(typed.innerText);
    });
  });
});
