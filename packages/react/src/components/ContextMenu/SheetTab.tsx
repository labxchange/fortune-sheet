import { locale, deleteSheet, api, replaceHtml } from "@fortune-sheet/core";
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
import { onActivate, returnFocusToCell } from "../../utils/keyboardActivation";
import { markAsRepeat } from "../../utils/liveRegion";
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
  const { sheetconfig, info } = locale(context);
  const [position, setPosition] = useState({ x: -1, y: -1 });
  const [isShowChangeColor, setIsShowChangeColor] = useState<boolean>(false);
  const [isShowInputColor, setIsShowInputColor] = useState<boolean>(false);
  const [changeColorOpenedBy, setChangeColorOpenedBy] = useState<
    "pointer" | "keyboard"
  >("pointer");
  const [colorAnnouncement, setColorAnnouncement] = useState("");
  const colorAnnounceCount = useRef(0);
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
   * Say which colour the sheet tab now carries.
   *
   * Named from the palette where there is a name, falling back to the hex for a
   * colour chosen in the custom picker — the same rule the swatches themselves
   * use. A live region is silent when written the same text twice running, and
   * re-applying one colour is an obvious thing to do, so repeats carry the
   * modulo-2 marker the other announcement hooks use.
   */
  const announceColor = useCallback(
    (color: string | undefined) => {
      const colorNames = info.colorNames as Record<string, string> | undefined;
      const phrase = color
        ? replaceHtml(sheetconfig.sheetColorApplied, {
            color: colorNames?.[color] ?? color,
          })
        : sheetconfig.sheetColorRemoved;
      colorAnnounceCount.current += 1;
      setColorAnnouncement(
        colorAnnounceCount.current % 2 === 0 ? markAsRepeat(phrase) : phrase
      );
    },
    [info, sheetconfig]
  );

  /**
   * Confirm applied the colour, so the menu has done its job: collapse it and
   * put the user back on the sheet.
   *
   * Deferred through `returnFocusToCell` because closing unmounts the control
   * that currently holds focus — setting focus inline would be undone by
   * `useEscapeToClose`'s own restore as the submenu tears down, and a focus
   * left on a detached node silently falls back to `<body>`.
   */
  const confirmColor = useCallback(() => {
    setIsShowChangeColor(false);
    close();
    returnFocusToCell(refs.cellInput.current);
  }, [close, refs.cellInput]);

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
    autoFocus: changeColorOpenedBy === "keyboard",
    restoreFocus: changeColorOpenedBy === "keyboard",
  });

  useAdjacentSubmenuPosition({
    open: isShowChangeColor,
    triggerRef: changeColorRowRef,
    menuRef: changeColorMenuRef,
    boundaryRef: refs.workbookContainer,
  });

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
        api.setSheetOrder(ctx, { [sheet.id!]: currentOrder + delta });
      });
    },
    [context.allowEdit, setContext, sheet]
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

  /*
   * The status region is rendered whether or not the menu is open, and is the
   * first child in both branches so React keeps the *same* DOM node across the
   * close. That is the whole point of it living here: Confirm applies the
   * colour and closes the menu in one commit, and a live region that unmounts
   * in the commit that writes to it is gone before a screen reader reads it.
   * `SheetTabContextMenu` is itself mounted unconditionally by `Workbook`, so
   * the region is in the accessibility tree well before anything is written to
   * it — which is also what live regions require to fire at all.
   *
   * Assertive, and it was polite. The two rationales in this branch could not
   * both be right: `#sr-toolbar` argues at length that activating a control
   * leaves VoiceOver mid-hint and that a polite update is dropped rather than
   * queued while other speech is in progress — verified by ear, and the
   * `status` → `alert` flip there is what made those announcements audible.
   * This region reports the same kind of event, a colour applied by a
   * deliberate press, so the same reasoning applies to it and it was the one
   * sibling still contradicting it. The genuinely polite regions are the ones
   * driven by navigation or typing, where an interruption would talk over what
   * the user moved to hear.
   *
   * No `aria-atomic`: implicit for both roles, and none of the sibling regions
   * spells it out.
   */
  const colorStatus = (
    <div id="sr-sheetColor" className="sr-only" role="alert">
      {colorAnnouncement}
    </div>
  );

  if (!sheet || x == null || y == null) return colorStatus;

  return (
    <>
      {colorStatus}
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
                onMouseEnter={() => {
                  setChangeColorOpenedBy("pointer");
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
                  onClick={() => {
                    setChangeColorOpenedBy("pointer");
                    setIsShowChangeColor(true);
                  }}
                  onKeyDown={onActivate(() => {
                    setChangeColorOpenedBy("keyboard");
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
                    ref={changeColorMenuRef}
                    style={{ position: "absolute" }}
                  >
                    <ChangeColor
                      triggerParentUpdate={updateShowInputColor}
                      onColorApplied={announceColor}
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
    </>
  );
};

export default SheetTabContextMenu;
