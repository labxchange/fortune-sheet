import {
  Sheet,
  editSheetName,
  switchToSheet,
  locale,
} from "@fortune-sheet/core";
import _ from "lodash";
import React, {
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import WorkbookContext from "../../context";
import { useAlert } from "../../hooks/useAlert";
import SVGIcon from "../SVGIcon";
import {
  activateOnEnterOrSpace,
  focusAfterCommit,
  mouseDownToggleHandlers,
} from "../../utils/keyboardActivation";
import { announce } from "../../hooks/useContextMenuAnnouncements";
import { SHEET_TAB_MENU_ID } from "../ContextMenu/SheetTab";

type Props = {
  sheet: Sheet;
  isDropPlaceholder?: boolean;
};

const SheetItem: React.FC<Props> = ({ sheet, isDropPlaceholder }) => {
  const { context, setContext, refs } = useContext(WorkbookContext);
  const [editing, setEditing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const editable = useRef<HTMLSpanElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [svgColor, setSvgColor] = useState<string>("#c3c3c3");
  const optionsRef = useRef<HTMLSpanElement>(null);
  const optionsMenuOpen = context.sheetTabContextMenu?.sheet?.id === sheet.id;
  const isActiveSheet = context.currentSheetId === sheet.id;
  const { showAlert } = useAlert();
  const { info, sheetconfig } = locale(context);
  /**
   * Set when Escape abandons a rename, and cleared by the blur that follows it.
   * Leaving the blur to commit the restored text would look harmless — the name
   * is unchanged, so `editSheetName` succeeds — but a success is exactly what it
   * would then announce, for a rename the user just cancelled.
   */
  const renameCancelled = useRef(false);

  useEffect(() => {
    setContext((draftCtx) => {
      const r = context.sheetScrollRecord[draftCtx?.currentSheetId];
      if (r) {
        draftCtx.scrollLeft = r.scrollLeft ?? 0;
        draftCtx.scrollTop = r.scrollTop ?? 0;
        draftCtx.luckysheet_select_status = r.luckysheet_select_status ?? false;
        draftCtx.luckysheet_select_save = r.luckysheet_select_save ?? undefined;
      } else {
        draftCtx.scrollLeft = 0;
        draftCtx.scrollTop = 0;
        draftCtx.luckysheet_select_status = false;
        draftCtx.luckysheet_select_save = undefined;
      }
      draftCtx.luckysheet_selection_range = [];
    });
  }, [context.currentSheetId, context.sheetScrollRecord, setContext]);

  useEffect(() => {
    if (!editable.current) return;
    if (editing) {
      // select all when enter editing mode
      if (window.getSelection) {
        const range = document.createRange();
        range.selectNodeContents(editable.current);
        if (
          range.startContainer &&
          document.body.contains(range.startContainer)
        ) {
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
        // @ts-ignore
      } else if (document.selection) {
        // @ts-ignore
        const range = document.body.createTextRange();
        range.moveToElementText(editable.current);
        range.select();
      }

      /* Selecting the text does not focus the field, and nothing else here did
       * either — which is why keyboard rename appeared to work and swallowed
       * every keystroke (WCAG 2.1.1).
       *
       * Deferred rather than called inline because the options menu that
       * activated Rename is closing in this same commit, and React flushes
       * every passive-effect *destroy* before any create: useEscapeToClose's
       * cleanup restores focus to the options caret before this effect body
       * runs at all. That is an ordering guarantee, not a race, so an inline
       * focus() here would lose every time. A deferred one lands after the
       * whole passive phase. */
      focusAfterCommit(() => editable.current);
    }

    // store the current text
    editable.current.dataset.oldText = editable.current.innerText;
  }, [editing]);

  /**
   * Both exits from rename land here. Focus goes to the tab — the thing the
   * user acted on, and already in the tab order — rather than to the options
   * caret, which discloses a menu that is no longer open. Enter previously
   * called `blur()` and left focus on `<body>` (WCAG 2.4.3).
   */
  const leaveEditing = useCallback(() => {
    setEditing(false);
    focusAfterCommit(() => containerRef.current);
  }, []);

  const onBlur = useCallback(() => {
    if (renameCancelled.current) {
      renameCancelled.current = false;
      return;
    }
    setContext((draftCtx) => {
      const el = editable.current!;
      const oldName = el.dataset.oldText ?? "";
      const attempted = el.innerText;
      try {
        editSheetName(draftCtx, el);
        /* `editSheetName` restores `oldText` on every rejection — it throws for
         * an empty or malformed name but returns *quietly* for a duplicate — so
         * the element's own text is the only reliable signal of success.
         * Announcing on "did not throw" would speak a rename that never
         * happened. */
        if (el.innerText === attempted && attempted !== oldName) {
          announce(draftCtx, "sheetconfig.announceSheetRenamed", {
            name: attempted,
          });
        }
      } catch (e: any) {
        showAlert(e.message);
      }
    });
    leaveEditing();
  }, [leaveEditing, setContext, showAlert]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLSpanElement>) => {
      if (e.key === "Enter") {
        editable.current?.blur();
      } else if (e.key === "Escape") {
        /* Abandon the rename. The text is restored from `dataset.oldText` —
         * the same value `editSheetName` itself writes back on a rejection, so
         * this reuses the existing revert rather than adding a second way to
         * set a sheet name. The flag then suppresses the commit outright
         * instead of trusting it to be a no-op; see `renameCancelled`. */
        renameCancelled.current = true;
        if (editable.current) {
          editable.current.innerText = editable.current.dataset.oldText ?? "";
        }
        setContext((draftCtx) => {
          announce(draftCtx, "sheetconfig.announceSheetRenameCancelled");
        });
        leaveEditing();
        editable.current?.blur();
      }
      /* The grid's own key handling is a React handler on `.fortune-container`,
       * an ancestor of this span, so this stops Enter and Escape from also
       * moving the selection. `useRovingFocus` is a *native* listener and
       * cannot be stopped from here — it excludes contenteditable itself. */
      e.stopPropagation();
    },
    [leaveEditing, setContext]
  );

  const onDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (context.allowEdit === true)
        e.dataTransfer.setData("sheetId", `${sheet.id}`);
      e.stopPropagation();
    },
    [context.allowEdit, sheet.id]
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (context.allowEdit === false) return;
      const draggingId = e.dataTransfer.getData("sheetId");
      setContext((draftCtx) => {
        const droppingId = sheet.id;
        let draggingSheet: Sheet | undefined;
        let droppingSheet: Sheet | undefined;
        _.sortBy(draftCtx.luckysheetfile, ["order"]).forEach((f, i) => {
          f.order = i;
          if (f.id === draggingId) {
            draggingSheet = f;
          } else if (f.id === droppingId) {
            droppingSheet = f;
          }
        });
        if (draggingSheet && droppingSheet) {
          draggingSheet.order = droppingSheet.order! - 0.1;
          // re-order all sheets
          _.sortBy(draftCtx.luckysheetfile, ["order"]).forEach((f, i) => {
            f.order = i;
          });
        } else if (draggingSheet && isDropPlaceholder) {
          draggingSheet.order = draftCtx.luckysheetfile.length;
        }
      });
      setDragOver(false);
      e.stopPropagation();
    },
    [context.allowEdit, isDropPlaceholder, setContext, sheet.id]
  );

  /** Shared by the tab itself and by the options trigger, which switches to
   * the sheet it belongs to before opening. Previously the trigger only set
   * currentSheetId and relied on its click bubbling to the tab's own onClick
   * for the rest, which meant a keyboard-opened menu skipped that half.
   *
   * The transition itself lives in core's `switchToSheet`, so this route, the
   * all-sheets list and the Alt+Arrow shortcut cannot drift — they had already
   * drifted by a line before it was shared. Note it early-returns when the id
   * is already active, so re-opening the options menu on the current sheet no
   * longer re-stores the scroll record or cancels the selection; that was work
   * with no observable effect. */
  const switchToThisSheet = useCallback(
    (draftCtx: typeof context) =>
      switchToSheet(draftCtx, refs.globalCache, sheet.id!),
    [refs.globalCache, sheet.id]
  );

  const toggleOptionsMenu = useCallback(() => {
    if (isDropPlaceholder || context.allowEdit === false) return;
    const rect = refs.workbookContainer.current!.getBoundingClientRect();
    // anchored to the trigger's own position rather than the mouse pointer,
    // since a keyboard-activated press has no real pageX/pageY
    const triggerRect = optionsRef.current!.getBoundingClientRect();
    setContext((ctx) => {
      if (ctx.sheetTabContextMenu?.sheet?.id === sheet.id) {
        ctx.sheetTabContextMenu = {};
        return;
      }
      switchToThisSheet(ctx);
      ctx.sheetTabContextMenu = {
        x: triggerRect.left - rect.left - window.scrollX,
        y: triggerRect.bottom - rect.top - window.scrollY,
        sheet,
        onRename: () => setEditing(true),
      };
    });
  }, [
    context.allowEdit,
    isDropPlaceholder,
    refs.workbookContainer,
    setContext,
    sheet,
    switchToThisSheet,
  ]);

  return (
    <div
      role="tab"
      // Named explicitly: a tab computes its name from its contents, which
      // would otherwise absorb the options caret's "Sheet options" label —
      // every tab announced as "Sheet1 Sheet options". Matches the visible
      // text exactly, so there is no label-in-name concern, and the caret
      // stays exposed as its own button.
      aria-label={sheet.name}
      aria-selected={isActiveSheet}
      // Roving tabindex: exactly one tab is in the tab order, so Tab enters the
      // strip once instead of stepping through every sheet (20 sheets used to
      // mean 20 Tab presses). Arrows move focus within it; Enter/Space commits.
      // Keyed on selection rather than on focus — a simplification the APG
      // would have follow focus, which useRovingFocus does not track.
      tabIndex={isActiveSheet ? 0 : -1}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDragEnter={(e) => {
        setDragOver(true);
        e.stopPropagation();
      }}
      onDragLeave={(e) => {
        setDragOver(false);
        e.stopPropagation();
      }}
      onDragEnd={(e) => {
        setDragOver(false);
        e.stopPropagation();
      }}
      onDrop={onDrop}
      onDragStart={onDragStart}
      draggable={context.allowEdit && !editing}
      key={sheet.id}
      ref={containerRef}
      className={
        isDropPlaceholder
          ? "fortune-sheettab-placeholder"
          : `luckysheet-sheets-item${
              context.currentSheetId === sheet.id
                ? " luckysheet-sheets-item-active"
                : ""
            }`
      }
      onClick={() => {
        if (isDropPlaceholder) return;
        setContext(switchToThisSheet);
      }}
      onKeyDown={activateOnEnterOrSpace}
      onContextMenu={(e) => {
        if (isDropPlaceholder) return;
        const rect = refs.workbookContainer.current!.getBoundingClientRect();
        const { pageX, pageY } = e;
        setContext((ctx) => {
          // 右击的时候先进行跳转
          ctx.dataVerificationDropDownList = false;
          ctx.currentSheetId = sheet.id!;
          ctx.zoomRatio = sheet.zoomRatio || 1;
          ctx.sheetTabContextMenu = {
            x: pageX - rect.left - window.scrollX,
            y: pageY - rect.top - window.scrollY,
            sheet,
            onRename: () => setEditing(true),
          };
        });
      }}
      style={{
        borderLeft: dragOver ? "2px solid #0188fb" : "",
        display: sheet.hide === 1 ? "none" : "",
      }}
    >
      <span
        className="luckysheet-sheets-item-name"
        spellCheck="false"
        suppressContentEditableWarning
        contentEditable={isDropPlaceholder ? false : editing}
        /* Named and typed only while editing (WCAG 4.1.2). A bare
         * contenteditable is announced inconsistently across screen readers,
         * and role="textbox" on a span that is not editable would be a lie the
         * rest of the time — it would also add a second "text field" to every
         * tab in the strip.
         *
         * The name is a generic "Sheet name", not the sheet's own name: the tab
         * already carries that as its accessible name, so repeating it would
         * announce the same words twice and convey nothing about there now
         * being a field to type in.
         *
         * On the `role="tab"` ancestor: `tab` is a children-presentational role
         * in ARIA 1.2, which taken alone would hide this element. Core-AAM
         * keeps *focusable* descendants in the tree, and a contenteditable is
         * focusable, so it survives in practice — verified with NVDA and
         * VoiceOver rather than assumed, because the two specs disagree. */
        role={editing ? "textbox" : undefined}
        aria-label={editing ? sheetconfig.sheetNameInputLabel : undefined}
        aria-multiline={editing ? false : undefined}
        onDoubleClick={() => setEditing(true)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        ref={editable}
        style={dragOver ? { pointerEvents: "none" } : {}}
      >
        {sheet.name}
      </span>
      <span
        ref={optionsRef}
        className="luckysheet-sheets-item-function"
        onMouseEnter={() => setSvgColor("#5c5c5c")}
        onMouseLeave={() => setSvgColor("#c3c3c3")}
        // The toggle runs on mousedown, with stopPropagation, so that pressing
        // this trigger while its menu is open cannot be seen as an outside
        // click by the menu's useOutsideClick (which listens on mousedown):
        // that closed the menu a moment before click reopened it, which is why
        // a second press appeared to do nothing. Enter/Space call the toggle
        // directly for the same reason.
        {...mouseDownToggleHandlers(toggleOptionsMenu)}
        // follows the tab's own roving tabindex, or the strip would still cost
        // one Tab stop per sheet via the carets
        tabIndex={isActiveSheet ? 0 : -1}
        role="button"
        aria-label={info.sheetOptions}
        aria-haspopup="menu"
        aria-expanded={optionsMenuOpen}
        aria-controls={optionsMenuOpen ? SHEET_TAB_MENU_ID : undefined}
      >
        <SVGIcon name="downArrow" width={12} style={{ fill: svgColor }} />
      </span>
      {!!sheet.color && (
        <div
          className="luckysheet-sheets-item-color"
          style={{ background: sheet.color }}
        />
      )}
    </div>
  );
};

export default SheetItem;
