import {
  locale,
  getFlowdata,
  cancelNormalSelected,
  getCellValue,
  updateCell,
  getInlineStringNoStyle,
  isInlineStringCell,
  escapeScriptTag,
  moveHighlightCell,
  resolvePointModeStep,
  applyPointModeStep,
  handleFormulaInput,
  rangeHightlightselected,
  valueShowEs,
  isShowHidenCR,
  escapeHTMLTag,
  isAllowEdit,
  moveToEnd,
} from "@fortune-sheet/core";
import React, {
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from "react";
import "./index.css";
import _ from "lodash";
import WorkbookContext from "../../context";
import SVGIcon from "../SVGIcon";
import ContentEditable from "../SheetOverlay/ContentEditable";
import FormulaSearch from "../SheetOverlay/FormulaSearch";
import FormulaHint from "../SheetOverlay/FormulaHint";
import NameBox from "./NameBox";
import usePrevious from "../../hooks/usePrevious";
import { returnFocusToCell } from "../../utils/keyboardActivation";

/**
 * Whether a keystroke is one that starts typing into a cell, as opposed to
 * navigating or invoking a command. Mirrors the keyCode test the grid's own
 * type-to-edit path uses, kept deliberately conservative: anything this rejects
 * simply does not start an edit, and the user's next real character will.
 */
function isTextProducingKey(e: React.KeyboardEvent<HTMLDivElement>): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  // Printable characters arrive as a single-character `key`; Backspace and
  // Delete count too, since clearing a cell from the formula bar is an edit.
  return e.key.length === 1 || e.key === "Backspace" || e.key === "Delete";
}

const FxEditor: React.FC = () => {
  const { context, setContext, refs } = useContext(WorkbookContext);
  const [focused, setFocused] = useState(false);
  const lastKeyDownEventRef = useRef<KeyboardEvent>(null);
  // Set by a pointer press on the formula bar and consumed by the very next
  // focus, so that onFocus can tell "the user clicked in here to edit" from
  // "focus passed through on its way to the grid".
  const startEditOnFocus = useRef(false);
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const [isHidenRC, setIsHidenRC] = useState<boolean>(false);
  const firstSelection = context.luckysheet_select_save?.[0];
  const prevFirstSelection = usePrevious(firstSelection);
  const prevSheetId = usePrevious(context.currentSheetId);
  const recentText = useRef("");
  /**
   * Whether the focus about to arrive is a pointer's rather than the keyboard's.
   *
   * A click carries its own caret position — the character the user aimed at —
   * which the browser applies as the default action of the mousedown, *after*
   * the focus event has been dispatched. Without this flag, placing the caret
   * on every focus would discard the click target and make the formula bar
   * impossible to click into mid-word.
   */
  const focusFromPointer = useRef(false);
  const { info } = locale(context);

  useEffect(() => {
    // 当选中行列是处于隐藏状态的话则不允许编辑
    setIsHidenRC(isShowHidenCR(context));
    if (
      _.isEqual(prevFirstSelection, firstSelection) &&
      context.currentSheetId === prevSheetId
    ) {
      // data change by a collabrative update should not trigger this effect
      return;
    }
    const d = getFlowdata(context);
    let value = "";
    if (firstSelection) {
      const r = firstSelection.row_focus;
      const c = firstSelection.column_focus;
      if (_.isNil(r) || _.isNil(c)) return;

      const cell = d?.[r]?.[c];
      if (cell) {
        if (isInlineStringCell(cell)) {
          value = getInlineStringNoStyle(r, c, d);
        } else if (cell.f) {
          value = getCellValue(r, c, d, "f");
        } else {
          value = valueShowEs(r, c, d);
        }
      }
      refs.fxInput.current!.innerHTML = escapeHTMLTag(escapeScriptTag(value));
    } else {
      refs.fxInput.current!.innerHTML = "";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    context.luckysheetfile,
    context.currentSheetId,
    context.luckysheet_select_save,
  ]);

  const canStartEdit = useCallback(
    () =>
      context.allowEdit !== false &&
      (context.luckysheet_select_save?.length ?? 0) > 0 &&
      !context.luckysheet_cell_selected_move &&
      isAllowEdit(context, context.luckysheet_select_save),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      context.config,
      context.allowEdit,
      context.luckysheet_select_save,
      context.luckysheet_cell_selected_move,
      context.luckysheetfile,
      context.currentSheetId,
    ]
  );

  // Put the selected cell into edit mode, the way clicking the formula bar
  // always has. Split out of onFocus so that focus arriving here and the user
  // *meaning* to edit are no longer the same event -- see startEditOnFocus.
  const beginCellEdit = useCallback(() => {
    setFocused(true);
    setContext((draftCtx) => {
      const last =
        draftCtx.luckysheet_select_save![
          draftCtx.luckysheet_select_save!.length - 1
        ];

      const row_index = last.row_focus;
      const col_index = last.column_focus;

      draftCtx.luckysheetCellUpdate = [row_index, col_index];
      refs.globalCache.doNotFocus = true;
      // formula.rangeResizeTo = $("#luckysheet-functionbox-cell");
    });
  }, [refs.globalCache, setContext]);

  const onFocus = useCallback(() => {
    const fromPointer = focusFromPointer.current;
    focusFromPointer.current = false;
    if (context.allowEdit === false) {
      return;
    }
    if (canStartEdit()) {
      // Only a pointer press means "I want to edit this cell". Focus that
      // arrives any other way is a keyboard user tabbing *past* the formula bar
      // on their way into the grid, and starting an edit for them opened a
      // session that never closed -- the grid was then in edit mode from the
      // very next tab stop onwards, with a caret on whatever they reached.
      // The edit still starts for them, on their first keystroke, in onKeyDown.
      if (startEditOnFocus.current) {
        startEditOnFocus.current = false;
        beginCellEdit();
      } else {
        setFocused(true);
      }

      /**
       * Put the caret after the existing value, so an edit continues from the
       * end instead of in front of what is already there (WCAG 2.4.3).
       *
       * Nothing else does it. `moveToEnd` is called from `InputBox` alone, and
       * only when `globalCache.doNotFocus` is unset — which `beginCellEdit`
       * sets, deliberately, to stop the cell input pulling focus back out of
       * the formula bar. That left the caret wherever the browser puts it in a
       * freshly focused contenteditable, which is offset 0.
       *
       * Runs whenever focus arrives here by keyboard and editing is possible --
       * not only when `beginCellEdit` above also ran. A keyboard user tabbing
       * in while a cell is already being edited (started elsewhere, e.g. F2 in
       * the grid) takes the `setFocused(true)` branch above, not
       * `beginCellEdit`, since the session already exists; the caret still
       * needs positioning here, since this is the first time it lands in the
       * formula bar's own view of that same edit.
       *
       * Synchronous, unlike `InputBox`'s deferred call: the value in this field
       * was written by the selection effect above on a previous commit, so it
       * is already in the DOM and there is nothing to wait for. Deferring would
       * also open a window where a fast first keystroke lands at the old caret
       * and is then jumped over.
       */
      if (!fromPointer) {
        moveToEnd(refs.fxInput.current!);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    context.config,
    context.luckysheet_select_save,
    context.luckysheetfile,
    context.currentSheetId,
    refs.globalCache,
    setContext,
    canStartEdit,
    beginCellEdit,
  ]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (context.allowEdit === false) {
        return;
      }
      // A keyboard user who tabbed in gets their edit here instead of on focus,
      // on the first key that actually produces text. This has to run before
      // the switch below and before onChange: both do nothing while
      // luckysheetCellUpdate is empty, so a later start would eat the character.
      if (
        context.luckysheetCellUpdate.length === 0 &&
        isTextProducingKey(e) &&
        canStartEdit()
      ) {
        beginCellEdit();
      }
      lastKeyDownEventRef.current = new KeyboardEvent(e.type, e.nativeEvent);
      const { key } = e;
      recentText.current = refs.fxInput.current!.innerText;
      if (key === "ArrowLeft" || key === "ArrowRight") {
        e.stopPropagation();
      }
      // Enter commits and Escape cancels; either way the edit is over and focus
      // must leave the formula bar, or a keyboard user is left in an input that
      // no longer edits anything (WCAG 2.4.3). This is what the two commented-out
      // jQuery lines in the branches below used to do — and they aimed at the
      // cell input for the same reason this does.
      //
      // Scheduled here rather than inside the producer: `setContext` takes an
      // immer recipe, which must stay free of side effects, and the guard it
      // opens with is the one repeated on the next line.
      if (
        context.luckysheetCellUpdate.length > 0 &&
        (key === "Enter" || key === "Escape")
      ) {
        returnFocusToCell(refs.cellInput.current);
      }

      // Resolved here rather than inside the producer below, and resolved
      // exactly once, for two reasons -- neither of which is "reading the caret
      // inside a producer is unsafe". An earlier version of this comment said
      // that, and it does not survive being applied to the grid: Workbook's
      // onKeyDown calls handleGlobalKeyDown *inside* setContextWithProduce's
      // recipe, so the grid runs canEnterPointMode -> israngeseleciton ->
      // window.getSelection() from within a functional updater already. If that
      // were unsafe in itself, the mouse-era grid driver would have been broken
      // since long before point mode, and it is not.
      //
      // The first reason is preventDefault, which genuinely cannot be deferred:
      // it has to be issued while the event is still being dispatched, so the
      // decision that governs it has to be made here too. That is a fact about
      // the DOM rather than about React, so it holds whatever React does with
      // the updater. (handleGlobalKeyDown issues its own preventDefault from
      // inside the recipe and so does lean on React evaluating the updater
      // during the dispatch -- eagerly, which it does while the fiber has no
      // pending update. That is pre-existing, applies to every preventDefault
      // in that function rather than to point mode, and is not this PR's to
      // fix; the point here is that the formula bar does not add a second
      // instance of it.)
      //
      // The second is the one the tests pin: resolve once, so the cancel and
      // the apply cannot disagree. Cancelling the key on "a reference may go
      // here" alone swallowed arrows the driver went on to decline -- at the
      // edge of the sheet, Left in column A or Up in row 1, the key was
      // cancelled and nothing replaced it, so the caret sat still. Asking twice
      // is what allowed the two answers to differ; there is now one answer,
      // read here and handed to the producer as a value.
      //
      // Resolving now also primes rangeSetValueTo from the caret as it stood at
      // keydown, which the producer needs and which is safe to carry across:
      // formulaCache is a class instance with no [immerable], so immer passes
      // it through undrafted and the producer reads back the same object this
      // call primed.
      const pointModeStep =
        (key === "ArrowUp" ||
          key === "ArrowDown" ||
          key === "ArrowLeft" ||
          key === "ArrowRight") &&
        refs.cellInput.current
          ? resolvePointModeStep(context, e.nativeEvent)
          : null;
      if (pointModeStep) {
        e.preventDefault();
        e.stopPropagation();
      }

      setContext((draftCtx) => {
        if (context.luckysheetCellUpdate.length > 0) {
          switch (key) {
            case "Enter": {
              // if (
              //   $("#luckysheet-formula-search-c").is(":visible") &&
              //   formula.searchFunctionCell != null
              // ) {
              //   formula.searchFunctionEnter(
              //     $("#luckysheet-formula-search-c").find(
              //       ".luckysheet-formula-search-item-active"
              //     )
              //   );
              // } else {
              const lastCellUpdate = _.clone(draftCtx.luckysheetCellUpdate);
              updateCell(
                draftCtx,
                draftCtx.luckysheetCellUpdate[0],
                draftCtx.luckysheetCellUpdate[1],
                refs.fxInput.current!
              );
              draftCtx.luckysheet_select_save = [
                {
                  row: [lastCellUpdate[0], lastCellUpdate[0]],
                  column: [lastCellUpdate[1], lastCellUpdate[1]],
                  row_focus: lastCellUpdate[0],
                  column_focus: lastCellUpdate[1],
                },
              ];
              moveHighlightCell(draftCtx, "down", 1, "rangeOfSelect");
              // }
              e.preventDefault();
              e.stopPropagation();
              break;
            }
            case "Escape": {
              cancelNormalSelected(draftCtx);
              moveHighlightCell(draftCtx, "down", 0, "rangeOfSelect");
              e.preventDefault();
              e.stopPropagation();
              break;
            }
            /*
              case "F4": {
                formula.setfreezonFuc(event);
                e.preventDefault();
                e.stopPropagation();
                break;
              }
              case "ArrowUp": {
                if ($("#luckysheet-formula-search-c").is(":visible")) {
                  let $up = $("#luckysheet-formula-search-c")
                    .find(".luckysheet-formula-search-item-active")
                    .prev();
                  if ($up.length === 0) {
                    $up = $("#luckysheet-formula-search-c")
                      .find(".luckysheet-formula-search-item")
                      .last();
                  }
                  $("#luckysheet-formula-search-c")
                    .find(".luckysheet-formula-search-item")
                    .removeClass("luckysheet-formula-search-item-active");
                  $up.addClass("luckysheet-formula-search-item-active");
                }
                e.preventDefault();
                e.stopPropagation();
                break;
              }
              case "ArrowDown": {
                if ($("#luckysheet-formula-search-c").is(":visible")) {
                  let $up = $("#luckysheet-formula-search-c")
                    .find(".luckysheet-formula-search-item-active")
                    .next();
                  if ($up.length === 0) {
                    $up = $("#luckysheet-formula-search-c")
                      .find(".luckysheet-formula-search-item")
                      .first();
                  }
                  $("#luckysheet-formula-search-c")
                    .find(".luckysheet-formula-search-item")
                    .removeClass("luckysheet-formula-search-item-active");
                  $up.addClass("luckysheet-formula-search-item-active");
                }
                e.preventDefault();
                e.stopPropagation();
                break;
              }
              */
            case "ArrowUp":
            case "ArrowDown":
            case "ArrowLeft":
            case "ArrowRight": {
              // Point mode -- picking a cell reference with the arrows instead
              // of typing it. The grid's own key handler never sees these: it
              // hands every key straight back to a text-entry target sitting
              // outside the grid, and Left/Right are stopPropagation()ed above
              // in any case. So the formula bar drives point mode itself,
              // applying the step resolved above rather than resolving one
              // here -- and through the same canEnterPointMode modifier filter
              // the grid applies upstream, which this switch on `key` alone
              // would not.
              if (pointModeStep) {
                applyPointModeStep(
                  draftCtx,
                  refs.cellInput.current!,
                  refs.fxInput.current,
                  pointModeStep
                );
                break;
              }
              // Declined: the arrows keep moving the caret, and Left/Right go
              // on refreshing the highlight the way they always have.
              if (key === "ArrowLeft" || key === "ArrowRight") {
                rangeHightlightselected(draftCtx, refs.fxInput.current!);
              }
              break;
            }
            default:
              break;
          }
        }
      });
    },
    [
      context,
      // Both are recreated when the selection changes. Without them here the
      // handler keeps a canStartEdit from the first render, which answers for a
      // workbook that had no selection yet and so always says no.
      canStartEdit,
      beginCellEdit,
      refs.cellInput,
      refs.fxInput,
      setContext,
    ]
  );

  const onChange = useCallback(() => {
    // Paste, IME composition and drag-drop text all reach here without ever
    // passing isTextProducingKey's keydown check in onKeyDown (paste and drop
    // carry no text-producing keydown at all; composition's own keydown key is
    // "Process", not a character). The content change itself is the one signal
    // every entry method shares, so it is the last point to open an edit
    // session before this is mirrored into the cell -- without it, the pasted
    // or composed text sits in the DOM with no luckysheetCellUpdate behind it,
    // and a later Enter or blur has nothing to commit.
    if (context.luckysheetCellUpdate.length === 0 && canStartEdit()) {
      // A context-menu paste or a drop as the very first interaction carries
      // no keydown at all, so lastKeyDownEventRef.current is still whatever
      // (possibly nothing) preceded this session -- the kcode-gated mirror
      // below cannot be relied on to run for it. Mirror directly instead,
      // rather than leaving the grid's own cell-input overlay showing stale
      // content until some later keystroke happens to trigger the gated path.
      //
      // doNotUpdateCell suppresses InputBox's own cell-value sync effect for
      // this transition -- the same one-shot mechanism FormulaSearch uses
      // when it writes into cellInput directly. Without it, that effect
      // resyncs cellInput from the *stored* (still-empty) cell value the
      // moment luckysheetCellUpdate goes from empty to set, clobbering the
      // mirror written below on the very same render pass.
      refs.globalCache.doNotUpdateCell = true;
      beginCellEdit();
      // recentText is intentionally omitted (not read from a possibly-stale
      // prior keydown) so handleFormulaInput diffs the editor's own current
      // text against itself.
      setContext((draftCtx) => {
        handleFormulaInput(
          draftCtx,
          refs.cellInput.current!,
          refs.fxInput.current!,
          0
        );
      });
      // Without this, a Ctrl+V whose keydown did land (lastKeyDownEventRef.current
      // is set) would fall through to the kcode-gated call below and run
      // handleFormulaInput a second time for the same change, now with
      // recentText.current -- captured at keydown, i.e. pre-paste -- as
      // preText. For a pasted formula the two passes take different branches
      // (this one sees value1txt === value; the second sees the stale
      // pre-paste text as value1txt), which can leave a stale mirror in the
      // cell-input overlay. The commit itself reads from the editor directly,
      // so this was never data loss, but the second pass has nothing correct
      // left to do once this one has already mirrored the real content.
      return;
    }
    const e = lastKeyDownEventRef.current;
    if (!e) return;
    const kcode = e.keyCode;
    if (!kcode) return;

    if (
      !(
        (kcode >= 112 && kcode <= 123) ||
        kcode <= 46 ||
        kcode === 144 ||
        kcode === 108 ||
        e.ctrlKey ||
        e.altKey ||
        (e.shiftKey &&
          (kcode === 37 || kcode === 38 || kcode === 39 || kcode === 40))
      ) ||
      kcode === 8 ||
      kcode === 32 ||
      kcode === 46 ||
      (e.ctrlKey && kcode === 86)
    ) {
      setContext((draftCtx) => {
        handleFormulaInput(
          draftCtx,
          refs.cellInput.current!,
          refs.fxInput.current!,
          kcode,
          recentText.current
        );
      });
    }
  }, [
    context.luckysheetCellUpdate.length,
    canStartEdit,
    beginCellEdit,
    refs.cellInput,
    refs.fxInput,
    refs.globalCache,
    setContext,
  ]);

  const allowEdit = useMemo(() => {
    if (context.allowEdit === false) {
      return false;
    }
    if (isHidenRC) {
      return false;
    }
    if (!isAllowEdit(context, context.luckysheet_select_save)) {
      return false;
    }
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    context.config,
    context.luckysheet_select_save,
    context.luckysheetfile,
    context.currentSheetId,
    isHidenRC,
  ]);

  return (
    <aside>
      <div className="fortune-fx-editor">
        <NameBox />
        <div className="fortune-fx-icon">
          <SVGIcon name="fx" width={18} height={18} />
        </div>
        <div ref={inputContainerRef} className="fortune-fx-input-container">
          <ContentEditable
            innerRef={(e) => {
              refs.fxInput.current = e;
            }}
            className="fortune-fx-input"
            role="textbox"
            id="luckysheet-functionbox-cell"
            aria-label={info.currentCellInput}
            onPointerDown={() => {
              startEditOnFocus.current = true;
            }}
            onFocus={onFocus}
            onBlurCapture={() => {
              // Never let a stale flag survive to a later, unrelated focus.
              startEditOnFocus.current = false;
            }}
            onMouseDown={() => {
              focusFromPointer.current = true;
            }}
            onKeyDown={onKeyDown}
            onChange={onChange}
            onBlur={() => {
              // Discarded rather than left set: a mousedown on an
              // already-focused field fires no focus event to consume the flag,
              // and a stale one would make the next Tab into the field behave
              // like a click. Any later focus has to pass through here first.
              focusFromPointer.current = false;
              setFocused(false);
            }}
            tabIndex={0}
            allowEdit={allowEdit}
          />
          {focused && (
            <>
              <FormulaSearch
                style={{
                  top: inputContainerRef.current!.clientHeight,
                }}
              />
              <FormulaHint
                style={{
                  top: inputContainerRef.current!.clientHeight,
                }}
              />
            </>
          )}
        </div>
      </div>
    </aside>
  );
};

export default FxEditor;
