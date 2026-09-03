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
  handleFormulaInput,
  rangeHightlightselected,
  valueShowEs,
  isShowHidenCR,
  escapeHTMLTag,
  isAllowEdit,
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
              // $("#luckysheet-rich-text-editor").focus();
              // }
              e.preventDefault();
              e.stopPropagation();
              break;
            }
            case "Escape": {
              cancelNormalSelected(draftCtx);
              moveHighlightCell(draftCtx, "down", 0, "rangeOfSelect");
              // $("#luckysheet-functionbox-cell").blur();
              // $("#luckysheet-rich-text-editor").focus();
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
            case "ArrowLeft": {
              rangeHightlightselected(draftCtx, refs.fxInput.current!);
              break;
            }
            case "ArrowRight": {
              rangeHightlightselected(draftCtx, refs.fxInput.current!);
              break;
            }
            default:
              break;
          }
        }
      });
    },
    [
      context.allowEdit,
      context.luckysheetCellUpdate.length,
      // Both are recreated when the selection changes. Without them here the
      // handler keeps a canStartEdit from the first render, which answers for a
      // workbook that had no selection yet and so always says no.
      canStartEdit,
      beginCellEdit,
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
      beginCellEdit();
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
            onKeyDown={onKeyDown}
            onChange={onChange}
            onBlur={() => setFocused(false)}
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
