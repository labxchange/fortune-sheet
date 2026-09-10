import { locale, deleteSheet, api, Context } from "@fortune-sheet/core";
import _ from "lodash";
import React, {
  useContext,
  useId,
  useRef,
  useState,
  useLayoutEffect,
  useCallback,
} from "react";
import WorkbookContext from "../../context";
import { useAdjacentSubmenuPosition } from "../../hooks/useAdjacentSubmenuPosition";
import { useAlert } from "../../hooks/useAlert";
import { useOutsideClick } from "../../hooks/useOutsideClick";
import { useEscapeToClose } from "../../hooks/useEscapeToClose";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import { focusAfterCommit, onActivate } from "../../utils/keyboardActivation";
import { ChangeColor } from "../ChangeColor";
import SVGIcon from "../SVGIcon";
import Divider from "./Divider";
import "./index.css";
import Menu from "./Menu";

/**
 * Only one sheet-tab options menu can be open at a time, so a constant id is
 * enough to wire it to whichever tab's trigger opened it. The trigger lives in
 * SheetTab/SheetItem, a different subtree, so a useId() generated here would
 * not be reachable from there.
 */
export const SHEET_TAB_MENU_ID = "fortune-sheet-tab-options-menu";

const SheetTabContextMenu: React.FC = () => {
  const { context, setContext, settings, refs } = useContext(WorkbookContext);
  const { x, y, sheet, onRename } = context.sheetTabContextMenu;
  const { sheetconfig } = locale(context);
  const [position, setPosition] = useState({ x: -1, y: -1 });
  const [isShowChangeColor, setIsShowChangeColor] = useState<boolean>(false);
  const [isShowInputColor, setIsShowInputColor] = useState<boolean>(false);
  /**
   * Whether opening the colour submenu should take focus into it.
   *
   * Deliberate activation vs. hover — not keyboard vs. pointer. Keying it on
   * which handler fired excluded screen-reader users, whose VO+Space arrives as
   * a click and never as a keydown, so they opened the panel and stayed outside
   * it. Only a pointer drifting across the row declines focus.
   */
  const [focusColorOnOpen, setFocusColorOnOpen] = useState<boolean>(false);
  const { showAlert, hideAlert } = useAlert();
  const changeColorMenuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const changeColorRowRef = useRef<HTMLDivElement>(null);
  const changeColorMenuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setContext((ctx) => {
      ctx.sheetTabContextMenu = {};
    });
  }, [setContext]);

  /**
   * Confirm applied the colour, so the menu has done its job: collapse it and
   * put the user back on the control that opened it — the sheet's own options
   * caret (WCAG 2.4.3).
   *
   * This used to return focus to the cell input, on the rule #27 generalised:
   * "put focus back on the cells a command acted on". That rule does not reach
   * this command, which recoloured a *sheet tab* and touched no cell — so it
   * sent the user to an object the command never changed, several stops away
   * from where they were working. Escape out of this same submenu already
   * restores focus to the opener (see `useEscapeToClose` below); OK doing
   * something different was the inconsistency the audit filed.
   *
   * Still deferred, for the original reason: closing unmounts the control that
   * currently holds focus, so setting focus inline would be undone by
   * `useEscapeToClose`'s own restore as the submenu tears down, and focus left
   * on a detached node silently falls back to `<body>`. The target is resolved
   * inside the deferral, against the settled DOM, with the cell input as the
   * fallback for the case where the strip is gone by then.
   */
  const confirmColor = useCallback(() => {
    setIsShowChangeColor(false);
    close();
    focusAfterCommit(
      () =>
        refs.workbookContainer.current?.querySelector<HTMLElement>(
          ".luckysheet-sheets-item-active .luckysheet-sheets-item-function"
        ) ?? refs.cellInput.current
    );
  }, [close, refs.cellInput, refs.workbookContainer]);

  useLayoutEffect(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect && x != null && y != null) {
      setPosition({ x, y: y - rect.height });
    }
  }, [x, y]);

  useOutsideClick(containerRef, close, [close]);
  const isOpen = sheet != null && x != null && y != null;
  useEscapeToClose({
    open: isOpen,
    onClose: close,
    containerRef,
    // WCAG 2.4.11. No withinRefs: unlike FilterMenu's, this menu's Change-color
    // submenu renders *inside* containerRef, so contains() already covers it.
    closeOnFocusOut: true,
  });
  useRovingFocus({ containerRef, orientation: "vertical", enabled: isOpen });
  useEscapeToClose({
    open: isShowChangeColor,
    onClose: () => setIsShowChangeColor(false),
    containerRef: changeColorMenuRef,
    autoFocus: focusColorOnOpen,
    restoreFocus: focusColorOnOpen,
  });

  useAdjacentSubmenuPosition({
    open: isShowChangeColor,
    triggerRef: changeColorRowRef,
    menuRef: changeColorMenuRef,
    boundaryRef: refs.workbookContainer,
  });

  /**
   * Where the sheet sits among the *visible* sheets — the position the tab
   * strip shows and the announcement reports. Used to tell a real move from
   * a no-op one (see moveSheet).
   */
  const visibleIndexOf = useCallback(
    (ctx: Context) =>
      _.sortBy(
        ctx.luckysheetfile.filter((oneSheet) => oneSheet.hide !== 1),
        (oneSheet) => Number(oneSheet.order)
      ).findIndex((oneSheet) => oneSheet.id === sheet?.id),
    [sheet?.id]
  );

  const moveSheet = useCallback(
    (delta: number) => {
      if (context.allowEdit === false) return;
      if (!sheet) return;
      setContext((ctx) => {
        let currentOrder = -1;
        _.sortBy(ctx.luckysheetfile, ["order"]).forEach((_sheet, i) => {
          _sheet.order = i;
          if (_sheet.id === sheet.id) {
            currentOrder = i;
          }
        });
        const positionBefore = visibleIndexOf(ctx);
        api.setSheetOrder(ctx, { [sheet.id!]: currentOrder + delta });
        // Only announce when the sheet actually changed visible position:
        // setSheetOrder re-normalises orders from 0, so a move past either
        // end is a no-op, and a ±1.5 hop over a hidden neighbour changes the
        // all-sheets order without moving the sheet in the tab strip.
        // The menu only opens for the current sheet, so the announcement
        // hook can read the new position off currentSheetId — this counter
        // just marks that a move happened at all.
        if (visibleIndexOf(ctx) !== positionBefore) {
          ctx.sheetTabMoveCount = (ctx.sheetTabMoveCount ?? 0) + 1;
        }
      });
    },
    [context.allowEdit, setContext, sheet, visibleIndexOf]
  );

  const hideSheet = useCallback(() => {
    if (context.allowEdit === false) return;
    if (!sheet) return;
    setContext((ctx) => {
      const shownSheets = ctx.luckysheetfile.filter(
        (oneSheet) => _.isUndefined(oneSheet.hide) || oneSheet?.hide !== 1
      );
      if (shownSheets.length > 1) {
        api.hideSheet(ctx, sheet.id as string);
      } else {
        showAlert(sheetconfig.noMoreSheet, "ok");
      }
    });
  }, [context.allowEdit, setContext, sheet, showAlert, sheetconfig]);

  const copySheet = useCallback(() => {
    if (context.allowEdit === false) return;
    if (!sheet?.id) return;
    setContext(
      (ctx) => {
        api.copySheet(ctx, sheet.id!);
      },
      { addSheetOp: true }
    );
  }, [context.allowEdit, setContext, sheet?.id]);
  const updateShowInputColor = useCallback((state: boolean) => {
    setIsShowInputColor(state);
  }, []);

  const focusSheet = useCallback(() => {
    if (context.allowEdit === false) return;
    if (!sheet?.id) return;
    setContext((ctx) => {
      _.forEach(ctx.luckysheetfile, (sheetfile) => {
        sheetfile.status = sheet.id === sheetfile.id ? 1 : 0;
      });
    });
  }, [context.allowEdit, setContext, sheet?.id]);

  if (!sheet || x == null || y == null) return null;

  return (
    <div
      id={SHEET_TAB_MENU_ID}
      role="menu"
      className="fortune-context-menu luckysheet-cols-menu"
      onContextMenu={(e) => e.stopPropagation()}
      style={{ left: position.x, top: position.y, overflow: "visible" }}
      ref={containerRef}
    >
      {settings.sheetTabContextMenu?.map((name, i) => {
        if (name === "delete") {
          return (
            <Menu
              key={name}
              role="button"
              onClick={() => {
                const shownSheets = context.luckysheetfile.filter(
                  (singleSheet) =>
                    _.isUndefined(singleSheet.hide) || singleSheet.hide !== 1
                );
                if (
                  context.luckysheetfile.length > 1 &&
                  shownSheets.length > 1
                ) {
                  showAlert(sheetconfig.confirmDelete, "yesno", () => {
                    setContext(
                      (ctx) => {
                        deleteSheet(ctx, sheet.id!);
                      },
                      {
                        deleteSheetOp: {
                          id: sheet.id!,
                        },
                      }
                    );
                    hideAlert();
                  });
                } else {
                  showAlert(sheetconfig.noMoreSheet, "ok");
                }
                close();
              }}
            >
              {sheetconfig.delete}
            </Menu>
          );
        }
        if (name === "rename") {
          return (
            <Menu
              key={name}
              role="button"
              onClick={() => {
                onRename?.();
                close();
              }}
            >
              {sheetconfig.rename}
            </Menu>
          );
        }
        if (name === "move") {
          return (
            <React.Fragment key={name}>
              <Menu
                role="button"
                onClick={() => {
                  moveSheet(-1.5);
                  close();
                }}
              >
                {sheetconfig.moveLeft}
              </Menu>
              <Menu
                role="button"
                onClick={() => {
                  moveSheet(1.5);
                  close();
                }}
              >
                {sheetconfig.moveRight}
              </Menu>
            </React.Fragment>
          );
        }
        if (name === "hide") {
          return (
            <Menu
              key={name}
              role="button"
              onClick={() => {
                hideSheet();
                close();
              }}
            >
              {sheetconfig.hide}
            </Menu>
          );
        }
        if (name === "copy") {
          return (
            <Menu
              key={name}
              role="button"
              onClick={() => {
                copySheet();
                close();
              }}
            >
              {sheetconfig.copy}
            </Menu>
          );
        }
        if (name === "color") {
          return (
            <div
              key={name}
              ref={changeColorRowRef}
              style={{ position: "relative" }}
              /*
               * Ties the panel to this row in the accessibility tree, so a
               * screen-reader cursor finds it beside the control that opened it
               * rather than wherever it lands structurally. `aria-owns` is
               * global, so it is valid on this roleless wrapper — and keeping it
               * here rather than on the `Menu` keeps the panel out of that
               * button's presentational subtree.
               *
               * Conditional because an `aria-owns` naming an id that is not in
               * the document is invalid and axe reports it; the panel only
               * mounts while open.
               */
              aria-owns={isShowChangeColor ? changeColorMenuId : undefined}
              onMouseEnter={() => {
                // Hover opens it, but must not pull focus off the user.
                setFocusColorOnOpen(false);
                setIsShowChangeColor(true);
              }}
              onMouseLeave={() => {
                if (!isShowInputColor) {
                  setIsShowChangeColor(false);
                }
              }}
            >
              <Menu
                role="button"
                expanded={isShowChangeColor}
                // No `hasPopup`: what this discloses is a panel of colours,
                // not a menu — see the container below. `aria-expanded` plus
                // `aria-controls` is already the whole disclosure
                // relationship, which is the argument `Combo` makes for the
                // same shape.
                controls={changeColorMenuId}
                // Both routes take focus into the panel: activating a
                // disclosure is a request to go into it, and assistive
                // technology reaches this as a click, never as a keydown.
                onClick={() => {
                  setFocusColorOnOpen(true);
                  setIsShowChangeColor(true);
                }}
                onKeyDown={onActivate(() => {
                  setFocusColorOnOpen(true);
                  setIsShowChangeColor(true);
                })}
              >
                {sheetconfig.changeColor}
                <span className="change-color-triangle">
                  <SVGIcon name="rightArrow" width={18} />
                </span>
              </Menu>
              {isShowChangeColor && context.allowEdit && (
                <div
                  id={changeColorMenuId}
                  // A group, not a menu. `role="menu"` may only own
                  // `menuitem`/`menuitemradio`/`menuitemcheckbox`/`group`,
                  // and this owns the shared `ColorPicker` — a `listbox` of
                  // 64 options since this work gave the palette the role its
                  // interaction model already had — plus a text field and
                  // Confirm. axe reports `aria-required-children` for it. The
                  // filter-by-colour submenu answers the same question the
                  // same way (`ContextMenu/Menu.tsx`).
                  role="group"
                  // Named, and that is load-bearing rather than tidy: an
                  // unnamed group is routinely flattened away by VoiceOver, so
                  // the panel was reachable by Tab — focusability does not
                  // depend on the tree — and skipped by the VO cursor, which is
                  // how a keyboard-operable panel came to be unnavigable with a
                  // screen reader. The filter-by-colour submenu, which does not
                  // have this problem, names its group the same way.
                  aria-label={sheetconfig.changeColor}
                  ref={changeColorMenuRef}
                  style={{ position: "absolute" }}
                >
                  <ChangeColor
                    triggerParentUpdate={updateShowInputColor}
                    onConfirm={confirmColor}
                  />
                </div>
              )}
            </div>
          );
        }
        if (name === "focus") {
          return (
            <Menu
              key={name}
              role="button"
              onClick={() => {
                focusSheet();
                close();
              }}
            >
              {sheetconfig.focus}
            </Menu>
          );
        }
        if (name === "|") {
          return <Divider key={`divide-${i}`} />;
        }
        return null;
      })}
    </div>
  );
};

export default SheetTabContextMenu;
