import _ from "lodash";
import React, { useCallback, useContext } from "react";
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
};

const FormulaSearch: React.FC<FormulaSearchProps> = ({ idBase, ...props }) => {
  const {
    context,
    setContext,
    refs: { cellInput, fxInput, globalCache },
  } = useContext(WorkbookContext);
  const { info } = locale(context);

  const candidates = context.functionCandidates;
  const activeIndex = context.functionCandidatesIndex;

  const accept = useCallback(
    (index: number) => {
      const name = candidates[index]?.n;
      const editor = cellInput.current;
      if (!name || editor == null) return;

      // Resolved out here, once. Inside the recipe React may re-derive it from
      // an editor the first invocation has already written to, which appends a
      // second bracket -- `=AVERAGEIF((` from one click.
      const nextText = formulaTextAfterAccept(editor.innerText, name);
      setContext((draftCtx) => {
        acceptFormulaSuggestion(
          draftCtx,
          fxInput.current,
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
    [candidates, cellInput, fxInput, globalCache, setContext]
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
