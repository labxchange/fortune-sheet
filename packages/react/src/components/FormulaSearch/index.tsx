import React, {
  useContext,
  useState,
  useMemo,
  useCallback,
  useEffect,
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
  const optionId = (index: number) => `${idBase}function-${index}`;
  // Set by a real pointer press and consumed by the click that follows it.
  // See the option's `onClick` for why the click alone cannot be classified.
  const fromPointer = useRef(false);
  // Detaches the release listeners armed by the last pointer press, so an
  // unmount mid-press cannot leave them attached around a detached option.
  const releaseListeners = useRef<(() => void) | null>(null);
  useEffect(() => () => releaseListeners.current?.(), []);

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

  // The other half of not moving focus: the browser scrolls a focused element
  // into view on its own, and an active descendant is not focused, so an
  // arrow-key walk would otherwise run off the bottom of this
  // `overflow-y: scroll` box with nothing following it. `block: "nearest"`
  // keeps an option that is already visible where it is instead of centring
  // it, so the list does not lurch on every keystroke.
  //
  // Optional-called because jsdom does not implement `scrollIntoView`.
  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>(
      '[aria-selected="true"]'
    );
    active?.scrollIntoView?.({ block: "nearest" });
  }, [selectedFuncIndex]);

  /**
   * `atIndex` defaults to the active option, which is what OK and Enter both
   * want. It is passed explicitly only by an option's own activation, where
   * the index cannot come from state: `setSelectedFuncIndex` has not been
   * applied yet in that same tick, so reading it would insert the *previously*
   * active function.
   */
  const onConfirm = useCallback(
    (atIndex?: number) => {
      const index = atIndex ?? selectedFuncIndex;
      const chosen = filteredFunctionList[index];
      if (chosen == null) return;
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
      const formulaTxt = `<span dir="auto" class="luckysheet-formula-text-color">=</span><span dir="auto" class="luckysheet-formula-text-color">${chosen.n.toUpperCase()}</span><span dir="auto" class="luckysheet-formula-text-color">(</span>`;
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
          ctx.functionHint = chosen.n.toUpperCase();
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
    },
    [
      cellInput,
      context.luckysheet_select_save,
      filteredFunctionList,
      globalCache,
      selectedFuncIndex,
      setContext,
      _onCancel,
      functionlist,
    ]
  );

  const onCancel = useCallback(() => {
    setContext((ctx) => {
      cancelNormalSelected(ctx);
      if (cellInput.current) {
        cellInput.current.innerHTML = "";
      }
    });
    _onCancel();
  }, [_onCancel, cellInput, setContext]);

  // With `aria-activedescendant` the arrow keys are ours to implement: no
  // element moves, so nothing moves them for us. `useRovingFocus` is not
  // reusable here for exactly that reason -- it works by calling `.focus()` on
  // an item, which is the thing this list must not do.
  //
  // Down at the last entry and Up at the first deliberately do nothing, and
  // are deliberately NOT cancelled. That is the ARIA listbox boundary: it has
  // to be discoverable, and a key that is swallowed while changing nothing is
  // a dead key -- the user, or the screen reader driving them, gets a
  // keystroke that did not happen and no fallback can run in its place. The
  // earlier wrapping version had the opposite failure: ArrowDown at the last
  // entry returned to the first, so the arrows were a closed ring with no
  // exit, reported as being trapped in the list.
  //
  // Enter -- and Space -- insert the active function, exactly as OK does.
  // Space is here because VoiceOver's VO-Space reaches the page as a plain
  // Space keydown on the focused element whenever VO is passing keys through,
  // and the focused element is this listbox. It costs nothing: selection
  // already follows the active option, so Space has no competing "toggle
  // selection" meaning in a single-select listbox, and preventDefault stops
  // it scrolling the list out from under the user.
  //
  // Without it the
  // keyboard route dead-ends: a user can reach the list, walk it and hear the
  // right entry, and then has to leave the list and find a button to act on
  // any of that -- while the mouse route commits from where it already is.
  // That is the ARIA listbox contract too, and it is the same defect class as
  // the OK/Cancel divs that took focus and ignored Enter and Space.
  //
  // Declared after `onConfirm` and `onCancel`, not beside the other list
  // wiring above: the dependency array is evaluated when this callback is
  // created, so naming `onConfirm` before its own `const` runs is a temporal
  // dead zone ReferenceError, not merely untidy.
  const onListKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const last = filteredFunctionList.length - 1;
      if (last < 0) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onConfirm();
        return;
      }
      let next: number | null = null;
      if (e.key === "ArrowDown") next = Math.min(selectedFuncIndex + 1, last);
      else if (e.key === "ArrowUp") next = Math.max(selectedFuncIndex - 1, 0);
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = last;
      if (next == null) return;
      // Claimed whether or not the selection moves. A boundary key -- ArrowUp
      // at the first option, ArrowDown at the last, Home/End when already
      // there -- belongs to the listbox, and letting it through scrolls the
      // list's own `overflow-y: scroll` box and then the page behind the
      // dialog. Same reasoning as `useRovingFocus`, which has the measurement.
      e.preventDefault();
      if (next === selectedFuncIndex) return;
      setSelectedFuncIndex(next);
    },
    [filteredFunctionList, selectedFuncIndex, onConfirm]
  );

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
          A `listbox`, not a stack of clickable divs, and it keeps DOM focus on
          itself rather than handing it to an option.

          Every entry used to carry `tabIndex={0}`, so this list was one tab
          stop per function -- Tab could not get past it, and VoiceOver stopped
          on each entry in its linear pass. A bare `tabIndex={-1}` sweep would
          have fixed that by making the list unreachable instead, which is the
          worse defect the ticket warns about in its own last line.

          Roving tabIndex was the first remedy and satisfied the count -- one
          tab stop -- but not the requirement: it moves DOM focus onto an
          option, and these options are not interactive controls. It also put
          the arrow keys in a closed ring with no exit, reported with
          VoiceOver as "unable to move out of the functions list", and left
          VO's review cursor free to diverge from DOM focus across the list.

          `aria-activedescendant` is the pattern that satisfies both halves at
          once: focus stays on this one container, which is where Tab enters
          and leaves from, no option is ever focused, and the active option is
          named to AT by id. The same reasoning the formula *suggestion* list
          records -- except there the focus owner is the cell editor, and here
          there is no editor, so the listbox owns its own focus.
        */}
        <div
          ref={listRef}
          className="formulaList"
          role="listbox"
          tabIndex={0}
          aria-labelledby={listLabelId}
          /* Dropped entirely when the filter matches nothing: the id would
             otherwise resolve to no element, which advertises an active
             descendant that is not there. `onListKeyDown` and `onConfirm`
             already bail on an empty list, so this is the announcement half
             only. A visible "no matches" row would need a new locale key and
             is out of scope here (`TOOLBAR:D-B01`). */
          aria-activedescendant={
            filteredFunctionList.length
              ? optionId(selectedFuncIndex)
              : undefined
          }
          onKeyDown={onListKeyDown}
        >
          {filteredFunctionList.map((v, index) => (
            <div
              className={`listBox${index === selectedFuncIndex ? " on" : ""}`}
              key={v.n}
              id={optionId(index)}
              role="option"
              aria-selected={index === selectedFuncIndex}
              // Assistive technology activates an element by dispatching a
              // *click* and nothing else -- VoiceOver's VO-Space, NVDA's Enter
              // in browse mode, a touch reader's double-tap. None of them
              // produces a key event on the option, so the listbox's Enter
              // handling never sees them and, with a select-only handler, an
              // AT user could reach the right entry and then not act on it.
              // The formula *suggestion* list records the same fact.
              //
              // Telling that click apart from a mouse click is load-bearing
              // here in a way it is not in the suggestion list: this dialog
              // has an OK button, so a real click must go on meaning "select
              // this one" and must NOT insert and close.
              //
              // The discriminator is the *preceding pointer event*, not the
              // click's own `detail`. `detail === 0` is the usual shortcut and
              // it was tried first: it did not fire for VO-Space, because that
              // convention describes keyboard-synthesized clicks on buttons
              // and is not what WebKit produces for an AXPress on an option.
              // A pointer press, by contrast, is defined to emit pointerdown
              // before click, and a synthesized activation emits no pointer
              // event at all -- so the absence of one is the signal, and it
              // does not depend on any click-count convention.
              //
              // The flag is armed here and must be dropped again on any
              // release that will NOT produce a click on this option, or it
              // outlives the gesture and swallows the next AT activation --
              // which only shows up after the user has touched the list with
              // the mouse once. Two such releases exist: a press released
              // somewhere else (a drag-out, a text-selection gesture) fires
              // `click` on the nearest common ancestor, which is `.formulaList`
              // and has no handler to consume the flag; and a non-primary press
              // fires `contextmenu` and no click at all. A release over this
              // same option is the one case that does produce the click, and
              // `onClick` below consumes it there.
              //
              // Cleared from the release event rather than a timer on purpose:
              // pointerup-before-click is fixed by the spec, but the order of a
              // 0ms timer against the click task is not, and a microtask drains
              // before the click arrives.
              onPointerDown={(e) => {
                // `> 0` and not `!== 0`: a middle or right press is 1 or 2,
                // but jsdom has no `PointerEvent`, so a synthetic pointerdown
                // arrives as a bare `Event` with no `button` at all -- and
                // `!== 0` rejected that, disarming the flag in every test that
                // exercises the mouse path. Treating an absent button as the
                // primary press it stands for keeps the browser semantics and
                // the test semantics the same.
                if (e.button > 0) return;
                fromPointer.current = true;
                const option = e.currentTarget;
                releaseListeners.current?.();
                const onRelease = (ev: Event) => {
                  releaseListeners.current?.();
                  const clickWillFollow =
                    ev.type === "pointerup" &&
                    option.contains(ev.target as Node);
                  if (!clickWillFollow) fromPointer.current = false;
                };
                window.addEventListener("pointerup", onRelease);
                window.addEventListener("pointercancel", onRelease);
                releaseListeners.current = () => {
                  window.removeEventListener("pointerup", onRelease);
                  window.removeEventListener("pointercancel", onRelease);
                  releaseListeners.current = null;
                };
              }}
              onClick={() => {
                setSelectedFuncIndex(index);
                const pointer = fromPointer.current;
                fromPointer.current = false;
                // The index is passed explicitly rather than left to state:
                // the `setSelectedFuncIndex` above has not been applied yet,
                // and VoiceOver's cursor can sit on an option that is not the
                // active descendant, so the click target is the only
                // trustworthy answer to "which one".
                if (!pointer) onConfirm(index);
              }}
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
          onClick={() => onConfirm()}
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
