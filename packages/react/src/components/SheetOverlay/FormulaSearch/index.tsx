import _ from "lodash";
import React, { useCallback, useContext, useEffect, useRef } from "react";
import {
  acceptFormulaSuggestion,
  announceEditorInput,
  formulaTextAfterAccept,
  locale,
} from "@fortune-sheet/core";
import WorkbookContext from "../../../context";
import "./index.css";

/**
 * The ids `aria-activedescendant` points at.
 *
 * They are derived from a base the *parent* owns, not generated here, because
 * the element that has to reference an option (the cell input, or the formula
 * bar) is a sibling of this list rather than a descendant — so the id cannot
 * originate in this component. `CustomSort` draws the same line for the same
 * reason.
 *
 * The base is a `useId()` value, which makes the ids unique per workbook
 * instance. That matters here specifically: the simulations mount one
 * `Workbook` per notebook section, and a fixed id would put duplicates in the
 * document and let `aria-activedescendant` resolve to another sheet's list.
 */
export const formulaSuggestionsListboxId = (idBase: string) =>
  `${idBase}formula-suggestions`;

export const formulaSuggestionOptionId = (idBase: string, index: number) =>
  `${idBase}formula-suggestion-${index}`;

type FormulaSearchProps = React.HTMLAttributes<HTMLDivElement> & {
  idBase: string;
  /**
   * The editor an accept writes into, and the field it mirrors the result to.
   *
   * Declared by the parent for the same reason `idBase` is: this component has
   * two of them. `InputBox` renders it under the cell, where the editor is
   * `cellInput`; `FxEditor` renders the same component under the formula bar,
   * where it is `fxInput`. Reaching into `refs.cellInput` from in here would
   * make a click on the bar's list write into the cell editor — and, because
   * `acceptFormulaSuggestion` ends in `moveToEnd`, whose first branch calls
   * `focus()`, it would also move focus out of the field being typed in with
   * nothing announcing it (WCAG 2.4.3). `preventDefault` on the mousedown
   * stops the browser moving focus; it cannot stop a programmatic `focus()`.
   *
   * The pair is passed in the same order `handleFormulaInput` already takes.
   */
  editorRef: React.MutableRefObject<HTMLDivElement | null>;
  mirrorRef: React.MutableRefObject<HTMLDivElement | null>;
};

const FormulaSearch: React.FC<FormulaSearchProps> = ({
  idBase,
  editorRef,
  mirrorRef,
  ...props
}) => {
  const {
    context,
    setContext,
    refs: { globalCache },
  } = useContext(WorkbookContext);
  const { info } = locale(context);

  const candidates = context.functionCandidates;
  const activeIndex = context.functionCandidatesIndex;

  /**
   * One accept per list.
   *
   * The `!name` bail below already covers a second call once
   * `functionCandidates` has been cleared, but only after a render has
   * intervened -- a directly-dispatched pointer sequence
   * (`mousedown`+`mouseup`+`click`, which is what `userEvent.click` and some AT
   * bridges produce) arrives in one task with no render in between, and the
   * second call would run against an editor whose text is already `=AVERAGE(`,
   * producing the double-bracket shape `nextText` below exists to avoid --
   * measured as `=AVERAGE((` with the latch removed.
   *
   * `acceptFormulaSuggestion` assigns `ctx.functionCandidates = []` inside the
   * immer recipe, so the array identity always changes and this effect always
   * resets the latch -- both when an accept empties the list and when a new
   * prefix repopulates it.
   */
  const accepted = useRef(false);
  useEffect(() => {
    accepted.current = false;
  }, [candidates]);

  const accept = useCallback(
    (index: number) => {
      if (accepted.current) return;
      const name = candidates[index]?.n;
      const editor = editorRef.current;
      if (!name || editor == null) return;
      // Latched only past the bails above, so a call that accepts nothing does
      // not spend the one accept this list is allowed.
      accepted.current = true;

      // Resolved out here, once. Inside the recipe React may re-derive it from
      // an editor the first invocation has already written to, which appends a
      // second bracket -- `=AVERAGEIF((` from one click.
      const nextText = formulaTextAfterAccept(editor.innerText, name);
      setContext((draftCtx) => {
        acceptFormulaSuggestion(
          draftCtx,
          mirrorRef.current,
          editor,
          name,
          nextText
        );
      });
      // The pointer route needs this as much as the keyboard one: the click
      // itself tells a host nothing about what the text became. Cleared here
      // for the reason given at the matching line in `InputBox`.
      globalCache.ignoreNextInput = true;
      announceEditorInput(editor);
      delete globalCache.ignoreNextInput;
    },
    [candidates, editorRef, mirrorRef, globalCache, setContext]
  );

  const highlight = useCallback(
    (index: number) => {
      setContext((draftCtx) => {
        draftCtx.functionCandidatesIndex = index;
      });
    },
    [setContext]
  );

  if (_.isEmpty(candidates)) return null;

  return (
    <div
      {...props}
      id={formulaSuggestionsListboxId(idBase)}
      className="luckysheet-formula-search-c"
      role="listbox"
      aria-label={info.formulaSuggestions}
    >
      {candidates.map((v, index) => (
        <div
          key={v.n}
          id={formulaSuggestionOptionId(idBase, index)}
          role="option"
          aria-selected={index === activeIndex}
          data-func={v.n}
          className={`luckysheet-formula-search-item ${
            index === activeIndex ? "luckysheet-formula-search-item-active" : ""
          }`}
          // On mousedown, and preventing the default. A `click` handler is too
          // late: the pointer press blurs the contenteditable first, which
          // commits or cancels the edit, so by the time the click arrived there
          // was no edit session left to insert into. Preventing the default
          // keeps focus in the editor.
          //
          // The legacy `luckysheet-mousedown-cancel` opt-out is not usable for
          // this — it is commented out in both `core/events/mouse.ts` and
          // `core/events/keyboard.ts`.
          onMouseDown={(e) => {
            e.preventDefault();
            accept(index);
          }}
          // Assistive technology activates an element by dispatching a *click*
          // and nothing else — a screen reader's "activate" (NVDA's Enter in
          // browse mode, VoiceOver's VO-Space, a touch reader's double-tap)
          // never produces a mousedown — so with the handler above alone this
          // option is inert to the users the list was exposed for. That bites
          // hardest on the formula bar, where the arrow and Enter handling are
          // commented out and the pointer accept is the whole of its
          // operability.
          //
          // A real pointer press cannot reach this twice: the accept above
          // clears `functionCandidates`, so the list is unmounted before the
          // click is delivered. The `accepted` latch covers the synthesized
          // sequence, which arrives with no render in between.
          onClick={() => accept(index)}
          // Hovering moves the highlight, so the entry a click accepts is
          // always the entry shown as current. Without it the pointer and the
          // arrow keys could disagree, and a click would accept whatever the
          // keyboard last left highlighted.
          onMouseEnter={() => highlight(index)}
        >
          <div className="luckysheet-formula-search-func">{v.n}</div>
          <div className="luckysheet-formula-search-detail">{v.d}</div>
        </div>
      ))}
    </div>
  );
};

export default FormulaSearch;
