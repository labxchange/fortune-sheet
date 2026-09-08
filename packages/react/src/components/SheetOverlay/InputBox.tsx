import {
  cancelNormalSelected,
  getCellValue,
  getInlineStringHTML,
  getStyleByCell,
  isInlineStringCell,
  moveToEnd,
  getFlowdata,
  handleFormulaInput,
  moveHighlightCell,
  escapeScriptTag,
  valueShowEs,
  createRangeHightlight,
  isShowHidenCR,
  israngeseleciton,
  escapeHTMLTag,
  isAllowEdit,
  locale,
  acceptFormulaSuggestion,
  announceEditorInput,
  formulaTextAfterAccept,
  replaceHtml,
} from "@fortune-sheet/core";
import React, {
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useCallback,
  useLayoutEffect,
  useState,
} from "react";
import _ from "lodash";
import WorkbookContext from "../../context";
import ContentEditable from "./ContentEditable";
import FormulaSearch, {
  formulaSuggestionOptionId,
  formulaSuggestionsListboxId,
} from "./FormulaSearch";
import FormulaHint from "./FormulaHint";
import usePrevious from "../../hooks/usePrevious";
import useFocusedCellRefText from "../../hooks/useFocusedCellRefText";
import { useFocusedCellFormulaAnnouncement } from "../../hooks/useFocusedCellFormulaAnnouncement";

const InputBox: React.FC = () => {
  const { context, setContext, refs } = useContext(WorkbookContext);
  const inputRef = useRef<HTMLDivElement>(null);
  const lastKeyDownEventRef = useRef<KeyboardEvent>(null);
  const prevCellUpdate = usePrevious<any[]>(context.luckysheetCellUpdate);
  const prevSheetId = usePrevious<string>(context.currentSheetId);
  const [isHidenRC, setIsHidenRC] = useState<boolean>(false);
  const firstSelection = context.luckysheet_select_save?.[0];
  const row_index = firstSelection?.row_focus!;
  const col_index = firstSelection?.column_focus!;
  const preText = useRef("");

  const inputBoxStyle = useMemo(() => {
    if (firstSelection && context.luckysheetCellUpdate.length > 0) {
      const flowdata = getFlowdata(context);
      if (!flowdata) return {};
      return getStyleByCell(
        context,
        flowdata,
        firstSelection.row_focus!,
        firstSelection.column_focus!
      );
    }
    return {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    context.luckysheetfile,
    context.currentSheetId,
    context.luckysheetCellUpdate,
    firstSelection,
  ]);

  useLayoutEffect(() => {
    if (!context.allowEdit) {
      setContext((ctx) => {
        const flowdata = getFlowdata(ctx);
        if (!_.isNil(flowdata) && ctx.forceFormulaRef) {
          const value = getCellValue(row_index, col_index, flowdata, "f");
          createRangeHightlight(ctx, value);
        }
      });
    }
    if (firstSelection && context.luckysheetCellUpdate.length > 0) {
      if (refs.globalCache.doNotUpdateCell) {
        delete refs.globalCache.doNotUpdateCell;
        return;
      }
      if (
        _.isEqual(prevCellUpdate, context.luckysheetCellUpdate) &&
        prevSheetId === context.currentSheetId
      ) {
        // data change by a collabrative update should not trigger this effect
        return;
      }
      const flowdata = getFlowdata(context);
      const cell = flowdata?.[row_index]?.[col_index];
      let value = "";
      if (cell && !refs.globalCache.overwriteCell) {
        if (isInlineStringCell(cell)) {
          value = getInlineStringHTML(row_index, col_index, flowdata);
        } else if (cell.f) {
          value = getCellValue(row_index, col_index, flowdata, "f");
          setContext((ctx) => {
            createRangeHightlight(ctx, value);
          });
        } else {
          value = valueShowEs(row_index, col_index, flowdata);
          if (Number(cell.qp) === 1) {
            value = value ? `${value}` : value;
          }
        }
      }
      refs.globalCache.overwriteCell = false;
      if (!refs.globalCache.ignoreWriteCell)
        inputRef.current!.innerHTML = escapeHTMLTag(escapeScriptTag(value));
      refs.globalCache.ignoreWriteCell = false;
      if (!refs.globalCache.doNotFocus) {
        setTimeout(() => {
          // Guarded: this fires a tick later, by which time the editor may be
          // gone. `moveToEnd` dereferences it immediately, so an unmount inside
          // that window threw `Cannot read properties of null`. Pre-existing,
          // and only ever reachable on a fast unmount -- which is why it
          // surfaced first from a test that awaited between the two.
          if (inputRef.current) moveToEnd(inputRef.current);
        });
      }
      delete refs.globalCache.doNotFocus;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    context.luckysheetCellUpdate,
    context.luckysheetfile,
    context.currentSheetId,
    firstSelection,
  ]);

  useEffect(() => {
    if (_.isEmpty(context.luckysheetCellUpdate)) {
      if (inputRef.current) {
        inputRef.current.innerHTML = "";
      }
    }
  }, [context.luckysheetCellUpdate]);

  // 当选中行列是处于隐藏状态的话则不允许编辑
  useEffect(() => {
    setIsHidenRC(isShowHidenCR(context));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.luckysheet_select_save]);

  // Move the highlight, wrapping at both ends. Wrapping is preserved from the
  // DOM-walking version this replaces, which fell back to the last child when
  // there was no previous sibling and to the first when there was no next.
  const moveSuggestion = useCallback(
    (delta: number) => {
      setContext((draftCtx) => {
        const count = draftCtx.functionCandidates.length;
        if (count === 0) return;
        draftCtx.functionCandidatesIndex =
          (draftCtx.functionCandidatesIndex + delta + count) % count;
      });
    },
    [setContext]
  );

  // Calls preventDefault/stopPropagation itself, and only when there really is
  // a suggestion to accept -- the only case this does anything. The decision
  // and the consumption have to stay in that order, and in this one place: a
  // caller that instead consumed the key on its own reading of "is a list
  // showing" would drift from this and swallow the key with no effect, which
  // is the dead-Tab-in-edit-mode bug this hunk exists to fix. So the name is
  // resolved *before* anything is consumed, and a list that is open but whose
  // highlighted entry has no name leaves the key to the grid.
  //
  // Resolved from `context`, not from the `setContext` draft, for exactly that
  // reason -- the answer has to be known out here, where the decision to
  // consume is made, rather than inside a producer that has already run.
  //
  // The insertion is `acceptFormulaSuggestion`, shared with the pointer route
  // in FormulaSearch, rather than the Range surgery that used to live here.
  // That version read the text to replace from `getrangeseleciton()`, which
  // returns a *node*, and inserted DOMParser-built spans at a hardcoded child
  // offset that addressed the span `deleteContents()` had just emptied. It
  // produced correct text -- so it was never the cause of a step failing to
  // complete, which was candidate ordering in `searchFunction` -- but it left
  // the markup nested, stranded an empty text node, and never updated the
  // formula bar.
  const selectActiveFormula = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const name =
        context.functionCandidates[context.functionCandidatesIndex]?.n;
      const editor = inputRef.current;
      if (!name || editor == null) return;

      // Read the editor and resolve the new text out here, once. Inside the
      // recipe it would be re-derived on every invocation React makes of it,
      // and the second pass would append a second bracket.
      const nextText = formulaTextAfterAccept(editor.innerText, name);
      setContext((draftCtx) => {
        acceptFormulaSuggestion(
          draftCtx,
          refs.fxInput.current,
          editor,
          name,
          nextText
        );
      });
      // After the edit, so a host reading the editor from the event sees the
      // accepted text rather than the fragment it replaced.
      //
      // Cleared here rather than by the handler that reads it: `dispatchEvent`
      // is synchronous, so `onChange` has already run by the time this line
      // does. Clearing at the dispatch site makes the flag's lifetime exactly
      // the dispatch, whether or not anything consumed it -- rather than
      // resting on `ContentEditable` always calling `onChange`, which it skips
      // when the markup is unchanged. An accept cannot currently produce
      // unchanged markup (the appended bracket guarantees a difference), so
      // this is belt-and-braces; the cost of being wrong is a swallowed
      // keystroke, which is worth not having to re-derive.
      refs.globalCache.ignoreNextInput = true;
      announceEditorInput(editor);
      delete refs.globalCache.ignoreNextInput;
      e.preventDefault();
      e.stopPropagation();
    },
    [
      context.functionCandidates,
      context.functionCandidatesIndex,
      refs.fxInput,
      refs.globalCache,
      setContext,
    ]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      lastKeyDownEventRef.current = new KeyboardEvent(e.type, e.nativeEvent);
      preText.current = inputRef.current!.innerText;
      // if (
      //   $("#luckysheet-modal-dialog-mask").is(":visible") ||
      //   $(event.target).hasClass("luckysheet-mousedown-cancel") ||
      //   $(event.target).hasClass("formulaInputFocus")
      // ) {
      //   return;
      // }

      if (e.key === "Escape" && context.luckysheetCellUpdate.length > 0) {
        setContext((draftCtx) => {
          cancelNormalSelected(draftCtx);
          moveHighlightCell(draftCtx, "down", 0, "rangeOfSelect", true);
        });
        e.preventDefault();
      } else if (e.key === "Enter" && context.luckysheetCellUpdate.length > 0) {
        if (e.altKey || e.metaKey) {
          // originally `enterKeyControll`
          document.execCommand("insertHTML", false, "\n "); // 换行符后面的空白符是为了强制让他换行，在下一步的delete中会删掉
          document.execCommand("delete", false);
          e.stopPropagation();
        } else selectActiveFormula(e);
      } else if (e.key === "Tab" && context.luckysheetCellUpdate.length > 0) {
        // Tab has two jobs while a cell is being edited, and only one of them
        // belongs to this layer: accepting the highlighted formula suggestion,
        // when a suggestion is actually open. Otherwise the key belongs to the
        // grid, which commits the edit and moves to the next cell.
        //
        // This used to run unconditionally, and that is what made Tab dead in
        // edit mode: with no suggestion open `selectActiveFormula` does
        // nothing, and the `preventDefault()` beside it stopped the browser
        // moving focus while core's Tab branch bailed on the edit -- so the key
        // did nothing at all. Calling `selectActiveFormula` and leaving the
        // decision to it -- rather than re-deriving "is there a real
        // suggestion open" here too -- is what keeps this branch from being
        // able to drift from it: `selectActiveFormula` itself decides whether
        // Tab was actually consumed, and its own preventDefault/stopPropagation
        // only fire when it was.
        selectActiveFormula(e);
      } else if (e.key === "F4" && context.luckysheetCellUpdate.length > 0) {
        // formula.setfreezonFuc(event);
        e.preventDefault();
      } else if (
        e.key === "ArrowUp" &&
        context.luckysheetCellUpdate.length > 0
      ) {
        moveSuggestion(-1);
        e.preventDefault();
      } else if (
        e.key === "ArrowDown" &&
        context.luckysheetCellUpdate.length > 0
      ) {
        moveSuggestion(1);
        e.preventDefault();
      }
      // else if (
      //   e.key === "ArrowLeft" &&
      //   draftCtx.luckysheetCellUpdate.length > 0
      // ) {
      //   formulaMoveEvent("left", ctrlKey, shiftKey, event);
      // } else if (
      //   e.key === "ArrowRight" &&
      //   draftCtx.luckysheetCellUpdate.length > 0
      // ) {
      //   formulaMoveEvent("right", ctrlKey, shiftKey, event);
      // }
    },
    [
      context.luckysheetCellUpdate.length,
      moveSuggestion,
      selectActiveFormula,
      setContext,
    ]
  );

  const onChange = useCallback(
    (__: any, isBlur?: boolean) => {
      // The `input` event an accept dispatches for the host's benefit is not a
      // keystroke, and must not be processed as one: `handleFormulaInput` would
      // run against `preText.current` from whatever keydown came last, and its
      // caret restore cannot survive a whole identifier changing at once. The
      // accept has already produced the final markup, the formula bar mirror
      // and the range highlighting itself.
      //
      // Enter and Tab are filtered by the key gate below in any case (both are
      // `kcode <= 46`); this is what covers the pointer accept, which carries
      // the last typed character's code and would otherwise pass it.
      if (refs.globalCache.ignoreNextInput) return;
      // setInputHTML(html);
      const e = lastKeyDownEventRef.current;
      if (!e) return;
      const kcode = e.keyCode;
      if (!kcode) return;

      if (
        !(
          (
            (kcode >= 112 && kcode <= 123) ||
            kcode <= 46 ||
            kcode === 144 ||
            kcode === 108 ||
            e.ctrlKey ||
            e.altKey ||
            (e.shiftKey &&
              (kcode === 37 || kcode === 38 || kcode === 39 || kcode === 40))
          )
          // kcode === keycode.WIN ||
          // kcode === keycode.WIN_R ||
          // kcode === keycode.MENU))
        ) ||
        kcode === 8 ||
        kcode === 32 ||
        kcode === 46 ||
        (e.ctrlKey && kcode === 86)
      ) {
        setContext((draftCtx) => {
          if (
            (draftCtx.formulaCache.rangestart ||
              draftCtx.formulaCache.rangedrag_column_start ||
              draftCtx.formulaCache.rangedrag_row_start ||
              israngeseleciton(draftCtx)) &&
            isBlur
          )
            return;
          if (!isAllowEdit(draftCtx, draftCtx.luckysheet_select_save)) {
            return;
          }
          // if(event.target.id!="luckysheet-input-box" && event.target.id!="luckysheet-rich-text-editor"){
          handleFormulaInput(
            draftCtx,
            refs.fxInput.current,
            refs.cellInput.current!,
            kcode,
            preText.current
          );
          // clearSearchItemActiveClass();
          // formula.functionInputHanddler(
          //   $("#luckysheet-functionbox-cell"),
          //   $("#luckysheet-rich-text-editor"),
          //   kcode
          // );
          // setCenterInputPosition(
          //   draftCtx.luckysheetCellUpdate[0],
          //   draftCtx.luckysheetCellUpdate[1],
          //   draftCtx.flowdata
          // );
          // }
        });
      }
    },
    [refs.cellInput, refs.fxInput, setContext]
  );

  const onPaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      if (_.isEmpty(context.luckysheetCellUpdate)) {
        e.preventDefault();
      }
    },
    [context.luckysheetCellUpdate]
  );

  const cellRef = useFocusedCellRefText(context);
  const editing = context.luckysheetCellUpdate.length > 0;
  const { info } = locale(context);
  const formulaAnnouncement = useFocusedCellFormulaAnnouncement(context, info);

  /**
   * The suggestion list's screen-reader story.
   *
   * `idBase` is a `useId()` value rather than the fixed `luckysheet-*` id the
   * list used to carry, because the simulations mount one `Workbook` per
   * notebook section: a fixed id puts duplicates in the document and lets
   * `aria-activedescendant` resolve into another sheet's list.
   *
   * The announcement fires once, on the list *appearing* -- not on every
   * keystroke that narrows it. Narrowing needs no message: once the list is
   * open, moving between entries is spoken by the screen reader following
   * `aria-activedescendant`, and re-announcing the count would talk over the
   * learner as they type. `polite` for the same reason.
   *
   * It does not race `#sr-selection`. That region is an assertive alert tied
   * to the selection changing, and the selection does not move during formula
   * entry, so it is silent for exactly as long as this one has something to
   * say.
   */
  const idBase = useId();
  const candidateCount = context.functionCandidates.length;
  const announcedCountRef = useRef(0);
  const [suggestionAnnouncement, setSuggestionAnnouncement] = useState("");

  useEffect(() => {
    if (candidateCount === 0) {
      announcedCountRef.current = 0;
      setSuggestionAnnouncement("");
      return;
    }
    // Only when the list was closed a moment ago -- the ref, not the count,
    // is the "have I already spoken for this list" record, so a list that
    // narrows from five entries to two stays quiet.
    if (announcedCountRef.current === 0) {
      announcedCountRef.current = candidateCount;
      setSuggestionAnnouncement(
        replaceHtml(info.formulaSuggestionsAvailable, {
          count: candidateCount,
        })
      );
    }
  }, [candidateCount, info.formulaSuggestionsAvailable]);

  /**
   * The current option, or nothing.
   *
   * Removed rather than left pointing at a stale id when the list closes: an
   * `aria-activedescendant` naming an element that no longer exists is worse
   * than none at all -- some screen readers go quiet on the owning field
   * entirely.
   */
  const activeSuggestionId =
    candidateCount > 0
      ? formulaSuggestionOptionId(idBase, context.functionCandidatesIndex)
      : undefined;

  /**
   * The cell input's accessible name, and the reason it needs one.
   *
   * The sheet is painted on a canvas, so this input is the only element that
   * stands for a cell in the DOM: `InputBox` positions it over the focused cell,
   * and `handleGlobalKeyDown` parks focus on it after every keystroke. Unnamed,
   * it announced as a bare "edit text" — so a keyboard user who committed an
   * edit, or came back to the sheet, was told nothing about where they were
   * (WCAG 2.4.3, 4.1.2). Naming it for the cell is what makes focus resting here
   * correct rather than something to be moved away from.
   *
   * **The name carries the reference, not the value.** It used to carry both,
   * and so does `#sr-selection` — which meant that on the ordinary arrow-key
   * move the two composed the identical sentence in the same commit, one as an
   * assertive alert and one as the accessible name of the element holding
   * focus. NVDA and JAWS re-announce a name change on the focused element, so
   * the common case spoke the whole cell description twice. `useFilterAnnouncements`
   * already draws this line for the same reason; this is the same split.
   *
   * The division is by what each channel is for. `#sr-selection` is an alert
   * tied to the selection *changing*, so it reads the content: that is the
   * question "what is in the cell I just moved to". The name is read when focus
   * arrives *without* the selection moving — back from the formula bar, back
   * from the toolbar, or when the user asks what is focused — where the
   * question is "where am I", and the answer is the reference. A user who wants
   * the content from here has the field's own text, which a screen reader reads
   * after the name.
   *
   * Dropping the value also settles which selection the name describes. The
   * value was read from `luckysheet_select_save[0]` while `cellRef` and the
   * formula marker come from `_.last(...)`, so a multi-range selection —
   * ctrl-click A1 then C5 — named the cell that would actually be edited and
   * paired it with a *different* cell's value. There is no longer a second
   * selection to disagree with.
   *
   * The formula marker stays, because it is a property of the named cell rather
   * than its content, and every route that arrives without the selection moving
   * would otherwise present a computed value as though it had been typed. It is
   * absent while editing, as the reference alone is: the field then holds the
   * formula source itself, leading `=` and all, and reading a name over the top
   * of it says the content twice before the user has finished typing it.
   *
   * **The marker is deliberately in both channels, and that was tested.** On an
   * arrow-key move `#sr-selection` and this name both end in "Has formula.", so
   * on paper it is the same doubling the value split above was made to remove.
   * It is not: a name change on an already-focused element is not re-announced
   * the way a live region is, and Ayesha's VoiceOver pass (2026-09-03) confirmed
   * the marker is spoken once. Verified by ear, so it is recorded here — do not
   * "fix" the apparent duplication from reading alone. If a future AT does
   * double it, drop the marker from the name and keep `#sr-selection`'s.
   */
  const cellInputLabel = useMemo(() => {
    if (!cellRef) return "";
    return editing ? cellRef : `${cellRef}${formulaAnnouncement}`;
  }, [cellRef, editing, formulaAnnouncement]);

  const cfg = context.config || {};
  const rowReadOnly: Record<number, number> = cfg.rowReadOnly || {};
  const colReadOnly: Record<number, number> = cfg.colReadOnly || {};

  const edit = !(
    (colReadOnly[col_index] || rowReadOnly[row_index]) &&
    context.allowEdit === true
  );

  /**
   * Whether this cell can actually be typed into — which `edit` above does not
   * answer, despite being the thing that sets `contenteditable`.
   *
   * `edit`'s `&& context.allowEdit === true` conjunction means a workbook
   * rendered `allowEdit={false}` with no per-row/column config evaluates
   * `(undefined || undefined) && false` → falsy → `edit === true`. It also
   * never consults cell locking. So the read-only case with the clearest
   * failure mode was the one it got wrong: `core/events/keyboard.ts` returns
   * early on `!isAllowEdit(ctx)` for every text-entry key, and this element was
   * meanwhile a focusable textbox reporting `aria-readonly={false}` — a field
   * that swallows everything typed into it while announcing that it accepts it
   * (WCAG 4.1.2), which is the exact mismatch the state was added to prevent.
   *
   * `isAllowEdit` is the predicate the commit path itself uses, and it folds in
   * all four questions: row read-only, column read-only, `checkCellIsLocked`,
   * and `ctx.allowEdit`. Scoped to the focus cell rather than the selection on
   * both counts — this editor only ever edits that one cell, and `isAllowEdit`
   * walks every cell of the range it is handed with a sheet lookup each, which
   * on a select-all would be a million of them per render.
   *
   * `contentEditable` is deliberately left on `edit`. Changing what the DOM
   * lets the user type is a behaviour change beyond this ticket, and the honest
   * fix for the mismatch is the state that tells the truth about it rather than
   * a promise quietly withdrawn; the residue is a read-only workbook whose
   * editor is still `contenteditable`, which is pre-existing and now at least
   * announced correctly.
   */
  const canEditCell = useMemo(
    () =>
      !isHidenRC &&
      !!firstSelection &&
      isAllowEdit(context, [
        { row: [row_index, row_index], column: [col_index, col_index] },
      ]),
    [context, isHidenRC, firstSelection, row_index, col_index]
  );

  return (
    <div
      className="luckysheet-input-box"
      style={
        firstSelection && !context.rangeDialog?.show
          ? {
              left: firstSelection.left,
              top: firstSelection.top,
              zIndex: _.isEmpty(context.luckysheetCellUpdate) ? -1 : 19,
              display: "block",
            }
          : { left: -10000, top: -10000, display: "block" }
      }
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
    >
      <div
        className="luckysheet-input-box-inner"
        style={
          firstSelection
            ? {
                minWidth: firstSelection?.width || 0,
                minHeight: firstSelection?.height || 0,
                ...inputBoxStyle,
              }
            : {}
        }
      >
        <ContentEditable
          innerRef={(e) => {
            // @ts-ignore
            inputRef.current = e;
            refs.cellInput.current = e;
          }}
          className="luckysheet-cell-input"
          id="luckysheet-rich-text-editor"
          // `contenteditable` alone leaves this a plain div as far as ARIA is
          // concerned, and aria-label is prohibited on a role-less div — the
          // name above would be dropped by the accessibility tree rather than
          // announced (axe: aria-prohibited-attr). The role it already behaves
          // as is the one to declare: a free-text field.
          //
          // Multi-line, because it is: Alt+Enter and Meta+Enter insert a
          // newline in the cell (`onKeyDown`, above). Without saying so, a
          // screen reader presents this as single-line and Enter reads as
          // "commit" with no hint that a line break is available at all.
          role="textbox"
          aria-multiline="true"
          // Declaring the role makes a promise the role-less div never made,
          // so the state has to travel with it: a cell that cannot be typed
          // into is announced as a read-only field rather than as one that
          // accepts input and drops it (WCAG 4.1.2). This was written as the
          // exact negation of the `allowEdit` expression below, which turned
          // out to be the wrong question — see `canEditCell` above. The role
          // and the name stay unconditional, because a read-only textbox is
          // still a textbox and still has to say which cell it is: dropping
          // them would leave focus resting on an unnamed generic div, which is
          // the defect this element was named to fix.
          aria-readonly={!canEditCell}
          aria-label={cellInputLabel}
          // The suggestion list's other half. Only these two attributes are
          // added, and only while a list is open — the role, name and
          // read-only state above are deliberately untouched, so nothing about
          // an ordinary cell move sounds any different.
          //
          // Notably *not* `aria-expanded`: `role="textbox"` does not support
          // it, so declaring it would trade one axe violation
          // (aria-prohibited-attr, the reason the role exists at all) for
          // another (aria-allowed-attr). Making this a `combobox` instead
          // would permit it, at the price of re-roling the one element that
          // stands for every cell in the grid. That the list has appeared is
          // carried by `#sr-formulaSuggestions` below, which is what WCAG
          // 4.1.3 asks for anyway.
          aria-activedescendant={activeSuggestionId}
          aria-controls={
            candidateCount > 0 ? formulaSuggestionsListboxId(idBase) : undefined
          }
          style={{
            transform: `scale(${context.zoomRatio})`,
            transformOrigin: "left top",
            width: `${100 / context.zoomRatio}%`,
            height: `${100 / context.zoomRatio}%`,
          }}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          allowEdit={edit ? !isHidenRC : edit}
        />
      </div>
      {/*
        Outside the `activeElement` gate below, because a live region has to be
        in the document *before* its text changes for the change to be
        announced. Mounted alongside the list it describes rather than with the
        other regions in SheetOverlay, so the two cannot get out of step.
      */}
      <div id="sr-formulaSuggestions" className="sr-only" role="status">
        {suggestionAnnouncement}
      </div>
      {document.activeElement === inputRef.current && (
        <>
          <FormulaSearch
            idBase={idBase}
            editorRef={refs.cellInput}
            mirrorRef={refs.fxInput}
            style={{
              top: (firstSelection?.height_move || 0) + 4,
            }}
          />
          <FormulaHint
            style={{
              top: (firstSelection?.height_move || 0) + 4,
            }}
          />
        </>
      )}
    </div>
  );
};

export default InputBox;
