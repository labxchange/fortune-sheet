import {
  locale,
  searchAll,
  searchNext,
  SearchResult,
  normalizeSelection,
  onSearchDialogMoveStart,
  replace,
  replaceAll,
  scrollToHighlightCell,
  replaceHtml,
} from "@fortune-sheet/core";
import produce from "immer";
import React, { useContext, useState, useCallback, useRef } from "react";
import _ from "lodash";
import WorkbookContext from "../../context";
import SVGIcon from "../SVGIcon";
import { useAlert } from "../../hooks/useAlert";
import { activateOnEnterOrSpace } from "../../utils/keyboardActivation";
import { useDialogFocus } from "../../hooks/useDialogFocus";
import { markAsRepeat } from "../../utils/liveRegion";
import "./index.css";

const SearchReplace: React.FC<{
  getContainer: () => HTMLDivElement;
}> = ({ getContainer }) => {
  const { context, setContext, refs } = useContext(WorkbookContext);
  const { findAndReplace, button } = locale(context);
  const [searchText, setSearchText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [showReplace, setShowReplace] = useState(context.showReplace);
  const [searchResult, setSearchResult] = useState<SearchResult[]>([]);
  const [selectedCell, setSelectedCell] = useState<{ r: number; c: number }>();
  const { showAlert } = useAlert();
  const [checkMode, checkModeReplace] = useState({
    regCheck: false,
    wordCheck: false,
    caseCheck: false,
  });
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [announcement, setAnnouncement] = useState("");

  // Searching for the same term twice, or replacing one occurrence after
  // another, writes the same sentence into the region — and a live region is
  // spoken when its text *changes*, so the second write would be silent.
  // markAsRepeat alternates an invisible zero-width space so the text node
  // differs without changing what is spoken.
  const announce = useCallback((message: string) => {
    setAnnouncement((previous) =>
      previous === message ? markAsRepeat(message) : message
    );
  }, []);

  // The find box, not the first focusable element — which is the close button,
  // so a default-to-first landing makes every keyboard user tab past the
  // control they opened the dialog to use. This also replaces the input's own
  // `autoFocus`, which covered opening and did nothing for closing.
  useDialogFocus(dialogRef, searchInputRef);

  const closeDialog = useCallback(() => {
    _.set(refs.globalCache, "searchDialog.mouseEnter", false);
    setContext((draftCtx) => {
      draftCtx.showSearch = false;
      draftCtx.showReplace = false;
    });
  }, [refs.globalCache, setContext]);

  const setCheckMode = useCallback(
    (mode: string, value: boolean) =>
      checkModeReplace(
        produce((draft) => {
          _.set(draft, mode, value);
        })
      ),
    []
  );

  const getInitialPosition = useCallback((container: HTMLDivElement) => {
    const rect = container.getBoundingClientRect();
    return {
      left: (rect.width - 500) / 2,
      top: (rect.height - 200) / 3,
    };
  }, []);

  return (
    // The mouse handlers drag the dialog around the grid. The rule fires now
    // only because role="dialog" made this a *known* non-interactive element —
    // the handlers predate it and are unchanged. Dragging is a pointer-only
    // convenience with no keyboard equivalent to withhold: every control in
    // the dialog is reachable and operable wherever it happens to sit, so
    // there is no behaviour here for a keyboard user to be locked out of.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      id="fortune-search-replace"
      className="fortune-search-replace fortune-dialog"
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="fortune-search-replace-title"
      tabIndex={-1}
      style={getInitialPosition(getContainer())}
      onMouseEnter={() => {
        _.set(refs.globalCache, "searchDialog.mouseEnter", true);
      }}
      onMouseLeave={() => {
        _.set(refs.globalCache, "searchDialog.mouseEnter", false);
      }}
      onMouseDown={(e) => {
        const { nativeEvent } = e;
        onSearchDialogMoveStart(refs.globalCache, nativeEvent, getContainer());
        e.stopPropagation();
      }}
    >
      <div className="container" onMouseDown={(e) => e.stopPropagation()}>
        {/* The dialog has no visible title — the Find/Replace tabs stand in for
            one — so the name AT reads comes from here. A heading rather than a
            bare span so it also lands in a screen reader's heading list. */}
        <h2 id="fortune-search-replace-title" className="sr-only">
          {findAndReplace.dialogTitle}
        </h2>
        <div
          className="icon-close fortune-modal-dialog-icon-close"
          onClick={closeDialog}
          onKeyDown={activateOnEnterOrSpace}
          tabIndex={0}
          role="button"
          aria-label={button.close}
        >
          <SVGIcon name="close" style={{ padding: 7, cursor: "pointer" }} />
        </div>
        <div className="tabBox">
          <span
            id="searchTab"
            className={showReplace ? "" : "on"}
            onClick={() => setShowReplace(false)}
            onKeyDown={activateOnEnterOrSpace}
            tabIndex={0}
            role="button"
            aria-pressed={!showReplace}
          >
            {findAndReplace.find}
          </span>
          <span
            id="replaceTab"
            className={showReplace ? "on" : ""}
            onClick={() => setShowReplace(true)}
            onKeyDown={activateOnEnterOrSpace}
            tabIndex={0}
            role="button"
            aria-pressed={showReplace}
          >
            {findAndReplace.replace}
          </span>
        </div>
        <div className="ctBox">
          <div className="row">
            <div className="inputBox">
              <div className="textboxs" id="searchInput">
                {/* The colon stays outside the label so it is not part of the
                    accessible name — screen readers at high punctuation
                    verbosity read it aloud, and it is a hardcoded fullwidth
                    colon that no locale overrides. */}
                <label htmlFor="fortune-search-find-input">
                  {findAndReplace.findTextbox}
                </label>
                ：
                <input
                  id="fortune-search-find-input"
                  className="formulaInputFocus"
                  ref={searchInputRef}
                  spellCheck="false"
                  onKeyDown={(e) => e.stopPropagation()}
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                />
              </div>
              {showReplace && (
                <div className="textboxs" id="replaceInput">
                  <label htmlFor="fortune-search-replace-input">
                    {findAndReplace.replaceTextbox}
                  </label>
                  ：
                  <input
                    id="fortune-search-replace-input"
                    className="formulaInputFocus"
                    spellCheck="false"
                    onKeyDown={(e) => e.stopPropagation()}
                    value={replaceText}
                    onChange={(e) => setReplaceText(e.target.value)}
                  />
                </div>
              )}
            </div>
            <div className="checkboxs">
              <div id="regCheck">
                <input
                  id="fortune-search-regCheck"
                  type="checkbox"
                  onChange={(e) => setCheckMode("regCheck", e.target.checked)}
                />
                <label htmlFor="fortune-search-regCheck">
                  {findAndReplace.regexTextbox}
                </label>
              </div>
              <div id="wordCheck">
                <input
                  id="fortune-search-wordCheck"
                  type="checkbox"
                  onChange={(e) => setCheckMode("wordCheck", e.target.checked)}
                />
                <label htmlFor="fortune-search-wordCheck">
                  {findAndReplace.wholeTextbox}
                </label>
              </div>
              <div id="caseCheck">
                <input
                  id="fortune-search-caseCheck"
                  type="checkbox"
                  onChange={(e) => setCheckMode("caseCheck", e.target.checked)}
                />
                <label htmlFor="fortune-search-caseCheck">
                  {findAndReplace.distinguishTextbox}
                </label>
              </div>
            </div>
          </div>
          <div className="btnBox">
            {showReplace && (
              <>
                <div
                  id="replaceAllBtn"
                  className="fortune-message-box-button button-default"
                  onClick={() => {
                    setContext((draftCtx) => {
                      setSelectedCell(undefined);
                      const alertMsg = replaceAll(
                        draftCtx,
                        searchText,
                        replaceText,
                        checkMode
                      );
                      showAlert(alertMsg);
                    });
                  }}
                  onKeyDown={activateOnEnterOrSpace}
                  tabIndex={0}
                  role="button"
                >
                  {findAndReplace.allReplaceBtn}
                </div>
                <div
                  id="replaceBtn"
                  className="fortune-message-box-button button-default"
                  onClick={() =>
                    setContext((draftCtx) => {
                      setSelectedCell(undefined);
                      const alertMsg = replace(
                        draftCtx,
                        searchText,
                        replaceText,
                        checkMode
                      );
                      if (alertMsg != null) {
                        showAlert(alertMsg);
                      }
                    })
                  }
                  onKeyDown={activateOnEnterOrSpace}
                  tabIndex={0}
                  role="button"
                >
                  {findAndReplace.replaceBtn}
                </div>
              </>
            )}
            <div
              id="searchAllBtn"
              className="fortune-message-box-button button-default"
              onClick={() =>
                setContext((draftCtx) => {
                  setSelectedCell(undefined);
                  if (!searchText) return;
                  const res = searchAll(draftCtx, searchText, checkMode);
                  setSearchResult(res);
                  if (_.isEmpty(res)) {
                    showAlert(findAndReplace.noFindTip);
                  } else {
                    // `matchesFoundTip`, not the existing `successTip`:
                    // that key means "items found" in English and "made N
                    // replacements" in zh_tw, so it cannot be trusted to
                    // report a search.
                    announce(
                      `${replaceHtml(findAndReplace.matchesFoundTip, {
                        xlength: res.length,
                      })}. ${findAndReplace.resultsShownTip}`
                    );
                  }
                })
              }
              onKeyDown={activateOnEnterOrSpace}
              tabIndex={0}
              role="button"
            >
              {findAndReplace.allFindBtn}
            </div>
            <div
              id="searchNextBtn"
              className="fortune-message-box-button button-default"
              onClick={() =>
                setContext((draftCtx) => {
                  setSearchResult([]);
                  const alertMsg = searchNext(draftCtx, searchText, checkMode);
                  if (alertMsg != null) showAlert(alertMsg);
                })
              }
              onKeyDown={activateOnEnterOrSpace}
              tabIndex={0}
              role="button"
            >
              {findAndReplace.findBtn}
            </div>
          </div>
        </div>
        <div
          className="close-button fortune-message-box-button button-default"
          onClick={closeDialog}
          onKeyDown={activateOnEnterOrSpace}
          tabIndex={0}
          role="button"
        >
          {button.close}
        </div>
        {/*
          Polite, and deliberately narrow. Every other outcome in this dialog
          already speaks for itself: Replace All, an empty Find All and each
          failure path open a MessageBox that takes focus, and Find Next and a
          result-row activation move the selection, which SheetOverlay's
          assertive #sr-selection announces. Adding those here would make the
          screen reader say each of them twice.
        */}
        <div className="sr-only" role="status">
          {announcement}
        </div>
        {searchResult.length > 0 && (
          <div id="searchAllbox">
            <div className="boxTitle">
              <span>{findAndReplace.searchTargetSheet}</span>
              <span>{findAndReplace.searchTargetCell}</span>
              <span>{findAndReplace.searchTargetValue}</span>
            </div>
            <div className="boxMain">
              {searchResult.map((v) => {
                return (
                  <div
                    className={`boxItem ${
                      _.isEqual(selectedCell, { r: v.r, c: v.c }) ? "on" : ""
                    }`}
                    key={v.cellPosition}
                    onClick={() => {
                      setContext((draftCtx) => {
                        draftCtx.luckysheet_select_save = normalizeSelection(
                          draftCtx,
                          [
                            {
                              row: [v.r, v.r],
                              column: [v.c, v.c],
                            },
                          ]
                        );
                        scrollToHighlightCell(draftCtx, v.r, v.c);
                      });
                      setSelectedCell({ r: v.r, c: v.c });
                    }}
                    onKeyDown={activateOnEnterOrSpace}
                    tabIndex={0}
                    role="button"
                  >
                    <span>{v.sheetName}</span>
                    <span>{v.cellPosition}</span>
                    <span>{v.value}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchReplace;
