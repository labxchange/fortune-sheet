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
  // Announcement text plus the region it currently occupies. Alternating the
  // region is what makes a repeated action audible: the message text may be
  // identical, but "" -> text in the receiving region is always a real
  // insertion, and removals are not announced.
  const [announcement, setAnnouncement] = useState<{
    text: string;
    slot: number;
    col: number | null;
  }>({ text: "", slot: 0, col: null });
  const { showAlert } = useAlert();
  const mouseHoverSubMenu = useRef<boolean>(false);
  contextRef.current = context;

  // 点击其他区域的时候关闭FilterMenu
  const close = useCallback(() => {
    setContext((ctx) => {
      ctx.filterContextMenu = undefined;
    });
  }, [setContext]);

  useOutsideClick(containerRef, close, [close]);

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

      setAnnouncement((prev) => ({
        text: bulkActionMessage(action, selected, total),
        slot: prev.slot === 0 ? 1 : 0,
        col,
      }));
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
        if (errMsg != null) showAlert(errMsg);
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

  if (filterContextMenu == null) return null;

  return (
    <>
      {/* Two alternating live regions rather than one. A repeated bulk action
          can produce identical text (inverting an even split, or re-applying
          Check all after a manual change), and identical text in a single
          region is not a DOM change, so it is never announced. Alternating
          makes the receiving region go "" -> text, a real insertion; the other
          goes text -> "", which is not announced.


          Kept outside the collapsible "filter by values" container, which is
          display:none when collapsed and would remove them from the
          accessibility tree. */}
      {[0, 1].map((slot) => (
        <div key={slot} className="sr-only" role="status">
          {announcement.slot === slot && announcement.col === col
            ? announcement.text
            : ""}
        </div>
      ))}
      <div
        className="fortune-context-menu luckysheet-cols-menu fortune-filter-menu"
        id="luckysheet-\${menuid}-menu"
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
            const openColorSubMenu = () => {
              if (!containerRef.current || !filterContextMenu) {
                return;
              }
              setShowSubMenu(true);
              const rect = byColorMenuRef.current?.getBoundingClientRect();
              if (rect == null) return;
              setSubMenuPos({ top: rect.top - 5, left: rect.right });
            };
            return (
              <div
                key={name}
                ref={byColorMenuRef}
                onMouseEnter={openColorSubMenu}
                onMouseLeave={delayHideSubMenu}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && showSubMenu) {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowSubMenu(false);
                  }
                }}
              >
                <Menu
                  role="button"
                  expanded={showSubMenu}
                  onClick={openColorSubMenu}
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
                draftCtx.filterContextMenu = undefined;
              });
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
              });
            }}
          >
            {filter.clearFilter}
          </button>
        </div>
      </div>
      {showSubMenu && (
        <div
          ref={subMenuRef}
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
                    draftCtx.filterContextMenu = undefined;
                  });
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
