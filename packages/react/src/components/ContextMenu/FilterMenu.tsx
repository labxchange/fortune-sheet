import {
  clearFilter,
  locale,
  getFilterColumnValues,
  getFilterColumnColors,
  orderbydatafiler,
  saveFilter,
  replaceHtml,
  FilterValue,
  FilterDate,
  FilterColor,
  Context,
} from "@fortune-sheet/core";
import React, {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import _ from "lodash";
import produce from "immer";
import WorkbookContext from "../../context";
import Divider from "./Divider";
import Menu from "./Menu";
import SVGIcon from "../SVGIcon";
import { useAlert } from "../../hooks/useAlert";
import { useOutsideClick } from "../../hooks/useOutsideClick";
import { useEscapeToClose } from "../../hooks/useEscapeToClose";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import { markAsRepeat } from "../../utils/liveRegion";
import { focusAfterCommit, onActivate } from "../../utils/keyboardActivation";
import { announce } from "../../hooks/useContextMenuAnnouncements";
import { FILTER_MENU_ID, findFilterFunnel } from "../../utils/filterDom";

/**
 * The Filter-by-colour submenu, so the row that opens it can point at it with
 * `aria-controls`. Only one filter menu is ever on screen (it is gated on
 * `filterContextMenu`), so a module constant cannot collide with itself.
 */
const BY_COLOR_SUBMENU_ID = "fortune-filter-bycolor-submenu";

type BulkActionName = "selectAll" | "clearAll" | "inverse";

// Every bulk action is one set transform over "unchecked" keys. The same
// transform is applied to unchecked dates, unchecked values and hidden rows,
// so an action cannot update one of those domains and forget another.
const BULK_ACTION_TRANSFORMS: Record<
  BulkActionName,
  <T>(current: T[], universe: T[]) => T[]
> = {
  selectAll: () => [],
  clearAll: (_current, universe) => universe,
  inverse: (current, universe) => _.xor(current, universe),
};

const SelectItem: React.FC<{
  item: FilterValue;
  isChecked: (key: string) => boolean;
  onChange: (item: FilterValue, checked: boolean) => void;
  isItemVisible: (item: FilterValue) => boolean;
}> = ({ item, isChecked, onChange, isItemVisible }) => {
  const checked = useMemo(() => isChecked(item.key), [isChecked, item.key]);
  return isItemVisible(item) ? (
    <div className="select-item">
      <input
        className="filter-checkbox"
        type="checkbox"
        checked={checked}
        aria-label={item.text}
        onChange={() => {
          onChange(item, !checked);
        }}
      />
      <div>{item.text}</div>
      <span className="count">{`( ${item.rows.length} )`}</span>
    </div>
  ) : null;
};

const DateSelectTreeItem: React.FC<{
  item: FilterDate;
  depth?: number;
  initialExpand: (key: string) => boolean;
  onExpand?: (key: string, expand: boolean) => void;
  isChecked: (key: string) => boolean;
  onChange: (data: FilterDate, checked: boolean) => void;
  isItemVisible: (item: FilterDate) => boolean;
}> = ({
  item,
  depth = 0,
  initialExpand,
  onExpand,
  isChecked,
  onChange,
  isItemVisible,
}) => {
  const [expand, setExpand] = useState(initialExpand(item.key));
  const checked = useMemo(() => isChecked(item.key), [isChecked, item.key]);

  return isItemVisible(item) ? (
    <div>
      <div
        className="select-item"
        style={{ marginLeft: -2 + depth * 20 }}
        onClick={() => {
          onExpand?.(item.key, !expand);
          setExpand(!expand);
        }}
      >
        {/* The row holds two separate controls — a disclosure and a filter
            checkbox — so it deliberately carries no role of its own: `button`
            on the row would compute its name from the whole subtree and
            announce the label twice. The caret is the disclosure; the row
            keeps its onClick so mouse behaviour is unchanged. */}
        {_.isEmpty(item.children) ? (
          <div style={{ width: 10 }} />
        ) : (
          <button
            type="button"
            className="filter-caret-btn"
            aria-expanded={expand}
            aria-label={item.text}
            onClick={(e) => {
              e.stopPropagation();
              onExpand?.(item.key, !expand);
              setExpand(!expand);
            }}
          >
            <span className={`filter-caret ${expand ? "down" : "right"}`} />
          </button>
        )}
        <input
          className="filter-checkbox"
          type="checkbox"
          checked={checked}
          aria-label={item.text}
          onChange={() => {
            onChange(item, !checked);
          }}
          onClick={(e) => e.stopPropagation()}
          tabIndex={0}
        />
        <div>{item.text}</div>
        <span className="count">{`( ${item.rows.length} )`}</span>
      </div>
      {expand &&
        item.children.map((v) => (
          <DateSelectTreeItem
            key={v.key}
            item={v}
            depth={depth + 1}
            {...{
              initialExpand,
              onExpand,
              isChecked,
              onChange,
              isItemVisible,
            }}
          />
        ))}
    </div>
  ) : null;
};

const DateSelectTree: React.FC<{
  dates: FilterDate[];
  initialExpand: (key: string) => boolean;
  onExpand?: (key: string, expand: boolean) => void;
  isChecked: (key: string) => boolean;
  onChange: (item: FilterDate, checked: boolean) => void;
  isItemVisible: (item: FilterDate) => boolean;
}> = ({
  dates,
  initialExpand,
  onExpand,
  isChecked,
  onChange,
  isItemVisible,
}) => {
  return (
    <>
      {dates.map((v) => (
        <DateSelectTreeItem
          key={v.key}
          item={v}
          {...{
            initialExpand,
            onExpand,
            isChecked,
            onChange,
            isItemVisible,
          }}
        />
      ))}
    </>
  );
};

const FilterMenu: React.FC = () => {
  const { context, setContext, settings, refs } = useContext(WorkbookContext);
  const containerRef = useRef<HTMLDivElement>(null);
  const contextRef = useRef<Context>(context);
  const byColorMenuRef = useRef<HTMLDivElement>(null);
  const subMenuRef = useRef<HTMLDivElement>(null);
  const { filterContextMenu } = context;
  const { startRow, startCol, endRow, endCol, col, listBoxMaxHeight } =
    filterContextMenu || {
      startRow: null,
      startCol: null,
      endRow: null,
      endCol: null,
      col: null,
      listBoxMaxHeight: 400,
    };
  const { filter } = locale(context);
  const [data, setData] = useState<{
    dates: FilterDate[];
    dateRowMap: Record<string, number[]>;
    values: FilterValue[];
    valueRowMap: Record<string, number[]>;
    visibleRows: number[];
    flattenValues: string[];
  }>({
    dates: [],
    dateRowMap: {},
    values: [],
    valueRowMap: {},
    visibleRows: [],
    flattenValues: [],
  });
  const [datesUncheck, setDatesUncheck] = useState<string[]>([]);
  const [valuesUncheck, setValuesUncheck] = useState<string[]>([]);
  const dateTreeExpandState = useRef<Record<string, boolean>>({});
  const hiddenRows = useRef<number[]>([]);
  const [showValues, setShowValues] = useState<string[]>([]);
  const [showByValueList, setShowByValueList] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [subMenuPos, setSubMenuPos] = useState<{
    left?: number;
    top: number;
    right?: number;
  }>();
  const [filterColors, setFilterColors] = useState<{
    bgColors: FilterColor[];
    fcColors: FilterColor[];
  }>({ bgColors: [], fcColors: [] });
  const [showSubMenu, setShowSubMenu] = useState(false);
  // Announcement text, plus the column it describes so that switching columns
  // without closing the popup does not leave the previous column's message
  // behind.
  const [announcement, setAnnouncement] = useState<{
    text: string;
    col: number | null;
  }>({ text: "", col: null });
  const { showAlert } = useAlert();
  const mouseHoverSubMenu = useRef<boolean>(false);
  /**
   * Whether the colour submenu's current open came from Enter/Space rather than
   * the pointer. Set by `openColorSubMenu` on every open, and read once when the
   * submenu's Escape layer mounts, to decide whether focus follows.
   */
  const keyboardOpenRef = useRef<boolean>(false);
  contextRef.current = context;

  // 点击其他区域的时候关闭FilterMenu
  const close = useCallback(() => {
    setContext((ctx) => {
      ctx.filterContextMenu = undefined;
    });
  }, [setContext]);

  /**
   * Where focus goes when one of the footer buttons closes this popup. The
   * funnel this popup belongs to is the control the user activated, so it is
   * the place to come back to — but a criterion change rebuilds the funnels and
   * `clearFilter` removes them outright, and useEscapeToClose skips its restore
   * for exactly that case (a detached element), dropping focus to <body>.
   * Resolved after the commit, so the funnel is the one that now exists.
   */
  const restoreFocusToFunnel = useCallback(() => {
    focusAfterCommit(
      () =>
        findFilterFunnel(refs.workbookContainer.current, col) ??
        refs.cellInput.current
    );
  }, [refs.workbookContainer, refs.cellInput, col]);

  /** For actions that leave no funnel behind: back to the active cell. */
  const restoreFocusToGrid = useCallback(() => {
    focusAfterCommit(() => refs.cellInput.current);
  }, [refs.cellInput]);

  useOutsideClick(containerRef, close, [close]);
  useEscapeToClose({
    open: filterContextMenu != null,
    onClose: close,
    containerRef,
  });
  /**
   * The colour submenu's own Escape layer, and what puts focus into it on open
   * (WCAG 2.1.1) — activating "Filter by color" used to leave focus on the
   * trigger, so a keyboard user could see the options and not reach them.
   *
   * A second `useEscapeToClose` rather than inline focus handling: it focuses the
   * first item *after* the submenu mounts (it does not exist in the DOM when the
   * open handler runs), the shared instance stack makes this the innermost
   * Escape layer so only the submenu closes, and it restores focus to the
   * trigger. `autoFocus` is gated on a keyboard open — pulling focus out from
   * under the pointer would fight a mouse user.
   */
  useEscapeToClose({
    open: showSubMenu,
    onClose: () => setShowSubMenu(false),
    containerRef: subMenuRef,
    autoFocus: keyboardOpenRef.current,
    // The default selector wants role="button"/tabindex="0"; the colour rows are
    // role="checkbox" and the footer controls are real <button>s. Document order
    // picks the first colour row, or the footer button when there is none.
    autoFocusSelector: '[role="checkbox"], button',
  });
  useRovingFocus({
    containerRef,
    orientation: "vertical",
    enabled: filterContextMenu != null,
  });

  const initialExpand = useCallback((key: string) => {
    const expand = dateTreeExpandState.current[key];
    if (expand == null) {
      dateTreeExpandState.current[key] = true;
      return true;
    }
    return expand;
  }, []);

  const onExpand = useCallback((key: string, expand: boolean) => {
    dateTreeExpandState.current[key] = expand;
  }, []);

  const searchValues = useMemo(
    () =>
      _.debounce((text: string) => {
        setShowValues(
          _.filter(
            data.flattenValues,
            (v) => v.toLowerCase().indexOf(text.toLowerCase()) > -1
          )
        );
      }, 300),
    [data.flattenValues]
  );

  const bulkActionMessage = useCallback(
    (action: BulkActionName, selected: number, total: number) => {
      if (action === "selectAll") return filter.filterValueByAllAnnouncement;
      if (action === "clearAll") return filter.filterValueByClearAnnouncement;
      const inverted = filter.filterValueByInverseAnnouncement;
      // Nothing to count when the column has no options at all.
      if (total === 0) return inverted;
      const count = replaceHtml(filter.filterValueBySelectedCountAnnouncement, {
        selected,
        total,
      });
      return `${inverted} ${count}`;
    },
    [filter]
  );

  const applyBulkAction = useCallback(
    (action: BulkActionName) => {
      const transform = BULK_ACTION_TRANSFORMS[action];
      const dateKeys = _.keys(data.dateRowMap);
      const valueKeys = _.keys(data.valueRowMap);

      // Computed up front so the announcement describes the state this action
      // produces; reading the state variables back would yield the previous
      // render's values.
      const nextDatesUncheck = transform(datesUncheck, dateKeys);
      const nextValuesUncheck = transform(valuesUncheck, valueKeys);
      hiddenRows.current = transform(hiddenRows.current, data.visibleRows);

      setDatesUncheck(nextDatesUncheck);
      setValuesUncheck(nextValuesUncheck);

      // Counts selectable options, not rendered rows. dateRowMap is keyed by
      // day, so the year and month rows of the date tree are excluded: they are
      // group nodes whose state is derived from their days, not options a user
      // can independently select.
      const total = dateKeys.length + valueKeys.length;
      const unchecked = nextDatesUncheck.length + nextValuesUncheck.length;
      const selected = Math.min(Math.max(total - unchecked, 0), total);

      setAnnouncement((prev) => {
        const message = bulkActionMessage(action, selected, total);
        // A region that already says exactly this would not change, and an
        // unchanged region is not spoken — so mark the write as a repeat.
        // Checked against what the region currently holds rather than counting
        // presses, so the common case keeps the message as authored.
        const repeatsWhatTheRegionSays =
          prev.col === col && prev.text === message;
        return {
          text: repeatsWhatTheRegionSays ? markAsRepeat(message) : message,
          col,
        };
      });
    },
    [
      bulkActionMessage,
      col,
      data.dateRowMap,
      data.valueRowMap,
      data.visibleRows,
      datesUncheck,
      valuesUncheck,
    ]
  );

  const onColorSelectChange = useCallback(
    (key: string, color: string, checked: boolean) => {
      setFilterColors(
        produce((draft) => {
          const colorData = _.find(_.get(draft, key), (v) => v.color === color);
          colorData.checked = checked;
        })
      );
    },
    []
  );

  const delayHideSubMenu = useMemo(
    () =>
      _.debounce(() => {
        if (mouseHoverSubMenu.current) return;
        setShowSubMenu(false);
      }, 200),
    []
  );

  const sortData = useCallback(
    (asc: boolean) => {
      if (col == null) return;
      setContext((draftCtx) => {
        const errMsg = orderbydatafiler(
          draftCtx,
          startRow,
          startCol,
          endRow,
          endCol,
          col,
          asc
        );
        if (errMsg != null) {
          showAlert(errMsg);
          return;
        }
        // Sorting from this menu was silent: it closes the menu and moves focus
        // to the grid, so the only thing spoken was the cell reference — never
        // that a sort happened (WCAG 4.1.3). Success only, so a refused sort
        // stays quiet. Reuses the cell menu's own sort results.
        announce(
          draftCtx,
          asc ? "rightclick.announceSortedAsc" : "rightclick.announceSortedDesc"
        );
      });
    },
    [col, setContext, startRow, startCol, endRow, endCol, showAlert]
  );

  const renderColorList = useCallback(
    (
      key: string,
      title: string,
      colors: FilterColor[],
      onSelectChange: (datakey: string, color: string, checked: boolean) => void
    ) =>
      colors.length > 1 ? (
        <div key={key}>
          <div className="title">{title}</div>
          <div className="color-list">
            {colors.map((v) => (
              <div
                key={v.color}
                className="item"
                aria-label={`${title}, ${v.color}`}
                onClick={() => onSelectChange(key, v.color, !v.checked)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" ||
                    e.key === " " ||
                    e.key === "Spacebar"
                  ) {
                    e.preventDefault();
                    onSelectChange(key, v.color, !v.checked);
                  }
                }}
                role="checkbox"
                aria-checked={v.checked}
                tabIndex={0}
              >
                <div
                  className="color-label"
                  style={{ backgroundColor: v.color }}
                />
                {/* Purely visual: the row above is the real checkbox. This
                    input has a no-op onChange and is a controlled component,
                    so as a focusable control it could never be toggled by
                    keyboard. Hidden from AT and removed from the tab order so
                    it isn't a dead stop. */}
                <input
                  className="luckysheet-mousedown-cancel"
                  type="checkbox"
                  checked={v.checked}
                  onChange={() => {}}
                  tabIndex={-1}
                  aria-hidden="true"
                />
              </div>
            ))}
          </div>
        </div>
      ) : null,
    []
  );

  useLayoutEffect(() => {
    // re-position the filterContextMenu if it overflows the window
    if (!containerRef.current || !filterContextMenu) {
      return;
    }
    const winH = window.innerHeight;
    const winW = window.innerWidth;
    const rect = containerRef.current.getBoundingClientRect();
    const workbookRect =
      refs.workbookContainer.current?.getBoundingClientRect();
    if (!workbookRect) {
      return;
    }
    const menuW = rect.width;
    // menu最小高度
    const menuH = 350;
    let top = filterContextMenu.y;
    let left = filterContextMenu.x;

    let hasOverflow = false;
    if (workbookRect.left + left + menuW > winW) {
      left -= menuW;
      hasOverflow = true;
    }
    if (workbookRect.top + top + menuH > winH) {
      top -= menuH;
      hasOverflow = true;
    }
    if (top < 0) {
      top = 0;
      hasOverflow = true;
    }
    // 适配小屏
    let containerH = winH - rect.top - 350;
    if (containerH < 0) {
      containerH = 100;
    }
    // 防止Maximum update depth exceeded错误，如果当前值和前一个filterContextMenu值一样则不进行赋值
    if (
      filterContextMenu.x === left &&
      filterContextMenu.y === top &&
      filterContextMenu.listBoxMaxHeight === containerH
    ) {
      return;
    }
    setContext((draftCtx) => {
      if (hasOverflow) {
        _.set(draftCtx, "filterContextMenu.x", left);
        _.set(draftCtx, "filterContextMenu.y", top);
      }
      _.set(draftCtx, "filterContextMenu.listBoxMaxHeight", containerH);
    });
  }, [filterContextMenu, refs.workbookContainer, setContext]);

  useLayoutEffect(() => {
    if (!subMenuPos) return;
    // re-position the subMenu if it overflows the window
    const rect = byColorMenuRef.current?.getBoundingClientRect();
    const subMenuRect = subMenuRef.current?.getBoundingClientRect();
    if (rect == null || subMenuRect == null) return;

    const winW = window.innerWidth;
    const pos = _.cloneDeep(subMenuPos);
    if (subMenuRect.left + subMenuRect.width > winW) {
      pos.left! -= subMenuRect.width;
      setSubMenuPos(pos);
    }
  }, [subMenuPos]);

  useEffect(() => {
    if (col == null) return;
    setSearchText("");
    setShowSubMenu(false);
    dateTreeExpandState.current = {};
    hiddenRows.current = filterContextMenu?.hiddenRows || [];
    const res = getFilterColumnValues(
      contextRef.current,
      col,
      startRow,
      endRow,
      startCol
    );
    setData(_.omit(res, ["datesUncheck", "valuesUncheck"]));
    setDatesUncheck(res.datesUncheck);
    setValuesUncheck(res.valuesUncheck);
    setShowValues(res.flattenValues);
  }, [
    col,
    endRow,
    startRow,
    startCol,
    hiddenRows,
    filterContextMenu?.hiddenRows,
  ]);

  useEffect(() => {
    if (col == null) return;
    setFilterColors(
      getFilterColumnColors(contextRef.current, col, startRow, endRow)
    );
  }, [col, endRow, startRow]);

  const isOpen = filterContextMenu != null;
  useEffect(() => {
    // Closing only makes this component render null; it stays mounted, so the
    // text has to be dropped explicitly or it comes back with the next visit to
    // the same column and the first action there would be a no-op change.
    // Keyed on `col` too: clicking another column's filter arrow swaps
    // filterContextMenu straight from one column to another without ever
    // closing, so `isOpen` alone never sees that transition and the render
    // guard would put the old text back on returning to the first column.
    // Neither dependency changes while a bulk action runs, so this cannot wipe
    // a fresh announcement.
    setAnnouncement({ text: "", col: null });
  }, [isOpen, col]);

  if (filterContextMenu == null) return null;

  return (
    <>
      {/* One live region for every bulk action; repeats stay audible because
          the message text itself always changes (see flipTrailingPeriod).
          aria-atomic keeps the whole message together rather than announcing
          only the words that differ.

          Assertive, because activating one of these buttons puts VoiceOver in
          the middle of its "You are currently on a button..." hint, and a
          polite update is dropped rather than queued while other speech is in
          progress. The hint is boilerplate; the result of the press is not.

          Kept outside the collapsible "filter by values" container, which is
          display:none when collapsed and would remove the region from the
          accessibility tree. */}
      <div className="sr-only" role="alert" aria-atomic="true">
        {announcement.col === col ? announcement.text : ""}
      </div>
      <div
        className="fortune-context-menu luckysheet-cols-menu fortune-filter-menu"
        id={FILTER_MENU_ID}
        ref={containerRef}
        style={{ left: filterContextMenu.x, top: filterContextMenu.y }}
      >
        {settings.filterContextMenu?.map((name, i) => {
          if (name === "|") {
            return <Divider key={`divider-${i}`} />;
          }
          if (name === "sort-by-asc") {
            return (
              <Menu key={name} role="button" onClick={() => sortData(true)}>
                {filter.sortByAsc}
              </Menu>
            );
          }
          if (name === "sort-by-desc") {
            return (
              <Menu key={name} role="button" onClick={() => sortData(false)}>
                {filter.sortByDesc}
              </Menu>
            );
          }
          if (name === "filter-by-color") {
            // `fromKeyboard` is recorded on every open, not only the keyboard
            // one: leaving a stale `true` behind meant a later hover-open pulled
            // focus into the submenu under the pointer.
            const openColorSubMenu = (fromKeyboard = false) => {
              if (!containerRef.current || !filterContextMenu) {
                return;
              }
              keyboardOpenRef.current = fromKeyboard;
              setShowSubMenu(true);
              const rect = byColorMenuRef.current?.getBoundingClientRect();
              if (rect == null) return;
              setSubMenuPos({ top: rect.top - 5, left: rect.right });
            };
            return (
              // The Escape handler that used to sit here is gone: it was a
              // bubble-phase handler, and useEscapeToClose listens on `document`
              // in the capture phase, so the filter menu's own instance always
              // saw the key first and closed the whole popup.
              <div
                key={name}
                ref={byColorMenuRef}
                onMouseEnter={() => openColorSubMenu()}
                onMouseLeave={delayHideSubMenu}
              >
                <Menu
                  role="button"
                  expanded={showSubMenu}
                  controls={BY_COLOR_SUBMENU_ID}
                  // Enter/Space rather than a forwarded click, so the open can be
                  // marked keyboard-initiated — that is what decides whether
                  // focus follows. `onActivate` keeps the same
                  // target === currentTarget and repeat guards as the default.
                  onKeyDown={onActivate(() => openColorSubMenu(true))}
                  onClick={() => openColorSubMenu()}
                >
                  <div className="filter-bycolor-container">
                    {filter.filterByColor}
                    <div className="filter-caret right" />
                  </div>
                </Menu>
              </div>
            );
          }
          if (name === "filter-by-condition") {
            return (
              <div key="name">
                <Menu onClick={() => {}}>
                  <div className="filter-caret right" />
                  {filter.filterByCondition}
                </Menu>
                <div
                  className="luckysheet-\${menuid}-bycondition"
                  style={{ display: "none" }}
                >
                  <div
                    className="luckysheet-flat-menu-button luckysheet-mousedown-cancel"
                    id="luckysheet-\${menuid}-selected"
                  >
                    <span
                      className="luckysheet-mousedown-cancel"
                      data-value="null"
                      data-type="0"
                    >
                      {filter.filiterInputNone}
                    </span>
                    <div className="luckysheet-mousedown-cancel">
                      <i className="fa fa-sort" aria-hidden="true" />
                    </div>
                  </div>
                  {/* <div className="luckysheet-\${menuid}-selected-input">
          <input
            type="text"
            placeholder="${filter.filiterInputTip}"
            className="luckysheet-mousedown-cancel"
          />
        </div>
        <div className="luckysheet-\${menuid}-selected-input luckysheet-\${menuid}-selected-input2">
          <span>{filter.filiterRangeStart}</span>
          <input
            type="text"
            placeholder="${filter.filiterRangeStartTip}"
            className="luckysheet-mousedown-cancel"
          />
          <span>{filter.filiterRangeEnd}</span>
          <input
            type="text"
            placeholder="${filter.filiterRangeEndTip}"
            className="luckysheet-mousedown-cancel"
          />
        </div> */}
                </div>
              </div>
            );
          }
          if (name === "filter-by-value") {
            return (
              <div key={name}>
                <Menu
                  role="button"
                  expanded={showByValueList}
                  onClick={() => setShowByValueList((v) => !v)}
                >
                  <div
                    className={`filter-caret ${
                      showByValueList ? "down" : "right"
                    }`}
                  />
                  {filter.filterByValues}
                </Menu>
                <div
                  className="luckysheet-filter-byvalue"
                  style={{ display: showByValueList ? undefined : "none" }}
                >
                  <div className="fortune-menuitem-row byvalue-btn-row">
                    <div>
                      <button
                        type="button"
                        className="fortune-byvalue-btn"
                        onClick={() => applyBulkAction("selectAll")}
                      >
                        {filter.filterValueByAllBtn}
                      </button>
                      {" - "}
                      <button
                        type="button"
                        className="fortune-byvalue-btn"
                        onClick={() => applyBulkAction("clearAll")}
                      >
                        {filter.filterValueByClearBtn}
                      </button>
                      {" - "}
                      <button
                        type="button"
                        className="fortune-byvalue-btn"
                        onClick={() => applyBulkAction("inverse")}
                      >
                        {filter.filterValueByInverseBtn}
                      </button>
                    </div>
                    <div className="byvalue-filter-icon">
                      <SVGIcon
                        name="filter-fill"
                        style={{ width: 20, height: 20 }}
                      />
                    </div>
                  </div>
                  <div className="filtermenu-input-container">
                    <input
                      type="text"
                      onKeyDown={(e) => e.stopPropagation()}
                      aria-label={filter.filterByValues}
                      placeholder={filter.filterValueByTip}
                      className="luckysheet-mousedown-cancel"
                      id="luckysheet-\${menuid}-byvalue-input"
                      value={searchText}
                      onChange={(e) => {
                        setSearchText(e.target.value);
                        searchValues(e.target.value);
                      }}
                    />
                  </div>
                  <div
                    id="luckysheet-filter-byvalue-select"
                    style={{ maxHeight: listBoxMaxHeight }}
                  >
                    <DateSelectTree
                      dates={data.dates}
                      onExpand={onExpand}
                      initialExpand={initialExpand}
                      isChecked={(key: string) =>
                        _.find(
                          datesUncheck,
                          (v: string) => v.match(key) != null
                        ) == null
                      }
                      onChange={(item: FilterDate, checked: boolean) => {
                        const rows = hiddenRows.current;
                        hiddenRows.current = checked
                          ? _.without(rows, ...item.rows)
                          : _.union(rows, item.rows);
                        setDatesUncheck(
                          produce((draft) => {
                            return checked
                              ? _.without(draft, ...item.dateValues)
                              : _.union(draft, item.dateValues);
                          })
                        );
                      }}
                      isItemVisible={(item) => {
                        return showValues.length === data.flattenValues.length
                          ? true
                          : _.findIndex(
                              showValues,
                              (v) => v.match(item.key) != null
                            ) > -1;
                      }}
                    />
                    {data.values.map((v) => (
                      <SelectItem
                        key={v.key}
                        item={v}
                        isChecked={(key: string) =>
                          !_.includes(valuesUncheck, key)
                        }
                        onChange={(item: FilterValue, checked: boolean) => {
                          const rows = hiddenRows.current;
                          hiddenRows.current = checked
                            ? _.without(rows, ...item.rows)
                            : _.concat(rows, item.rows);
                          setValuesUncheck(
                            produce((draft) => {
                              if (checked) {
                                _.pull(draft, item.key);
                              } else {
                                draft.push(item.key);
                              }
                            })
                          );
                        }}
                        isItemVisible={(item) => {
                          return showValues.length === data.flattenValues.length
                            ? true
                            : _.includes(showValues, item.text);
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            );
          }
          return null;
        })}
        <Divider />
        <div className="fortune-menuitem-row">
          <button
            type="button"
            className="button-basic button-primary"
            onClick={() => {
              if (col == null) return;
              setContext((draftCtx) => {
                const rowHidden = _.reduce(
                  hiddenRows.current,
                  (pre, curr) => {
                    pre[curr] = 0;
                    return pre;
                  },
                  {} as Record<string, number>
                );
                saveFilter(
                  draftCtx,
                  hiddenRows.current.length > 0,
                  rowHidden,
                  {},
                  startRow,
                  endRow,
                  col,
                  startCol,
                  endCol
                );
                hiddenRows.current = [];
                // Applying closes this menu and takes its own announcement
                // region with it, so the result goes to the persistent one.
                announce(draftCtx, "filter.announceFilterApplied");
                draftCtx.filterContextMenu = undefined;
              });
              restoreFocusToFunnel();
            }}
          >
            {filter.filterConform}
          </button>
          <button
            type="button"
            className="button-basic button-default"
            onClick={() => {
              setContext((draftCtx) => {
                draftCtx.filterContextMenu = undefined;
              });
              restoreFocusToFunnel();
            }}
          >
            {filter.filterCancel}
          </button>
          <button
            type="button"
            className="button-basic button-danger"
            onClick={() => {
              setContext((draftCtx) => {
                clearFilter(draftCtx);
                announce(draftCtx, "rightclick.announceFilterRemoved");
              });
              restoreFocusToGrid();
            }}
          >
            {filter.clearFilter}
          </button>
        </div>
      </div>
      {showSubMenu && (
        // role="group", not "menu": the colour rows are role="checkbox" (colour
        // filtering is multi-select), and role="menu" requires menuitem*
        // children — it would trade this ticket's 2.1.1 failure for an
        // aria-required-children one. A named group is what this is, and
        // aria-expanded + aria-controls on the trigger is the canonical
        // disclosure pattern. aria-haspopup is omitted for the same reason:
        // "true" is defined as equivalent to "menu".
        <div
          ref={subMenuRef}
          id={BY_COLOR_SUBMENU_ID}
          role="group"
          aria-label={filter.filterByColor}
          className="luckysheet-filter-bycolor-submenu"
          style={subMenuPos}
          onMouseEnter={() => {
            mouseHoverSubMenu.current = true;
          }}
          onMouseLeave={() => {
            mouseHoverSubMenu.current = false;
            setShowSubMenu(false);
          }}
        >
          {filterColors.bgColors.length < 2 &&
          filterColors.fcColors.length < 2 ? (
            <div className="one-color-tip">
              {filter.filterContainerOneColorTip}
            </div>
          ) : (
            <>
              {[
                {
                  key: "bgColors",
                  title: filter.filiterByColorTip,
                  colors: filterColors.bgColors,
                },
                {
                  key: "fcColors",
                  title: filter.filiterByTextColorTip,
                  colors: filterColors.fcColors,
                },
              ].map((v) =>
                renderColorList(v.key, v.title, v.colors, onColorSelectChange)
              )}
              <button
                type="button"
                className="button-basic button-primary"
                onClick={() => {
                  if (col == null) return;
                  setContext((draftCtx) => {
                    const rowHidden = _.reduce(
                      _(filterColors)
                        .values()
                        .flatten()
                        .map((v) => (v.checked ? [] : v.rows))
                        .flatten()
                        .valueOf(),
                      (pre, curr) => {
                        pre[curr] = 0;
                        return pre;
                      },
                      {} as Record<string, number>
                    );
                    saveFilter(
                      draftCtx,
                      !_.isEmpty(rowHidden),
                      rowHidden,
                      {},
                      startRow,
                      endRow,
                      col,
                      startCol,
                      endCol
                    );
                    hiddenRows.current = [];
                    announce(draftCtx, "filter.announceFilteredByColor");
                    draftCtx.filterContextMenu = undefined;
                  });
                  restoreFocusToFunnel();
                }}
              >
                {filter.filterConform}
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
};

export default FilterMenu;
