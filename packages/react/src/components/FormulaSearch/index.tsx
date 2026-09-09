import React, {
  useContext,
  useState,
  useMemo,
  useCallback,
  useId,
  useRef,
} from "react";
import {
  cancelNormalSelected,
  locale,
  setCaretPosition,
} from "@fortune-sheet/core";
import _ from "lodash";
import WorkbookContext from "../../context";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import "./index.css";

/**
 * `titleId` is supplied by the opener rather than exported as a module
 * constant, so two workbooks on one page cannot both render the same id and
 * have each other's `aria-labelledby` resolve to the first one -- the same
 * reasoning `CustomSort` records for its own title id. The opener needs the id
 * because it also passes it to `showDialog`'s `labelledBy`: without that the
 * dialog renders unnamed, the gap `useDialog`'s own comment describes.
 */
export const FormulaSearch: React.FC<{
  onCancel: () => void;
  titleId: string;
}> = ({ onCancel: _onCancel, titleId }) => {
  const {
    context,
    setContext,
    refs: { cellInput, globalCache },
  } = useContext(WorkbookContext);
  const [selectedType, setSelectedType] = useState(0);
  const [selectedFuncIndex, setSelectedFuncIndex] = useState(0);
  const [searchText, setSearchText] = useState("");
  const { formulaMore, functionlist, button } = locale(context);
  const idBase = useId();
  const categoryLabelId = `${idBase}category`;
  const listLabelId = `${idBase}list`;
  const listRef = useRef<HTMLDivElement>(null);
  // Arrow-key movement within the list. Reused rather than reimplemented --
  // the same hook drives the toolbar and the sheet-tab strip. It moves DOM
  // focus only; the one-tab-stop half is the roving `tabIndex` below.
  useRovingFocus({
    containerRef: listRef,
    orientation: "vertical",
    itemSelector: '[role="option"]',
  });

  const typeList = useMemo(
    () => [
      { t: 0, n: formulaMore.Math },
      { t: 1, n: formulaMore.Statistical },
      { t: 2, n: formulaMore.Lookup },
      { t: 3, n: formulaMore.luckysheet },
      { t: 4, n: formulaMore.dataMining },
      { t: 5, n: formulaMore.Database },
      { t: 6, n: formulaMore.Date },
      { t: 7, n: formulaMore.Filter },
      { t: 8, n: formulaMore.Financial },
      { t: 9, n: formulaMore.Engineering },
      { t: 10, n: formulaMore.Logical },
      { t: 11, n: formulaMore.Operator },
      { t: 12, n: formulaMore.Text },
      { t: 13, n: formulaMore.Parser },
      { t: 14, n: formulaMore.Array },
      { t: -1, n: formulaMore.other },
    ],
    [formulaMore]
  );

  const filteredFunctionList = useMemo(() => {
    if (searchText) {
      const list = [];
      const text = _.cloneDeep(searchText.toUpperCase());
      for (let i = 0; i < functionlist.length; i += 1) {
        if (/^[a-zA-Z]+$/.test(text)) {
          if (functionlist[i].n.indexOf(text) !== -1) {
            list.push(functionlist[i]);
          }
        } else if (functionlist[i].a.indexOf(text) !== -1) {
          list.push(functionlist[i]);
        }
      }
      return list;
    }
    return _.filter(functionlist, (v) => v.t === selectedType);
  }, [functionlist, selectedType, searchText]);

  const onConfirm = useCallback(() => {
    const last =
      context.luckysheet_select_save?.[
        context.luckysheet_select_save.length - 1
      ];
    let row_index = last?.row_focus;
    let col_index = last?.column_focus;
    if (!last) {
      row_index = 0;
      col_index = 0;
    } else {
      if (row_index == null) {
        [row_index] = last.row;
      }
      if (col_index == null) {
        [col_index] = last.column;
      }
    }
    const formulaTxt = `<span dir="auto" class="luckysheet-formula-text-color">=</span><span dir="auto" class="luckysheet-formula-text-color">${filteredFunctionList[
      selectedFuncIndex
    ].n.toUpperCase()}</span><span dir="auto" class="luckysheet-formula-text-color">(</span>`;
    setContext((ctx) => {
      if (cellInput.current != null) {
        ctx.luckysheetCellUpdate = [row_index, col_index];
        globalCache.doNotUpdateCell = true;
        cellInput.current.innerHTML = formulaTxt;
        const spans = cellInput.current.childNodes;
        if (!_.isEmpty(spans)) {
          setCaretPosition(
            ctx,
            spans[spans.length - 1] as HTMLSpanElement,
            0,
            1
          );
        }
        ctx.functionHint =
          filteredFunctionList[selectedFuncIndex].n.toUpperCase();
        ctx.functionCandidates = [];
        ctx.functionCandidatesIndex = 0;
        if (_.isEmpty(ctx.formulaCache.functionlistMap)) {
          for (let i = 0; i < functionlist.length; i += 1) {
            ctx.formulaCache.functionlistMap[functionlist[i].n] =
              functionlist[i];
          }
        }
        _onCancel();
      }
    });
  }, [
    cellInput,
    context.luckysheet_select_save,
    filteredFunctionList,
    globalCache,
    selectedFuncIndex,
    setContext,
    _onCancel,
    functionlist,
  ]);

  const onCancel = useCallback(() => {
    setContext((ctx) => {
      cancelNormalSelected(ctx);
      if (cellInput.current) {
        cellInput.current.innerHTML = "";
      }
    });
    _onCancel();
  }, [_onCancel, cellInput, setContext]);

  return (
    <div id="luckysheet-search-formula">
      <div className="inpbox">
        <div id={titleId}>{formulaMore.findFunctionTitle}：</div>
        <input
          className="formulaInputFocus"
          id="searchFormulaListInput"
          aria-labelledby={titleId}
          placeholder={formulaMore.tipInputFunctionName}
          spellCheck="false"
          onChange={(e) => {
            setSearchText(e.target.value);
            // Without this the index survives into a shorter filtered list,
            // where it addresses nothing: `onConfirm` then dereferences
            // `filteredFunctionList[selectedFuncIndex].n` and throws, and the
            // roving tabIndex below would leave the list with no tab stop.
            // The category `select` already did this; the search box did not.
            setSelectedFuncIndex(0);
          }}
        />
      </div>
      <div className="selbox">
        <span id={categoryLabelId}>{formulaMore.selectCategory}：</span>
        <select
          id="formulaTypeSelect"
          aria-labelledby={categoryLabelId}
          onChange={(e) => {
            setSelectedType(parseInt(e.target.value, 10));
            setSelectedFuncIndex(0);
          }}
        >
          {typeList.map((v) => (
            <option key={v.t} value={v.t}>
              {v.n}
            </option>
          ))}
        </select>
      </div>
      <div className="listbox" style={{ height: 200 }}>
        <div id={listLabelId}>{formulaMore.selectFunctionTitle}：</div>
        {/*
          A `listbox`, not a stack of clickable divs. Every entry used to carry
          `tabIndex={0}`, so this list was ~400 tab stops -- Tab could not get
          past it, and VoiceOver stopped on each entry in its linear pass.

          A bare `tabIndex={-1}` sweep would have fixed that by making the list
          unreachable instead, which is the worse defect the ticket warns about
          in its own last line. Roving tabIndex is what satisfies both: exactly
          one entry is tabbable, and the arrow keys move within the list.
        */}
        <div
          ref={listRef}
          className="formulaList"
          role="listbox"
          aria-labelledby={listLabelId}
        >
          {filteredFunctionList.map((v, index) => (
            <div
              className={`listBox${index === selectedFuncIndex ? " on" : ""}`}
              key={v.n}
              role="option"
              aria-selected={index === selectedFuncIndex}
              onClick={() => setSelectedFuncIndex(index)}
              // Selection follows focus, so the arrow keys move the selected
              // option rather than silently decoupling it from the one `on`
              // highlights and `onConfirm` inserts. It also keeps the pointer
              // path working: a click focuses before it fires onClick.
              onFocus={() => setSelectedFuncIndex(index)}
              tabIndex={index === selectedFuncIndex ? 0 : -1}
            >
              <div>{v.n}</div>
              <div>{v.a}</div>
            </div>
          ))}
        </div>
      </div>
      {/*
        Real buttons. These were focusable `<div>`s with an onClick and --
        unlike `Dialog`'s own copies of this pattern -- no
        `onKeyDown={activateOnEnterOrSpace}`, so they took focus and then did
        nothing at all on Enter or Space. A `<button>` gets the role, the
        keyboard activation and the focus ring from the platform instead of
        re-implementing all three.

        The shared `fortune-message-box-button` class is left alone: 10 more
        instances across `Dialog`, `SearchReplace` and `FormatSearch` share
        this shape, and converting the framework is a separate ticket, not a
        hunk in this one.
      */}
      <div className="fortune-dialog-box-button-container">
        <button
          type="button"
          className="fortune-message-box-button button-primary"
          onClick={onConfirm}
        >
          {button.confirm}
        </button>
        <button
          type="button"
          className="fortune-message-box-button button-default"
          onClick={onCancel}
        >
          {button.cancel}
        </button>
      </div>
    </div>
  );
};
