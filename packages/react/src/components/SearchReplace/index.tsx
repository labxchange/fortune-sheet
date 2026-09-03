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
import React, { useContext, useState, useCallback, useRef, useId } from "react";
import _ from "lodash";
import WorkbookContext from "../../context";
import SVGIcon from "../SVGIcon";
import { useAlert } from "../../hooks/useAlert";
import {
  activateOnEnterOrSpace,
  focusAfterCommit,
} from "../../utils/keyboardActivation";
import { useDialogFocus } from "../../hooks/useDialogFocus";
import { useRovingFocus } from "../../hooks/useRovingFocus";
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
  const { showAlert } = useAlert();
  const [checkMode, checkModeReplace] = useState({
    regCheck: false,
    wordCheck: false,
    caseCheck: false,
  });
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  // Null until focus first enters the list. aria-selected is a claim about what
  // the user has chosen, and option 0 carrying it on render tells a screen
  // reader a result was picked before the list was ever reached. Null also
  // means "no roving stop yet", which is why the tabIndex below falls back to
  // the first option: the list still needs exactly one tab stop to enter by.
  const [activeRow, setActiveRow] = useState<number | null>(null);
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

  // Derived from one useId rather than hardcoded, because every one of these
  // is pure a11y wiring — none is referenced by a stylesheet — and htmlFor and
  // aria-labelledby resolve to the *first* match in document order. Two
  // <Workbook>s on one page with this dialog open in both is enough: the
  // second dialog would take its name from the first one's heading, and
  // clicking its "Find" label would focus the first one's input.
  //
  // The ids in this file that are CSS selectors (#fortune-search-replace,
  // #searchAllbox, #searchInput, #regCheck and friends) stay hardcoded — they
  // have to be, and duplicating them is inert because nothing reads them for
  // meaning.
  const instanceId = useId();
  const titleId = `${instanceId}-title`;
  const findInputId = `${instanceId}-find-input`;
  const replaceInputId = `${instanceId}-replace-input`;
  const regCheckId = `${instanceId}-reg-check`;
  const wordCheckId = `${instanceId}-word-check`;
  const caseCheckId = `${instanceId}-case-check`;
  const resultsHintId = `${instanceId}-results-hint`;

  // The find box, not the first focusable element — which is the close button,
  // so a default-to-first landing makes every keyboard user tab past the
  // control they opened the dialog to use. This also replaces the input's own
  // `autoFocus`, which covered opening and did nothing for closing.
  //
  // The cell input is the fallback for a closed dialog whose opener has gone:
  // it is where the grid's own keyboard handling runs from, so it is both a
  // real focus target and the one a spreadsheet user expects to be left on.
  useDialogFocus(dialogRef, searchInputRef, refs.cellInput);

  // A listbox is a single tab stop whose options are reached with the arrows,
  // and that contract is the whole reason this is a listbox: forty matches
  // used to be forty tab stops inside a dialog that traps Tab, and the arrows
  // did nothing at all — they fell through to the workbook container, which
  // reads them as sheet moves.
  //
  // That fall-through is why the hook's stopPropagation matters more here than
  // at its other call sites: without it an arrow spent choosing a result would
  // also slide the selection under the dialog.
  useRovingFocus({
    containerRef: resultsRef,
    orientation: "vertical",
    itemSelector: '[role="option"]',
    enabled: searchResult.length > 0,
  });

  const closeDialog = useCallback(() => {
    setContext((draftCtx) => {
      draftCtx.showSearch = false;
      draftCtx.showReplace = false;
    });
  }, [setContext]);

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
      // Deliberately no aria-modal. It would tell assistive tech the rest of
      // the page is inert, and this dialog is not that kind of dialog: there
      // is no mask and nothing is inert, the grid stays scrollable and
      // clickable underneath, activating a result row hands focus to the cell
      // input on purpose, and the outcomes this dialog does not announce
      // itself are announced by SheetOverlay's #sr-selection — which lives
      // outside this element. Under aria-modal a screen reader is entitled to
      // ignore all three, and which ones it ignores varies by reader.
      //
      // The Tab cycle in useDialogFocus stays: it keeps Tab a dialog gesture
      // rather than a grid move, which is a keyboard convenience and not a
      // claim of modality.
      //
      // No keyboard trap (WCAG 2.1.2), though this is the combination that
      // makes the question real rather than theoretical: Tab now cycles, and
      // Escape does not close this dialog — SearchReplace does not call
      // useEscapeToClose at all. 2.1.2 asks that focus be movable away using
      // standard keys, not that Escape in particular work, and it is: both
      // Close controls are inside the cycle and reachable by Tab, so Tab then
      // Enter leaves; activating a result row closes the dialog and hands
      // focus to the grid. Escape would still be an improvement and is
      // deliberately not done here — wiring it means joining
      // useEscapeToClose's open-instance stack, which changes who claims
      // Escape while the grid has a popup open, and that is its own change
      // with its own regression surface.
      aria-labelledby={titleId}
      tabIndex={-1}
      style={getInitialPosition(getContainer())}
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
        <h2 id={titleId} className="sr-only">
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
                <label htmlFor={findInputId}>
                  {findAndReplace.findTextbox}
                </label>
                ：
                <input
                  id={findInputId}
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
                  <label htmlFor={replaceInputId}>
                    {findAndReplace.replaceTextbox}
                  </label>
                  ：
                  <input
                    id={replaceInputId}
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
                  id={regCheckId}
                  type="checkbox"
                  onChange={(e) => setCheckMode("regCheck", e.target.checked)}
                />
                <label htmlFor={regCheckId}>
                  {findAndReplace.regexTextbox}
                </label>
              </div>
              <div id="wordCheck">
                <input
                  id={wordCheckId}
                  type="checkbox"
                  onChange={(e) => setCheckMode("wordCheck", e.target.checked)}
                />
                <label htmlFor={wordCheckId}>
                  {findAndReplace.wholeTextbox}
                </label>
              </div>
              <div id="caseCheck">
                <input
                  id={caseCheckId}
                  type="checkbox"
                  onChange={(e) => setCheckMode("caseCheck", e.target.checked)}
                />
                <label htmlFor={caseCheckId}>
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
                      const alertMsg = replace(
                        draftCtx,
                        searchText,
                        replaceText,
                        checkMode
                      );
                      if (alertMsg != null) {
                        showAlert(alertMsg);
                      } else {
                        // The one outcome in this dialog with nothing to hear:
                        // Replace rewrites a single cell and moves the
                        // selection onto it, and the selection move is
                        // announced by #sr-selection as a cell — its address
                        // and its new contents — never as "a replacement
                        // happened". `replacedTip` is the same key replaceAll
                        // reports with, so the two read alike.
                        announce(
                          replaceHtml(findAndReplace.replacedTip, {
                            xlength: 1,
                          })
                        );
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
                // These three setStates run inside the recipe, and the recipe
                // is a React state updater — the same deferral 3215790
                // documents for the wheel handler, which React runs in the
                // render pass whenever the fiber has pending work. React says
                // so in CI: "Cannot update a component (SearchReplace) while
                // rendering a different component". The updates are scheduled
                // rather than dropped, so it works, but `announce` riding on
                // that is a silent a11y regression if it ever stops.
                //
                // Not fixed here because the fix is not the obvious hoist:
                // reading a value the recipe assigned, immediately after
                // calling setContext, has the same deferral problem one level
                // out — the recipe may not have run yet, so the hoisted call
                // would set the previous result. Doing it properly means
                // splitting `searchAll` into a pure query and the draft
                // mutation it also performs, which is a core change and its
                // own ticket. Same shape in the replace, replaceAll and
                // searchNext handlers, which call showAlert from inside their
                // recipes; all of it predates this branch.
                setContext((draftCtx) => {
                  if (!searchText) return;
                  const res = searchAll(draftCtx, searchText, checkMode);
                  setSearchResult(res);
                  // A new list starts unentered, or the roving tab stop
                  // points past the end of a shorter one — and a result the
                  // user has not arrowed to yet is not a selected result.
                  setActiveRow(null);
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
          failure path open a MessageBox, which is an alertdialog named by its
          own message and so announces that message on entry; Find Next and a
          result-row activation move the selection, which SheetOverlay's
          assertive #sr-selection announces. Adding those here would make the
          screen reader say each of them twice.

          Replace All's count depends on that MessageBox naming: it is the only
          place the number is reported, and before the alertdialog change the
          dialog was unnamed, so whether the sentence was read on entry was up
          to the reader. Routing it through this region instead would not have
          worked — the MessageBox is aria-modal, and this region is outside it.

          Both of those fallbacks sit outside this dialog, which is the other
          half of why the root element does not claim aria-modal — see the
          note there.
        */}
        <div className="sr-only" role="status">
          {announcement}
        </div>
        {searchResult.length > 0 && (
          <div id="searchAllbox">
            {/*
              A sibling of the listbox, not a child of it: aria-describedby
              resolves by id from anywhere in the document, and the listbox
              must own nothing but its options — see the note below.
            */}
            <div id={resultsHintId} className="sr-only">
              {findAndReplace.resultsUsageHint}
            </div>
            <div
              className="searchResultsList"
              ref={resultsRef}
              role="listbox"
              aria-label={findAndReplace.resultsListName}
              // The instruction is described, not named. As part of each
              // option's name it was re-read on every arrow key — forty
              // results meant hearing how to activate one forty times — where
              // a description on the list is offered once, on entry.
              aria-describedby={resultsHintId}
            >
              {/*
                Decorative, and hidden from assistive tech on purpose. These
                are column captions for a list that is no longer a table: an
                option's name comes from its own label, which names each field
                inline ("Sheet Sheet1, cell A1, ..."), so exposing these too
                would have a reader announce the headings once at the top and
                then never again in a way that lines up with anything.
              */}
              <div className="boxTitle" aria-hidden="true">
                <span>{findAndReplace.searchTargetSheet}</span>
                <span>{findAndReplace.searchTargetCell}</span>
                <span>{findAndReplace.searchTargetValue}</span>
              </div>
              {/*
                No wrapper element between the listbox and its options: ARIA
                requires a listbox to *own* its options, and a plain div in
                that position is a generic node that breaks the relationship —
                assistive tech then exposes a listbox with nothing in it, so
                there is nothing to arrow between. The caption row above is a
                non-option child too, which is legal only because aria-hidden
                takes it out of the tree entirely.
              */}
              {searchResult.map((v, i) => {
                return (
                  // An option, not a row, and not the plain `role="button"`
                  // an earlier revision of this file refused. That refusal
                  // was right while the results were a table — a row that
                  // overrides its role stops being a row — and stopped
                  // applying the moment they were not.
                  //
                  // The role has to be one whose name is computed from its
                  // contents: `gridcell` is not one, which is why a
                  // `role="grid"` attempt still read cell by cell in
                  // VoiceOver, and `option` is. `option` also carries the
                  // selection this list actually expresses — the user is
                  // picking one result to travel to.
                  //
                  // The role alone does not make the option a single stop,
                  // though. The spec says such a role flattens its children
                  // out of the tree; Chrome does not, and leaves them as
                  // StaticText. So the children are hidden explicitly below
                  // rather than left to a rule the engines disagree on.
                  <div
                    className="boxItem"
                    key={v.cellPosition}
                    role="option"
                    aria-selected={i === activeRow}
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
                      // Activating a result is a go-to, and it is finished
                      // once the user is on the cell: the dialog has nothing
                      // further to offer about a result already reached, and
                      // leaving it up parks it over the grid it just scrolled
                      // into view, out of the tab ring and holding a stale
                      // list. Closing is also what makes the focus move below
                      // coherent — an open dialog whose focus sits outside it
                      // is the half-state a keyboard user cannot read.
                      closeDialog();
                      // Selecting the cell is not the same as going to it:
                      // the grid's keyboard handling only runs while the cell
                      // input holds focus, so without this the row moved the
                      // selection and left the arrow keys dead. Deferred by a
                      // task, which is also what sequences it after the close:
                      // useDialogFocus's unmount cleanup restores focus to
                      // whatever opened the dialog, and that runs first.
                      focusAfterCommit(() => refs.cellInput.current);
                    }}
                    onKeyDown={activateOnEnterOrSpace}
                    onFocus={() => setActiveRow(i)}
                    // Roving: one tab stop for the whole list, with the
                    // arrows moving inside it. Tracking focus rather than
                    // driving it means useRovingFocus's own .focus() keeps
                    // this in step without the two knowing about each other.
                    tabIndex={(activeRow ?? 0) === i ? 0 : -1}
                    aria-label={replaceHtml(findAndReplace.resultRowLabel, {
                      sheet: v.sheetName,
                      cell: v.cellPosition,
                      value: v.value,
                    })}
                  >
                    {/*
                      Hidden from assistive tech, and not decorative by
                      accident: all three values are already in the option's
                      name above, so what is left in the tree is the same
                      words a second time, in the shape that invites the
                      cell-by-cell walk this listbox exists to end. The
                      presentational-children rule says an `option` flattens
                      its children, but Chrome does not implement it — its
                      accessibility tree keeps all three as StaticText, just
                      as it kept the old row's cells. Hiding them is what
                      makes an option one node in any engine, rather than
                      resting on a rule one of them ignores.
                      `role="presentation"` here does not work; the text stays
                      exposed.

                      This makes `aria-label` load-bearing: with the spans
                      hidden and no label, the option has no name at all.
                    */}
                    <span aria-hidden="true">{v.sheetName}</span>
                    <span aria-hidden="true">{v.cellPosition}</span>
                    <span aria-hidden="true">{v.value}</span>
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
