import React, {
  useContext,
  useCallback,
  useId,
  useRef,
  useEffect,
  useState,
} from "react";
import {
  toolbarItemClickHandler,
  handleTextBackground,
  handleTextColor,
  handleTextSize,
  normalizedCellAttr,
  getFlowdata,
  newComment,
  editComment,
  deleteComment,
  showHideComment,
  showHideAllComments,
  autoSelectionFormula,
  handleSum,
  locale,
  handleMerge,
  handleBorder,
  toolbarItemSelectedFunc,
  handleFreeze,
  insertImage,
  showImgChooser,
  updateFormat,
  handleSort,
  handleHorizontalAlign,
  handleVerticalAlign,
  handleScreenShot,
  createFilter,
  clearFilter,
  applyLocation,
  shortcutKeysForPlatform,
  OPEN_SHORTCUTS_KEYS,
  replaceHtml,
} from "@fortune-sheet/core";
import type { Context, MergeOutcome, SortOutcome } from "@fortune-sheet/core";
import _ from "lodash";
import WorkbookContext from "../../context";
import "./index.css";
import Button from "./Button";
import { MORE_ITEMS_ID } from "./MoreItemsContainer";
import Divider, { MenuDivider } from "./Divider";
import Combo from "./Combo";
import Select, { Option } from "./Select";
import SVGIcon from "../SVGIcon";
import { useAdjacentSubmenuPosition } from "../../hooks/useAdjacentSubmenuPosition";
import { useDialog } from "../../hooks/useDialog";
import { sortRefusalMessage } from "../../utils/sortRefusal";
import { useEscapeToClose } from "../../hooks/useEscapeToClose";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import {
  anchorCell,
  borderFingerprint,
  clearFormatFingerprint,
  useToolbarAnnouncements,
} from "../../hooks/useToolbarAnnouncements";
import {
  activateOnEnterOrSpace,
  focusAfterCommit,
  onActivate,
} from "../../utils/keyboardActivation";
import { filterUnchanged } from "../../utils/filterDom";
import { FormulaSearch } from "../FormulaSearch";
import { SplitColumn } from "../SplitColumn";
import { LocationCondition } from "../LocationCondition";
import DataVerification from "../DataVerification";
import ConditionalFormat from "../ConditionFormat";
import CustomButton from "./CustomButton";
import { CustomColor } from "./CustomColor";
import CustomBorder from "./CustomBorder";
import { FormatSearch } from "../FormatSearch";

const MoreFormatOption: React.FC<{
  text: string;
  moreCurrencyText: string;
  moreNumberText: string;
  onPickCurrency: () => void;
  onPickNumber: () => void;
}> = ({
  text,
  moreCurrencyText,
  moreNumberText,
  onPickCurrency,
  onPickNumber,
}) => {
  const { refs } = useContext(WorkbookContext);
  const [open, setOpen] = useState(false);
  const [openedBy, setOpenedBy] = useState<"pointer" | "keyboard">("pointer");
  const menuId = useId();
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useAdjacentSubmenuPosition({
    open,
    triggerRef,
    menuRef,
    boundaryRef: refs.workbookContainer,
  });

  useEscapeToClose({
    open,
    onClose: () => setOpen(false),
    containerRef: menuRef,
    autoFocus: openedBy === "keyboard",
    restoreFocus: openedBy === "keyboard",
  });
  useRovingFocus({
    containerRef: menuRef,
    orientation: "vertical",
    enabled: open,
  });

  return (
    <div
      onMouseEnter={() => {
        setOpenedBy("pointer");
        setOpen(true);
      }}
      onMouseLeave={() => setOpen(false)}
    >
      <Option
        ref={triggerRef}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onKeyDown={onActivate(() => {
          setOpenedBy("keyboard");
          setOpen(true);
        })}
      >
        <div className="fortune-toolbar-menu-line">
          <div>{text}</div>
          <SVGIcon name="rightArrow" width={14} />
        </div>
      </Option>
      <div
        ref={menuRef}
        id={menuId}
        role="menu"
        className="more-format toolbar-item-sub-menu fortune-toolbar-select"
        style={{
          display: open ? "block" : "none",
          width: 150,
        }}
      >
        {[
          { text: moreCurrencyText, onclick: onPickCurrency },
          { text: moreNumberText, onclick: onPickNumber },
        ].map((v) => (
          <div
            className="set-background-item fortune-toolbar-select-option"
            key={v.text}
            onClick={v.onclick}
            onKeyDown={activateOnEnterOrSpace}
            tabIndex={0}
            role="button"
          >
            {v.text}
          </div>
        ))}
      </div>
    </div>
  );
};

const Toolbar: React.FC<{
  setMoreItems: React.Dispatch<React.SetStateAction<React.ReactNode>>;
  moreItemsOpen: boolean;
}> = ({ setMoreItems, moreItemsOpen }) => {
  const { context, setContext, refs, settings, handleUndo, handleRedo } =
    useContext(WorkbookContext);
  const contextRef = useRef(context);
  const containerRef = useRef<HTMLDivElement>(null);
  // Arrow-key movement between toolbar buttons, the navigation half of the
  // ARIA toolbar pattern. Purely additive: every button keeps its own tab
  // stop, so Tab behaves exactly as before. Collapsing those into a single
  // roving tab stop means giving eight heterogeneous item components a shared
  // owner for tabIndex, which is left as a follow-up.
  //
  // The selector excludes combo popups. `Combo` renders its dropdown inside
  // `.fortune-toobar-combo-container`, itself inside this container, so every
  // open option is a `[role="button"]` descendant of the toolbar; without the
  // exclusion ArrowRight from the last option walked focus onto the next
  // toolbar button and left the dropdown open behind it. The other half of that
  // fix is the non-item guard in `useRovingFocus`.
  //
  // It does *not* exclude `aria-disabled` controls, unlike the hook's default.
  // Undo and redo are disabled whenever their stack is empty, they keep their
  // own tab stop (this pattern is additive, see above), and skipping them here
  // made Tab and the arrow keys disagree about which controls the toolbar
  // contains — the arrows jumping a button Tab stops on. Keeping a disabled
  // control focusable and reachable is what the ARIA toolbar pattern
  // recommends, precisely so its disabled state can be discovered rather than
  // the control vanishing from the sequence.
  useRovingFocus({
    containerRef,
    orientation: "horizontal",
    itemSelector: '[role="button"]:not(.fortune-toolbar-combo-popup *)',
  });
  const [toolbarWrapIndex, setToolbarWrapIndex] = useState(-1); // -1 means pending for item location calculation
  const [itemLocations, setItemLocations] = useState<number[]>([]);
  const { showDialog, hideDialog } = useDialog();
  const firstSelection = context.luckysheet_select_save?.[0];
  const flowdata = getFlowdata(context);
  contextRef.current = context;
  const row = firstSelection?.row_focus;

  const col = firstSelection?.column_focus;
  const cell =
    flowdata && row != null && col != null ? flowdata?.[row]?.[col] : undefined;
  const {
    info,
    toolbar,
    merge,
    border,
    freezen,
    defaultFmt,
    formula,
    sort,
    align,
    textWrap,
    rotation,
    screenshot,
    filter,
    splitText,
    findAndReplace,
    comment,
    fontarray,
    generalDialog,
  } = locale(context);
  const toolbarFormat = locale(context).format;
  const { announcement, announceAfterCommit, announceOutcome, announceNow } =
    useToolbarAnnouncements(contextRef);

  /**
   * How a toolbar action describes itself once it has landed. Evaluated
   * against the committed context, so a toggle reports the value it produced
   * rather than the one it was asked to produce; an action with nothing to say
   * returns "" and is not announced.
   */
  const toolbarActionPhrase = useCallback(
    (name: string, ctx: Context): string => {
      const target = anchorCell(ctx);
      switch (name) {
        case "bold":
          return target?.bl === 1 ? info.toolbarBoldOn : info.toolbarBoldOff;
        case "italic":
          return target?.it === 1
            ? info.toolbarItalicOn
            : info.toolbarItalicOff;
        case "underline":
          return target?.un === 1
            ? info.toolbarUnderlineOn
            : info.toolbarUnderlineOff;
        case "strike-through":
          return target?.cl === 1
            ? info.toolbarStrikethroughOn
            : info.toolbarStrikethroughOff;
        case "clear-format":
          return info.toolbarFormatCleared;
        case "format-painter":
          return ctx.luckysheetPaintModelOn
            ? info.toolbarFormatPainterOn
            : info.toolbarFormatPainterOff;
        case "number-increase":
          return info.toolbarDecimalIncreased;
        case "number-decrease":
          return info.toolbarDecimalDecreased;
        default:
          return "";
      }
    },
    [info]
  );
  const sheetWidth = context.luckysheetTableContentHW[0];
  const { currency } = settings;
  const defaultFormat = defaultFmt(currency);

  const [customColor, setcustomColor] = useState("#000000");
  const [customStyle, setcustomStyle] = useState("1");

  // rerenders the entire toolbar and trigger recalculation of item locations
  useEffect(() => {
    setToolbarWrapIndex(-1);
  }, [settings.toolbarItems, settings.customToolbarItems]);

  // recalculate item locations
  useEffect(() => {
    if (toolbarWrapIndex === -1) {
      const container = containerRef.current!;
      if (!container) return;
      const items = container.querySelectorAll(".fortune-toolbar-item");
      if (!items) return;
      const locations: number[] = [];
      const containerRect = container.getBoundingClientRect();
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i] as HTMLElement;
        const itemRect = item.getBoundingClientRect();
        locations.push(itemRect.left - containerRect.left + itemRect.width);
      }
      setItemLocations(locations);
    }
  }, [toolbarWrapIndex, sheetWidth]);

  // calculate the position after which items should be wrapped
  useEffect(() => {
    if (itemLocations.length === 0) return;
    const container = containerRef.current!;
    if (!container) return;
    const moreButtonWidth = 50;
    for (let i = itemLocations.length - 1; i >= 0; i -= 1) {
      const loc = itemLocations[i];
      if (loc + moreButtonWidth < container.clientWidth) {
        setToolbarWrapIndex(
          i - itemLocations.length + settings.toolbarItems.length
        );
        if (i === itemLocations.length - 1) {
          setMoreItems(null);
        }
        break;
      }
    }
  }, [itemLocations, setMoreItems, settings.toolbarItems.length, sheetWidth]);

  const getToolbarItem = useCallback(
    (name: string, i: number) => {
      // @ts-ignore
      const tooltip = toolbar[name];
      if (name === "|") {
        return <Divider key={i} />;
      }
      if (["font-color", "background"].includes(name)) {
        const pick = (color: string | undefined) => {
          // Applying a colour only repaints, so without this the action is
          // silent — the same gap the other toolbar announcements close. Named
          // from the palette where there is a name; a colour from the custom
          // picker falls back to its hex, as the swatches themselves do.
          //
          // Queued before the commit, like every other call site: the hook
          // snapshots the fingerprint synchronously, so it has to read the
          // state this action is about to change, not the state it produced.
          announceAfterCommit(() => {
            const colorNames = info.colorNames as
              | Record<string, string>
              | undefined;
            // Reset color arrives here as `undefined`. This used to return ""
            // for it, which made *clearing* a colour the one colour action
            // that said nothing, while the sheet tab beside it has announced
            // its removal since this branch added `sheetColorRemoved`.
            if (!color) {
              return name === "font-color"
                ? info.toolbarFontColorRemoved
                : info.toolbarBackgroundColorRemoved;
            }
            return replaceHtml(
              name === "font-color"
                ? info.toolbarFontColorSet
                : info.toolbarBackgroundColorSet,
              { color: colorNames?.[color] ?? color }
            );
          });
          setContext((draftCtx) =>
            (name === "font-color" ? handleTextColor : handleTextBackground)(
              draftCtx,
              refs.cellInput.current!,
              color as string
            )
          );
          if (name === "font-color") {
            refs.globalCache.recentTextColor = color;
          } else {
            refs.globalCache.recentBackgroundColor = color;
          }
        };
        return (
          <div style={{ position: "relative" }} key={name}>
            <div
              style={{
                width: 17,
                height: 2,
                backgroundColor:
                  name === "font-color"
                    ? refs.globalCache.recentTextColor
                    : refs.globalCache.recentBackgroundColor,
                position: "absolute",
                bottom: 8,
                left: 9,
                zIndex: 100,
              }}
            />
            <Combo
              iconId={name}
              tooltip={tooltip}
              // the popup is a grid of swatch buttons, not a menu
              hasPopup={false}
              // Applying "the most recent colour" is unavailable until one has
              // been picked through the popup, and this button's onClick is a
              // no-op in that state. Saying so beats looking live and silently
              // doing nothing. The arrow stays enabled — it is how the user
              // picks the first colour.
              disabled={
                !(name === "font-color"
                  ? refs.globalCache.recentTextColor
                  : refs.globalCache.recentBackgroundColor)
              }
              onClick={() => {
                const color =
                  name === "font-color"
                    ? refs.globalCache.recentTextColor
                    : refs.globalCache.recentBackgroundColor;
                if (color) pick(color);
              }}
            >
              {(setOpen) => (
                <CustomColor
                  // Read off the cell rather than from the popup's own draft:
                  // this is "which colour is applied", and picking one writes
                  // it to the selection immediately, so the mark follows a
                  // pick without the popup having to track it.
                  appliedColor={name === "font-color" ? cell?.fc : cell?.bg}
                  onCustomPick={(color) => {
                    pick(color);
                    setOpen(false);
                  }}
                  onColorPick={pick}
                />
              )}
            </Combo>
          </div>
        );
      }
      if (name === "format") {
        let currentFmt = defaultFormat[0].text;
        if (cell) {
          const curr = normalizedCellAttr(cell, "ct");
          const format = _.find(defaultFormat, (v) => v.value === curr?.fa);
          if (curr?.fa != null) {
            if (format != null) {
              currentFmt = format.text;
            } else {
              currentFmt = defaultFormat[defaultFormat.length - 1].text;
            }
          }
        }
        return (
          <Combo text={currentFmt} key={name} tooltip={tooltip}>
            {(setOpen) => (
              <Select>
                {defaultFormat.map(({ text, value, example }, ii) => {
                  if (value === "split") {
                    return <MenuDivider key={ii} />;
                  }
                  if (value === "fmtOtherSelf") {
                    return (
                      <MoreFormatOption
                        key={value}
                        text={text}
                        moreCurrencyText={toolbarFormat.moreCurrency}
                        moreNumberText={toolbarFormat.moreNumber}
                        onPickCurrency={() => {
                          showDialog(
                            <FormatSearch
                              onCancel={hideDialog}
                              type="currency"
                            />
                          );
                          setOpen(false);
                        }}
                        onPickNumber={() => {
                          showDialog(
                            <FormatSearch onCancel={hideDialog} type="number" />
                          );
                          setOpen(false);
                        }}
                      />
                    );
                  }
                  return (
                    <Option
                      key={value}
                      onClick={() => {
                        setOpen(false);
                        setContext((ctx) => {
                          const d = getFlowdata(ctx);
                          if (d == null) return;
                          updateFormat(
                            ctx,
                            refs.cellInput.current!,
                            d,
                            "ct",
                            value
                          );
                        });
                      }}
                    >
                      <div className="fortune-toolbar-menu-line">
                        <div>{text}</div>
                        <div className="fortune-toolbar-subtext">{example}</div>
                      </div>
                    </Option>
                  );
                })}
              </Select>
            )}
          </Combo>
        );
      }
      if (name === "font") {
        let current = fontarray[0];
        if (cell?.ff != null) {
          if (_.isNumber(cell.ff)) {
            current = fontarray[cell.ff];
          } else {
            current = cell.ff;
          }
        }
        return (
          <Combo text={current} key={name} tooltip={tooltip}>
            {(setOpen) => (
              <Select>
                {fontarray.map((o) => (
                  <Option
                    key={o}
                    onClick={() => {
                      setContext((ctx) => {
                        current = o;
                        const d = getFlowdata(ctx);
                        if (!d) return;
                        updateFormat(ctx, refs.cellInput.current!, d, "ff", o);
                      });
                      setOpen(false);
                    }}
                  >
                    {o}
                  </Option>
                ))}
              </Select>
            )}
          </Combo>
        );
      }
      if (name === "font-size") {
        return (
          <Combo
            text={
              cell
                ? normalizedCellAttr(cell, "fs", context.defaultFontSize)
                : context.defaultFontSize.toString()
            }
            key={name}
            tooltip={tooltip}
          >
            {(setOpen) => (
              <Select>
                {[
                  9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72,
                ].map((num) => (
                  <Option
                    key={num}
                    onClick={() => {
                      // A size picked from a list is a value, not a toggle, so
                      // it is confirmed by reading the size the anchor ended up
                      // with rather than by watching for a change: picking the
                      // size a cell already has is a request that succeeded and
                      // has to say so, while a sheet that refused the write —
                      // read-only, or a selection nothing was written to — has
                      // nothing to confirm and stays silent.
                      announceOutcome((ctx) => {
                        const target = anchorCell(ctx);
                        if (target == null) return "";
                        const applied = normalizedCellAttr(
                          target,
                          "fs",
                          ctx.defaultFontSize
                        );
                        return `${applied}` === `${num}`
                          ? replaceHtml(info.toolbarFontSizeSet, { size: num })
                          : "";
                      });
                      setContext((draftContext) =>
                        handleTextSize(
                          draftContext,
                          refs.cellInput.current!,
                          num,
                          refs.canvas.current!.getContext("2d")!
                        )
                      );
                      setOpen(false);
                    }}
                  >
                    {num}
                  </Option>
                ))}
              </Select>
            )}
          </Combo>
        );
      }
      if (name === "horizontal-align") {
        const items = [
          {
            title: "align-left",
            text: align.left,
            value: 1,
          },
          {
            title: "align-center",
            text: align.center,
            value: 0,
          },
          {
            title: "align-right",
            text: align.right,
            value: 2,
          },
        ];
        return (
          <Combo
            iconId={
              _.find(items, (item) => `${item.value}` === `${cell?.ht}`)
                ?.title || "align-left"
            }
            key={name}
            tooltip={toolbar.horizontalAlign}
          >
            {(setOpen) => (
              <Select>
                {items.map(({ text, title }) => (
                  <Option
                    key={title}
                    onClick={() => {
                      setContext((ctx) => {
                        handleHorizontalAlign(
                          ctx,
                          refs.cellInput.current!,
                          title.replace("align-", "")
                        );
                      });
                      setOpen(false);
                    }}
                  >
                    <div className="fortune-toolbar-menu-line">
                      {text}
                      <SVGIcon name={title} />
                    </div>
                  </Option>
                ))}
              </Select>
            )}
          </Combo>
        );
      }
      if (name === "vertical-align") {
        const items = [
          {
            title: "align-top",
            text: align.top,
            value: 1,
          },
          {
            title: "align-middle",
            text: align.middle,
            value: 0,
          },
          {
            title: "align-bottom",
            text: align.bottom,
            value: 2,
          },
        ];
        return (
          <Combo
            iconId={
              _.find(items, (item) => `${item.value}` === `${cell?.vt}`)
                ?.title || "align-top"
            }
            key={name}
            tooltip={toolbar.verticalAlign}
          >
            {(setOpen) => (
              <Select>
                {items.map(({ text, title }) => (
                  <Option
                    key={title}
                    onClick={() => {
                      setContext((ctx) => {
                        handleVerticalAlign(
                          ctx,
                          refs.cellInput.current!,
                          title.replace("align-", "")
                        );
                      });
                      setOpen(false);
                    }}
                  >
                    <div className="fortune-toolbar-menu-line">
                      {text}
                      <SVGIcon name={title} />
                    </div>
                  </Option>
                ))}
              </Select>
            )}
          </Combo>
        );
      }
      if (name === "keyboard-shortcuts") {
        return (
          <Button
            iconId={name}
            // The one shortcut the dialog cannot teach, since reaching the
            // dialog is what it is for. The glyphs stay out of the locale
            // files on purpose (see ShortcutKeys) so a translation can never
            // drift from the binding the code listens for.
            //
            // Keys in the name, not in the tooltip: they are already on the
            // button's face in the `<kbd>` below, and carrying them in the
            // tooltip as well printed them twice to anyone hovering. The name
            // still needs them — announcing the shortcut is the ticket — and
            // stays a superset of the visible label either way.
            tooltip={tooltip}
            ariaLabel={`${tooltip} (${shortcutKeysForPlatform(
              OPEN_SHORTCUTS_KEYS
            )})`}
            key={name}
            onClick={() =>
              setContext((draftCtx) => {
                draftCtx.showShortcutsDialog = true;
              })
            }
          >
            {/* On the button face, not only in the hover tooltip: a tooltip
                needs a pointer and a deliberate hover to appear at all, so a
                shortcut that only lives there is not discoverable by the
                people most likely to want it. Hidden from AT because the
                accessible name above already ends in the same keys, and the
                same <kbd> the dialog uses so the two read as one thing. */}
            <kbd className="fortune-toolbar-shortcut-hint" aria-hidden="true">
              {shortcutKeysForPlatform(OPEN_SHORTCUTS_KEYS)}
            </kbd>
          </Button>
        );
      }
      if (name === "undo") {
        return (
          <Button
            iconId={name}
            tooltip={tooltip}
            key={name}
            disabled={refs.globalCache.undoList.length === 0}
            onClick={() => {
              handleUndo();
              announceNow(info.toolbarUndone);
            }}
          />
        );
      }
      if (name === "redo") {
        return (
          <Button
            iconId={name}
            tooltip={tooltip}
            key={name}
            disabled={refs.globalCache.redoList.length === 0}
            onClick={() => {
              handleRedo();
              announceNow(info.toolbarRedone);
            }}
          />
        );
      }
      if (name === "screenshot") {
        return (
          <Button
            iconId={name}
            tooltip={tooltip}
            key={name}
            onClick={() => {
              const imgsrc = handleScreenShot(contextRef.current);
              if (imgsrc) {
                showDialog(
                  <div>
                    <div>{screenshot.screenshotTipSuccess}</div>
                    <img
                      src={imgsrc}
                      alt=""
                      style={{ maxWidth: "100%", maxHeight: "100%" }}
                    />
                  </div>
                );
              }
            }}
          />
        );
      }
      if (name === "splitColumn") {
        return (
          <Button
            iconId={name}
            tooltip={tooltip}
            key={name}
            onClick={() => {
              if (context.allowEdit === false) return;
              if (_.isUndefined(context.luckysheet_select_save)) {
                showDialog(splitText.tipNoSelect, "ok");
              } else {
                const currentColumn =
                  context.luckysheet_select_save[
                    context.luckysheet_select_save.length - 1
                  ].column;
                if (context.luckysheet_select_save.length > 1) {
                  showDialog(splitText.tipNoMulti, "ok");
                } else if (currentColumn[0] !== currentColumn[1]) {
                  showDialog(splitText.tipNoMultiColumn, "ok");
                } else {
                  showDialog(<SplitColumn />);
                }
              }
            }}
          />
        );
      }
      if (name === "dataVerification") {
        return (
          <Button
            iconId={name}
            tooltip={tooltip}
            key={name}
            onClick={() => {
              if (context.allowEdit === false) return;
              showDialog(<DataVerification />);
            }}
          />
        );
      }
      if (name === "locationCondition") {
        const items = [
          {
            text: findAndReplace.location,
            value: "location",
          },
          {
            text: findAndReplace.locationFormula,
            value: "locationFormula",
          },
          {
            text: findAndReplace.locationDate,
            value: "locationDate",
          },
          {
            text: findAndReplace.locationDigital,
            value: "locationDigital",
          },
          {
            text: findAndReplace.locationString,
            value: "locationString",
          },
          {
            text: findAndReplace.locationError,
            value: "locationError",
          },
          // TODO 条件格式
          // {
          //   text: findAndReplace.locationCondition,
          //   value: "locationCondition",
          // },
          {
            text: findAndReplace.locationRowSpan,
            value: "locationRowSpan",
          },
          {
            text: findAndReplace.columnSpan,
            value: "locationColumnSpan",
          },
        ];
        return (
          <Combo
            iconId="locationCondition"
            key={name}
            tooltip={findAndReplace.location}
          >
            {(setOpen) => (
              <Select>
                {items.map(({ text, value }) => (
                  <Option
                    key={value}
                    onClick={() => {
                      if (context.luckysheet_select_save == null) {
                        showDialog(freezen.noSeletionError, "ok");
                        return;
                      }
                      const last = context.luckysheet_select_save[0];
                      let range: { row: any[]; column: any[] }[];
                      let rangeArr = [];
                      if (
                        context.luckysheet_select_save?.length === 0 ||
                        (context.luckysheet_select_save?.length === 1 &&
                          last.row[0] === last.row[1] &&
                          last.column[0] === last.column[1])
                      ) {
                        // 当选中的是一个单元格，则变为全选
                        range = [
                          {
                            row: [0, flowdata!.length - 1],
                            column: [0, flowdata![0].length - 1],
                          },
                        ];
                      } else {
                        range = _.assignIn([], context.luckysheet_select_save);
                      }
                      if (value === "location") {
                        showDialog(<LocationCondition />);
                      } else if (value === "locationFormula") {
                        setContext((ctx) => {
                          rangeArr = applyLocation(
                            range,
                            "locationFormula",
                            "all",
                            ctx
                          );
                        });
                      } else if (value === "locationDate") {
                        setContext((ctx) => {
                          rangeArr = applyLocation(
                            range,
                            "locationConstant",
                            "d",
                            ctx
                          );
                        });
                      } else if (value === "locationDigital") {
                        setContext((ctx) => {
                          rangeArr = applyLocation(
                            range,
                            "locationConstant",
                            "n",
                            ctx
                          );
                        });
                      } else if (value === "locationString") {
                        setContext((ctx) => {
                          rangeArr = applyLocation(
                            range,
                            "locationConstant",
                            "s,g",
                            ctx
                          );
                        });
                      } else if (value === "locationError") {
                        setContext((ctx) => {
                          rangeArr = applyLocation(
                            range,
                            "locationConstant",
                            "e",
                            ctx
                          );
                        });
                      } else if (value === "locationCondition") {
                        setContext((ctx) => {
                          rangeArr = applyLocation(
                            range,
                            "locationCF",
                            undefined,
                            ctx
                          );
                        });
                      } else if (value === "locationRowSpan") {
                        if (
                          context.luckysheet_select_save?.length === 0 ||
                          (context.luckysheet_select_save?.length === 1 &&
                            context.luckysheet_select_save[0].row[0] ===
                              context.luckysheet_select_save[0].row[1])
                        ) {
                          showDialog(
                            findAndReplace.locationTiplessTwoRow,
                            "ok"
                          );
                          return;
                        }
                        range = _.assignIn([], context.luckysheet_select_save);
                        setContext((ctx) => {
                          rangeArr = applyLocation(
                            range,
                            "locationRowSpan",
                            undefined,
                            ctx
                          );
                        });
                      } else if (value === "locationColumnSpan") {
                        if (
                          context.luckysheet_select_save?.length === 0 ||
                          (context.luckysheet_select_save?.length === 1 &&
                            context.luckysheet_select_save[0].column[0] ===
                              context.luckysheet_select_save[0].column[1])
                        ) {
                          showDialog(
                            findAndReplace.locationTiplessTwoColumn,
                            "ok"
                          );
                          return;
                        }
                        range = _.assignIn([], context.luckysheet_select_save);
                        setContext((ctx) => {
                          rangeArr = applyLocation(
                            range,
                            "locationColumnSpan",
                            undefined,
                            ctx
                          );
                        });
                      }
                      if (rangeArr.length === 0 && value !== "location")
                        showDialog(findAndReplace.locationTipNotFindCell, "ok");
                      setOpen(false);
                    }}
                  >
                    <div className="fortune-toolbar-menu-line">{text}</div>
                  </Option>
                ))}
              </Select>
            )}
          </Combo>
        );
      }
      if (name === "conditionFormat") {
        const items = [
          "highlightCellRules",
          "itemSelectionRules",
          // "dataBar",
          // "colorGradation",
          // "icons",
          "-",
          // "newFormatRule",
          "deleteRule",
          // "manageRules",
        ];
        return (
          <Combo
            iconId="conditionFormat"
            key={name}
            tooltip={toolbar.conditionalFormat}
          >
            {(setOpen) => <ConditionalFormat items={items} setOpen={setOpen} />}
          </Combo>
        );
      }
      if (name === "image") {
        return (
          <Button
            iconId={name}
            tooltip={toolbar.insertImage}
            key={name}
            onClick={() => {
              if (context.allowEdit === false) return;
              showImgChooser();
            }}
          >
            <input
              id="fortune-img-upload"
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (!file) return;

                const render = new FileReader();
                render.readAsDataURL(file);
                render.onload = (event) => {
                  if (event.target == null) return;
                  const src = event.target?.result;
                  const image = new Image();
                  image.onload = () => {
                    setContext((draftCtx) => {
                      insertImage(draftCtx, image);
                    });
                  };
                  image.src = src as string;
                };
                e.currentTarget.value = "";
              }}
            />
          </Button>
        );
      }
      if (name === "comment") {
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
        let itemData: { key: any; text: any; onClick: any }[];
        if (flowdata?.[row_index]?.[col_index]?.ps != null) {
          itemData = [
            { key: "edit", text: comment.edit, onClick: editComment },
            { key: "delete", text: comment.delete, onClick: deleteComment },
            {
              key: "showOrHide",
              text: comment.showOne,
              onClick: showHideComment,
            },
            {
              key: "showOrHideAll",
              text: comment.showAll,
              onClick: showHideAllComments,
            },
          ];
        } else {
          itemData = [
            { key: "new", text: comment.insert, onClick: newComment },
            {
              key: "showOrHideAll",
              text: comment.showAll,
              onClick: showHideAllComments,
            },
          ];
        }
        return (
          <Combo iconId={name} key={name} tooltip={tooltip}>
            {(setOpen) => (
              <Select>
                {itemData.map(({ key, text, onClick }) => (
                  <Option
                    key={key}
                    onClick={() => {
                      setContext((draftContext) =>
                        onClick(
                          draftContext,
                          refs.globalCache,
                          row_index,
                          col_index
                        )
                      );
                      setOpen(false);
                    }}
                  >
                    {text}
                  </Option>
                ))}
              </Select>
            )}
          </Combo>
        );
      }

      if (name === "quick-formula") {
        const itemData = [
          { text: formula.sum, value: "SUM" },
          { text: formula.average, value: "AVERAGE" },
          { text: formula.count, value: "COUNT" },
          { text: formula.max, value: "MAX" },
          { text: formula.min, value: "MIN" },
        ];
        return (
          <Combo
            iconId="formula-sum"
            key={name}
            tooltip={toolbar.autoSum}
            onClick={() =>
              setContext((ctx) => {
                handleSum(
                  ctx,
                  refs.cellInput.current!,
                  refs.fxInput.current,
                  refs.globalCache!
                );
              })
            }
          >
            {(setOpen) => (
              <Select>
                {itemData.map(({ value, text }) => (
                  <Option
                    key={value}
                    onClick={() => {
                      setContext((ctx) => {
                        autoSelectionFormula(
                          ctx,
                          refs.cellInput.current!,
                          refs.fxInput.current,
                          value,
                          refs.globalCache
                        );
                      });
                      setOpen(false);
                    }}
                  >
                    <div className="fortune-toolbar-menu-line">
                      <div>{text}</div>
                      <div className="fortune-toolbar-subtext">{value}</div>
                    </div>
                  </Option>
                ))}
                <MenuDivider />
                <Option
                  key="formula"
                  onClick={() => {
                    showDialog(<FormulaSearch onCancel={hideDialog} />);
                    setOpen(false);
                  }}
                >{`${formula.find}...`}</Option>
              </Select>
            )}
          </Combo>
        );
      }
      if (name === "merge-cell") {
        const itemdata = [
          { text: merge.mergeAll, value: "merge-all" },
          { text: merge.mergeV, value: "merge-vertical" },
          { text: merge.mergeH, value: "merge-horizontal" },
          { text: merge.mergeCancel, value: "merge-cancel" },
        ];
        /**
         * Read off the committed anchor rather than from the row that was
         * pressed, because every one of these rows is a toggle: `mergeCells`
         * un-merges whenever the selection already holds a merged cell, so
         * "Merge all" on merged cells splits them. Naming the request said
         * "Cells merged." while the sheet had just unmerged them — a false
         * report of the one thing the region exists to convey. `mc` on the
         * anchor is the state the action actually produced, and it is set on
         * every cell of a merge and removed from every cell of a split, so the
         * anchor answers for the selection whichever row was used.
         */
        const mergePhrase = (ctx: Context) =>
          anchorCell(ctx)?.mc != null
            ? info.toolbarCellsMerged
            : info.toolbarCellsUnmerged;
        /**
         * The refusals have to be spoken, not merely not-lied-about. A sheet
         * mounts with one cell selected and `mergeCells` skips any range that
         * is a single cell, so the most likely press of this button did
         * nothing whatsoever — no repaint, no message — and read as a dead
         * control to mouse and keyboard alike. `handleMerge` now says which
         * ending it reached; only the ones the user can act on get words.
         */
        const mergeAndAnnounce = (type: string) => {
          /*
           * Recording the recipe's own answer, which is not the side effect the
           * rule against side effects in a producer is about. `setContext` takes
           * an immer recipe and React may run it more than once, so a recipe
           * must not do anything the outside world can observe twice — show a
           * dialog, move focus, post a request. This assigns the value the
           * recipe just computed to a box owned by this one call, so a replay
           * recomputes and reassigns the same answer and nothing downstream can
           * tell how many times it ran. `ContextMenu`'s sort takes the same
           * shape for the same reason.
           */
          const outcome = { result: "refused" as MergeOutcome };
          setContext((ctx) => {
            outcome.result = handleMerge(ctx, type);
          });
          announceOutcome((ctx) => {
            switch (outcome.result) {
              case "changed":
                return mergePhrase(ctx);
              // `handleMerge` answers "every range is one cell" before it
              // looks at which row was pressed, and the two rows want opposite
              // words for it: Merge wants "select more cells", while Unmerge on
              // one cell has nothing to split and is not a request for a bigger
              // selection. Telling an unmerge to select more cells *to merge*
              // names the wrong action entirely — and one cell is the sheet's
              // own mount state, so it is the likeliest press of either.
              case "singleCell":
                return type === "merge-cancel"
                  ? info.toolbarMergeNothingMerged
                  : info.toolbarMergeNeedsRange;
              // `isAllowEdit` fails on a read-only row, and this bails before
              // any of the merge logic — the ending reached by a selection
              // inside `config.rowReadOnly`, which nothing on screen marks.
              // The same string the right-click menu shows in a dialog.
              case "readOnly":
                return generalDialog.readOnlyError;
              // This locale's own wording for both, already translated
              // everywhere: they are the strings behind the two alerts
              // `handleMerge` has kept commented out.
              case "overlap":
                return merge.overlappingError;
              case "partMerge":
                return merge.partiallyError;
              case "nothingMerged":
                return info.toolbarMergeNothingMerged;
              default:
                return "";
            }
          });
        };
        return (
          <Combo
            iconId="merge-all"
            key={name}
            tooltip={tooltip}
            onClick={() => mergeAndAnnounce("merge-all")}
          >
            {(setOpen) => (
              <Select>
                {itemdata.map(({ text, value }) => (
                  <Option
                    key={value}
                    onClick={() => {
                      mergeAndAnnounce(value);
                      setOpen(false);
                    }}
                  >
                    <div className="fortune-toolbar-menu-line">
                      <SVGIcon name={value} style={{ marginRight: 4 }} />
                      {text}
                    </div>
                  </Option>
                ))}
              </Select>
            )}
          </Combo>
        );
      }
      if (name === "border") {
        const items = [
          {
            text: border.borderTop,
            value: "border-top",
          },
          {
            text: border.borderBottom,
            value: "border-bottom",
          },
          {
            text: border.borderLeft,
            value: "border-left",
          },
          {
            text: border.borderRight,
            value: "border-right",
          },
          { text: "", value: "divider" },
          {
            text: border.borderNone,
            value: "border-none",
          },
          {
            text: border.borderAll,
            value: "border-all",
          },
          {
            text: border.borderOutside,
            value: "border-outside",
          },
          { text: "", value: "divider" },
          {
            text: border.borderInside,
            value: "border-inside",
          },
          {
            text: border.borderHorizontal,
            value: "border-horizontal",
          },
          {
            text: border.borderVertical,
            value: "border-vertical",
          },
          {
            text: border.borderSlash,
            value: "border-slash",
          },
          { text: "", value: "divider" },
        ];
        // Applying a border was the one action in this popup with no feedback
        // at all: it writes to config.borderInfo rather than to a cell, so the
        // anchor fingerprint the other actions share cannot see it and the only
        // confirmation was the canvas repainting. Named from the row that was
        // activated, so what is spoken is the label that was read.
        const announceBorder = (value: string, text: string) =>
          announceAfterCommit(
            () =>
              value === "border-none"
                ? info.toolbarBorderCleared
                : replaceHtml(info.toolbarBorderSet, { border: text }),
            borderFingerprint
          );
        return (
          <Combo
            iconId="border-all"
            key={name}
            tooltip={tooltip}
            onClick={() => {
              announceBorder("border-all", border.borderAll);
              setContext((ctx) => {
                handleBorder(ctx, "border-all", customColor, customStyle);
              });
            }}
          >
            {(setOpen) => (
              <Select>
                {items.map(({ text, value }, ii) =>
                  value !== "divider" ? (
                    <Option
                      key={value}
                      onClick={() => {
                        announceBorder(value, text);
                        setContext((ctx) => {
                          handleBorder(ctx, value, customColor, customStyle);
                        });
                        setOpen(false);
                      }}
                    >
                      <div className="fortune-toolbar-menu-line">
                        {text}
                        <SVGIcon name={value} />
                      </div>
                    </Option>
                  ) : (
                    <MenuDivider key={ii} />
                  )
                )}
                <CustomBorder
                  onPick={(color, style) => {
                    setcustomColor(color as string);
                    setcustomStyle(style as string);
                  }}
                  // The third CustomColor popup in the toolbar, and the only
                  // one whose pick changes no cell: it stores the colour for
                  // the next handleBorder. Nothing repaints, so announceNow
                  // rather than announceAfterCommit — there is no committed
                  // effect to detect, and picking a colour always takes.
                  onColorPicked={(color) => {
                    const colorNames = info.colorNames as
                      | Record<string, string>
                      | undefined;
                    // Reset color reaches here as `undefined`, and `replaceHtml`
                    // returns the *unsubstituted* `${color}` when the value is
                    // missing — so this read out the literal
                    // "Border color: ${color}." The font and background path
                    // above needs the same guard for the same reason; the two
                    // are now written the same way.
                    announceNow(
                      color
                        ? replaceHtml(info.toolbarBorderColorSet, {
                            color: colorNames?.[color] ?? color,
                          })
                        : info.toolbarBorderColorRemoved
                    );
                  }}
                />
              </Select>
            )}
          </Combo>
        );
      }

      if (name === "freeze") {
        const items = [
          {
            text: freezen.freezenRowRange,
            value: "freeze-row",
          },
          {
            text: freezen.freezenColumnRange,
            value: "freeze-col",
          },
          {
            text: freezen.freezenRCRange,
            value: "freeze-row-col",
          },
          {
            text: freezen.freezenCancel,
            value: "freeze-cancel",
          },
        ];
        return (
          <Combo
            iconId="freeze-row-col"
            key={name}
            tooltip={tooltip}
            onClick={() =>
              setContext((ctx) => {
                handleFreeze(ctx, "freeze-row-col");
              })
            }
          >
            {(setOpen) => (
              <Select>
                {items.map(({ text, value }) => (
                  <Option
                    key={value}
                    onClick={() => {
                      setContext((ctx) => {
                        handleFreeze(ctx, value);
                      });
                      setOpen(false);
                    }}
                  >
                    <div className="fortune-toolbar-menu-line">
                      {text}
                      <SVGIcon name={value} />
                    </div>
                  </Option>
                ))}
              </Select>
            )}
          </Combo>
        );
      }
      if (name === "text-wrap") {
        const items = [
          {
            text: textWrap.clip,
            iconId: "text-clip",
            value: "clip",
          },
          {
            text: textWrap.overflow,
            iconId: "text-overflow",
            value: "overflow",
          },
          {
            text: textWrap.wrap,
            iconId: "text-wrap",
            value: "wrap",
          },
        ];
        let curr = items[0];
        if (cell?.tb != null) {
          curr = _.get(items, cell.tb);
        }
        return (
          <Combo iconId={curr.iconId} key={name} tooltip={toolbar.textWrap}>
            {(setOpen) => (
              <Select>
                {items.map(({ text, iconId, value }) => (
                  <Option
                    key={value}
                    onClick={() => {
                      // The chosen mode's own label, rather than reading `tb`
                      // back off the cell: the label is already localised and
                      // is exactly what the user picked.
                      announceAfterCommit(() =>
                        replaceHtml(info.toolbarTextWrapSet, { mode: text })
                      );
                      setContext((ctx) => {
                        const d = getFlowdata(ctx);
                        if (d == null) return;
                        updateFormat(
                          ctx,
                          refs.cellInput.current!,
                          d,
                          "tb",
                          value
                        );
                      });
                      setOpen(false);
                    }}
                  >
                    <div className="fortune-toolbar-menu-line">
                      {text}
                      <SVGIcon name={iconId} />
                    </div>
                  </Option>
                ))}
              </Select>
            )}
          </Combo>
        );
      }
      if (name === "text-rotation") {
        const items = [
          { text: rotation.none, iconId: "text-rotation-none", value: "none" },
          {
            text: rotation.angleup,
            iconId: "text-rotation-angleup",
            value: "angleup",
          },
          {
            text: rotation.angledown,
            iconId: "text-rotation-angledown",
            value: "angledown",
          },
          {
            text: rotation.vertical,
            iconId: "text-rotation-vertical",
            value: "vertical",
          },
          {
            text: rotation.rotationUp,
            iconId: "text-rotation-up",
            value: "rotation-up",
          },
          {
            text: rotation.rotationDown,
            iconId: "text-rotation-down",
            value: "rotation-down",
          },
        ];
        let curr = items[0];
        if (cell?.tr != null) {
          curr = _.get(items, cell.tr);
        }
        return (
          <Combo iconId={curr.iconId} key={name} tooltip={toolbar.textRotate}>
            {(setOpen) => (
              <Select>
                {items.map(({ text, iconId, value }) => (
                  <Option
                    key={value}
                    onClick={() => {
                      setContext((ctx) => {
                        const d = getFlowdata(ctx);
                        if (d == null) return;
                        updateFormat(
                          ctx,
                          refs.cellInput.current!,
                          d,
                          "tr",
                          value
                        );
                      });
                      setOpen(false);
                    }}
                  >
                    <div className="fortune-toolbar-menu-line">
                      {text}
                      <SVGIcon name={iconId} />
                    </div>
                  </Option>
                ))}
              </Select>
            )}
          </Combo>
        );
      }
      if (name === "filter") {
        /**
         * Sorting the selection reorders rows behind a popup that is closing,
         * so the canvas repaint was the only feedback it ever gave. Unlike the
         * other actions here it cannot be confirmed by watching state: it has
         * five silent refusals (read-only, no selection, a multi-range
         * selection, a column with nothing in it, a merged cell) and, when it
         * does run, sorting an already-sorted range is a success that changes
         * nothing — so a change-gated announcement would be wrong in both
         * directions. `sortSelection` reports whether it sorted instead, and
         * that answer is read a task later, once the commit has landed.
         *
         * The phrase is the funnel menu's, deliberately: two controls, one
         * concept, and a user who meets both should not have to learn that
         * they are different.
         *
         * **And a refusal is spoken, from the reason `sortSelection` gives.**
         * This announced success and stayed silent otherwise, on the reasoning
         * that the toolbar has no surface for a reason — but the surface is the
         * region this work added, and without it the funnel menu was the one of
         * three sort call sites that declines without a word: the right-click
         * menu alerts (`ContextMenu/index.tsx`) and the Sort dialog alerts
         * (`CustomSort/index.tsx`), both from this same `sortRefusalMessage`.
         * Announced rather than alerted because that is this control's
         * established channel, and because a dialog raised from a toolbar press
         * would take focus off the toolbar as well.
         */
        const sortAndAnnounce = (asc: boolean) => {
          const outcome = {
            result: { sorted: false, reason: "noSelection" } as SortOutcome,
          };
          setContext((ctx) => {
            outcome.result = handleSort(ctx, asc);
          });
          announceOutcome((ctx) => {
            if (outcome.result.sorted) {
              return asc
                ? filter.filterSortAscAnnouncement
                : filter.filterSortDescAnnouncement;
            }
            return sortRefusalMessage(ctx, outcome.result.reason);
          });
        };
        const items = [
          {
            iconId: "sort-asc",
            value: "sort-asc",
            text: sort.asc,
            onClick: () => sortAndAnnounce(true),
          },
          {
            iconId: "sort-desc",
            value: "sort-desc",
            text: sort.desc,
            onClick: () => sortAndAnnounce(false),
          },
          // { iconId: "sort", value: "sort", text: sort.custom },
          { iconId: "", value: "divider" },
          {
            iconId: "filter1",
            value: "filter",
            text: filter.filter,
            onClick: () => {
              const filterBefore = contextRef.current.luckysheet_filter_save;
              announceAfterCommit(() => info.toolbarFilterOn);
              setContext((draftCtx) => {
                createFilter(draftCtx);
              });
              // Focus belongs on the cell the filter was just built around, not
              // left on the toolbar control that opened this menu (WCAG 2.4.3):
              // the new dropdowns are in the grid, and the grid's keyboard
              // handling only runs while the cell input holds focus.
              // Skipped when the command declined to act, so a filter that did
              // not change does not relocate focus either. contextRef, not
              // `context`: this callback runs after the commit has landed.
              focusAfterCommit(() =>
                filterUnchanged(contextRef.current, filterBefore)
                  ? null
                  : refs.cellInput.current
              );
            },
          },
          {
            iconId: "eraser",
            value: "eraser",
            text: filter.clearFilter,
            onClick: () => {
              const filterBefore = contextRef.current.luckysheet_filter_save;
              announceAfterCommit(() => info.toolbarFilterOff);
              setContext((draftCtx) => {
                clearFilter(draftCtx);
              });
              focusAfterCommit(() =>
                filterUnchanged(contextRef.current, filterBefore)
                  ? null
                  : refs.cellInput.current
              );
            },
          },
        ];
        return (
          <Combo iconId="filter" key={name} tooltip={toolbar.sortAndFilter}>
            {(setOpen) => (
              <Select>
                {items.map(({ text, iconId, value, onClick }, index) =>
                  value !== "divider" ? (
                    <Option
                      key={value}
                      onClick={() => {
                        onClick?.();
                        setOpen(false);
                      }}
                    >
                      <div className="fortune-toolbar-menu-line">
                        {text}
                        <SVGIcon name={iconId} />
                      </div>
                    </Option>
                  ) : (
                    <MenuDivider key={`divider-${index}`} />
                  )
                )}
              </Select>
            )}
          </Combo>
        );
      }
      return (
        <Button
          iconId={name}
          tooltip={tooltip}
          key={name}
          selected={toolbarItemSelectedFunc(name)?.(cell)}
          onClick={() => {
            // Queued before the commit so the hook can snapshot the state this
            // action is about to change; it reports the result afterwards, and
            // says nothing for the items with no phrase of their own.
            // Clear format reaches every cell of the selection rather than the
            // anchor, so it brings its own snapshot.
            announceAfterCommit(
              (ctx) => toolbarActionPhrase(name, ctx),
              name === "clear-format" ? clearFormatFingerprint : undefined
            );
            setContext((draftCtx) => {
              toolbarItemClickHandler(name)?.(
                draftCtx,
                refs.cellInput.current!,
                refs.globalCache
              );
            });
          }}
        />
      );
    },
    [
      toolbar,
      info,
      announceAfterCommit,
      announceOutcome,
      announceNow,
      toolbarActionPhrase,
      cell,
      setContext,
      refs.cellInput,
      refs.fxInput,
      refs.globalCache,
      defaultFormat,
      align,
      handleUndo,
      handleRedo,
      flowdata,
      formula,
      showDialog,
      hideDialog,
      merge,
      generalDialog,
      border,
      freezen,
      screenshot,
      sort,
      textWrap,
      rotation,
      filter,
      splitText,
      findAndReplace,
      context.luckysheet_select_save,
      context.defaultFontSize,
      context.allowEdit,
      comment,
      fontarray,
      refs.canvas,
      customColor,
      customStyle,
      toolbarFormat.moreCurrency,
      toolbarFormat.moreNumber,
    ]
  );

  return (
    <header>
      <div
        ref={containerRef}
        className="fortune-toolbar"
        role="toolbar"
        aria-label={toolbar.toolbar}
      >
        {settings.customToolbarItems.map((n) => {
          return (
            <CustomButton
              tooltip={n.tooltip}
              onClick={n.onClick}
              key={n.key}
              icon={n.icon}
              iconName={n.iconName}
            >
              {n.children}
            </CustomButton>
          );
        })}
        {settings.customToolbarItems?.length > 0 ? (
          <Divider key="customDivider" />
        ) : null}
        {(toolbarWrapIndex === -1
          ? settings.toolbarItems
          : settings.toolbarItems.slice(0, toolbarWrapIndex + 1)
        ).map((name, i) => getToolbarItem(name, i))}
        {toolbarWrapIndex !== -1 &&
        toolbarWrapIndex < settings.toolbarItems.length - 1 ? (
          <Button
            iconId="more"
            tooltip={toolbar.toolMore}
            // The disclosure pairing this trigger never had. `controls` is also
            // what lets the More popup's `closeOnFocusOut` recognise this
            // button as its own trigger rather than as somewhere outside it.
            expanded={moreItemsOpen}
            controls={moreItemsOpen ? MORE_ITEMS_ID : undefined}
            onMouseDown={() => {
              if (moreItemsOpen) {
                setMoreItems(null);
              } else {
                setMoreItems(
                  settings.toolbarItems
                    .slice(toolbarWrapIndex + 1)
                    .map((name, i) => getToolbarItem(name, i))
                );
              }
            }}
          />
        ) : null}
      </div>
      {/* Confirmation for the toolbar actions whose only other feedback is the
          canvas repainting.

          Assertive, for the same reason the filter menu's region is: activating
          a toolbar button leaves VoiceOver in the middle of its "You are
          currently on a button..." hint, and a polite update is dropped rather
          than queued while other speech is in progress — so a polite region
          here is correct in the DOM, green in jest, and never spoken. The hint
          is boilerplate; the result of the press is not.

          No explicit `aria-atomic`: `role="alert"` already implies
          `aria-atomic="true"`, so spelling it out added nothing and made this
          the odd one out among the sibling regions. */}
      <div id="sr-toolbar" className="sr-only" role="alert">
        {announcement}
      </div>
    </header>
  );
};

export default Toolbar;
