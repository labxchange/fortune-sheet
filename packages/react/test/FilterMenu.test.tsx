import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import _ from "lodash";
import {
  getFilterColumnValues,
  getFilterColumnColors,
  locale,
} from "@fortune-sheet/core";

import FilterMenu from "../src/components/ContextMenu/FilterMenu";
import WorkbookContext from "../src/context";

jest.mock("@fortune-sheet/core", () => ({
  ...jest.requireActual("@fortune-sheet/core"),
  getFilterColumnValues: jest.fn(),
  getFilterColumnColors: jest.fn(),
}));

const { filter } = locale({ lang: "en" } as any);

const CHECK_ALL = filter.filterValueByAllBtn;
const CLEAR = filter.filterValueByClearBtn;
const INVERSE = filter.filterValueByInverseBtn;

const makeValues = (n: number) =>
  _.range(n).map((i) => ({
    key: `v${i}`,
    value: `v${i}`,
    text: `v${i}`,
    mask: `v${i}`,
    rows: [i],
  }));

/**
 * Mirrors the year > month > day tree getFilterColumnValues actually builds
 * (core/src/modules/filter.ts): every node renders its own checkbox, but only
 * the day leaves become dateRowMap keys.
 */
const makeDates = (isoDates: string[]) => {
  const dates: any[] = [];
  isoDates.forEach((dateStr, i) => {
    const [y, m, d] = dateStr.split("-");
    const row = 100 + i;

    let year = _.find(dates, (v) => v.value === y);
    if (year == null) {
      year = {
        key: y,
        type: "year",
        value: y,
        text: y + filter.filiterYearText,
        children: [],
        rows: [],
        dateValues: [],
      };
      dates.push(year);
    }

    let month = _.find(year.children, (v: any) => v.value === m);
    if (month == null) {
      month = {
        key: `${y}-${m}`,
        type: "month",
        value: m,
        text: m + filter.filiterMonthText,
        children: [],
        rows: [],
        dateValues: [],
      };
      year.children.push(month);
    }

    month.children.push({
      key: dateStr,
      type: "day",
      value: d,
      text: d,
      children: [],
      rows: [row],
      dateValues: [dateStr],
    });

    [year, month].forEach((node: any) => {
      node.rows.push(row);
      node.dateValues.push(dateStr);
    });
  });
  return dates;
};

type Options = {
  valueCount?: number;
  valuesUncheck?: string[];
  dates?: string[];
  datesUncheck?: string[];
  col?: number;
};

function renderFilterMenu({
  valueCount = 6,
  valuesUncheck = [],
  dates = [],
  datesUncheck = [],
  col = 0,
}: Options = {}) {
  const values = makeValues(valueCount);
  const valueRowMap: any = {};
  values.forEach((v) => {
    valueRowMap[v.key] = v.rows;
  });
  // Keyed by day only, exactly as the real builder does.
  const dateRowMap: any = {};
  dates.forEach((d, i) => {
    dateRowMap[d] = [100 + i];
  });

  (getFilterColumnValues as any).mockReturnValue({
    values,
    valueRowMap,
    valuesUncheck,
    dates: makeDates(dates),
    dateRowMap,
    datesUncheck,
    visibleRows: _.range(valueCount + dates.length),
    flattenValues: values.map((v) => v.text).concat(dates),
  });
  (getFilterColumnColors as any).mockReturnValue({
    bgColors: [],
    fcColors: [],
  });

  const openMenu = (column: number) => ({
    x: 0,
    y: 0,
    col: column,
    startRow: 0,
    endRow: valueCount + dates.length,
    startCol: 0,
    endCol: 0,
    listBoxMaxHeight: 400,
  });

  const settings: any = {
    filterContextMenu: ["filter-by-value"],
  };
  const refs: any = {
    workbookContainer: { current: null },
  };

  const tree = (filterContextMenu: any) => (
    <WorkbookContext.Provider
      value={
        {
          context: { lang: "en", filterContextMenu },
          setContext: () => {},
          settings,
          refs,
          handleUndo: () => {},
          handleRedo: () => {},
        } as any
      }
    >
      <FilterMenu />
    </WorkbookContext.Provider>
  );

  const view = render(tree(openMenu(col)));

  const regions = () =>
    Array.from(view.container.querySelectorAll('[role="alert"]'));

  return {
    ...view,
    regions,
    /** Exactly what the live region says right now, punctuation included. */
    announcement: () => regions()[0]?.textContent ?? "",
    checkboxes: () =>
      Array.from(
        view.container.querySelectorAll<HTMLInputElement>(".filter-checkbox")
      ),
    labels: () =>
      Array.from(
        view.container.querySelectorAll<HTMLInputElement>(".filter-checkbox")
      ).map((cb) => cb.getAttribute("aria-label")),
    checkedKeys: () =>
      Array.from(
        view.container.querySelectorAll<HTMLInputElement>(".filter-checkbox")
      )
        .filter((cb) => cb.checked)
        .map((cb) => cb.getAttribute("aria-label")),
    press: (name: string) =>
      fireEvent.click(screen.getByRole("button", { name })),
    close: () => view.rerender(tree(undefined)),
    reopen: (column = col) => view.rerender(tree(openMenu(column))),
  };
}

/**
 * What a screen reader actually reads out: a sentence-final period is a pause,
 * so it carries no words. Two announcements with the same `spoken` value sound
 * identical to the user even though their DOM text differs.
 */
const spoken = (text: string) => text.replace(/\.$/, "");

describe("FilterMenu bulk action announcements", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("announces nothing until a bulk action is used", () => {
    const { regions, announcement } = renderFilterMenu();

    expect(regions()).toHaveLength(1);
    expect(announcement()).toBe("");
  });

  it("announces and applies Check all", () => {
    const { press, announcement, checkboxes } = renderFilterMenu({
      valuesUncheck: ["v0", "v1", "v2"],
    });

    press(CHECK_ALL);

    expect(announcement()).toBe(filter.filterValueByAllAnnouncement);
    expect(checkboxes().every((cb) => cb.checked)).toBe(true);
  });

  it("announces and applies Clear", () => {
    const { press, announcement, checkboxes } = renderFilterMenu();

    press(CLEAR);

    expect(announcement()).toBe(filter.filterValueByClearAnnouncement);
    expect(checkboxes().every((cb) => !cb.checked)).toBe(true);
  });

  it("announces Inverse with the resulting count and flips the checkboxes", () => {
    const { press, announcement, checkedKeys } = renderFilterMenu({
      valueCount: 6,
      valuesUncheck: ["v0", "v1", "v2", "v3"],
    });

    press(INVERSE);

    expect(announcement()).toBe(
      "Filter selections inverted. 4 of 6 options now selected."
    );
    expect(checkedKeys()).toEqual(["v0", "v1", "v2", "v3"]);
  });

  it("renders a singular count naturally", () => {
    const { press, announcement } = renderFilterMenu({
      valueCount: 6,
      valuesUncheck: ["v0"],
    });

    press(INVERSE);

    expect(announcement()).toBe(
      "Filter selections inverted. 1 of 6 options now selected."
    );
  });

  it("omits the count when the column has no options", () => {
    const { press, announcement } = renderFilterMenu({ valueCount: 0 });

    press(INVERSE);

    expect(announcement()).toBe(filter.filterValueByInverseAnnouncement);
  });

  it("never announces an unsubstituted placeholder", () => {
    const { press, announcement } = renderFilterMenu();

    press(INVERSE);

    expect(announcement()).not.toContain("${");
  });

  it("counts dates and values together", () => {
    const { press, announcement } = renderFilterMenu({
      valueCount: 2,
      dates: ["2024-01-01", "2024-01-02", "2024-01-03"],
    });

    press(INVERSE);

    // 2 values + 3 dates, all checked -> inverting selects none of the 5.
    expect(announcement()).toBe(
      "Filter selections inverted. 0 of 5 options now selected."
    );
  });

  it("counts day leaves, not the year and month rows of the date tree", () => {
    const { press, announcement, labels } = renderFilterMenu({
      valueCount: 0,
      dates: ["2024-01-01", "2024-01-02", "2024-02-01"],
    });

    // Six checkboxes are on screen: one year, two months, three days.
    expect(labels()).toEqual([
      "2024Year",
      "01Month",
      "01",
      "02",
      "02Month",
      "01",
    ]);

    press(INVERSE);

    // Only the three days are selectable options; year and month are group
    // rows whose state is derived from the days beneath them.
    expect(announcement()).toBe(
      "Filter selections inverted. 0 of 3 options now selected."
    );
  });

  it("counts every option in the column, not just the ones a search leaves visible", async () => {
    const view = renderFilterMenu({ valueCount: 6 });

    fireEvent.change(screen.getByPlaceholderText(filter.filterValueByTip), {
      target: { value: "v0" },
    });
    await waitFor(() => expect(view.checkboxes()).toHaveLength(1));

    view.press(INVERSE);

    expect(view.announcement()).toBe(
      "Filter selections inverted. 0 of 6 options now selected."
    );
  });

  it("announces from a single assertive region", () => {
    const { press, regions, container } = renderFilterMenu();

    press(CHECK_ALL);

    // One region only. Two alternating regions each repeat themselves every
    // other action, and VoiceOver does not re-announce a region that already
    // said those words.
    expect(regions()).toHaveLength(1);
    expect(regions()[0].getAttribute("aria-atomic")).toBe("true");
    // Assertive, because polite is dropped rather than queued while the focus
    // hint is still speaking.
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(0);
  });

  it("changes the region text on an immediate repeat of the same action", () => {
    const { press, announcement } = renderFilterMenu();

    press(CLEAR);
    const first = announcement();
    press(CLEAR);
    const second = announcement();

    // The words are the same action, so they must not be byte-identical, or the
    // region would not change and nothing would be announced.
    expect(second).not.toBe(first);
    expect(spoken(second)).toBe(spoken(first));
  });

  it("changes the region text on every repeat, not just the first", () => {
    const { press, announcement } = renderFilterMenu();

    const texts = [CLEAR, CLEAR, CLEAR, CLEAR].map((action) => {
      press(action);
      return announcement();
    });

    // Every consecutive pair differs, so every press is a real region change.
    texts.slice(1).forEach((text, i) => expect(text).not.toBe(texts[i]));
    texts.forEach((text) => expect(spoken(text)).toBe(spoken(texts[0])));
  });

  it("re-announces the sequence Sami reported: Check all, Clear, Check all", () => {
    const { press, announcement } = renderFilterMenu();

    press(CHECK_ALL);
    const firstCheckAll = announcement();
    press(CLEAR);
    const cleared = announcement();
    press(CHECK_ALL);
    const secondCheckAll = announcement();

    // Each step must differ from what the region said immediately before it.
    expect(cleared).not.toBe(firstCheckAll);
    expect(secondCheckAll).not.toBe(cleared);
    expect(spoken(secondCheckAll)).toBe(spoken(firstCheckAll));
  });

  it("re-announces an evenly split Inverse, whose message repeats verbatim", () => {
    const { press, announcement, checkedKeys } = renderFilterMenu({
      valueCount: 8,
      valuesUncheck: ["v0", "v1", "v2", "v3"],
    });

    press(INVERSE);
    const first = announcement();
    const firstChecked = checkedKeys();

    press(INVERSE);
    const second = announcement();

    // An even split inverts to the same counts, so the words repeat.
    expect(spoken(second)).toBe(spoken(first));
    expect(second).not.toBe(first);
    // ...and the selection really did change.
    expect(checkedKeys()).not.toEqual(firstChecked);
  });

  it("re-announces a repeat separated by a manual checkbox change", () => {
    const { press, announcement, checkboxes } = renderFilterMenu();

    press(CHECK_ALL);
    const first = announcement();

    fireEvent.click(checkboxes()[0]);
    press(CHECK_ALL);
    const second = announcement();

    expect(spoken(second)).toBe(spoken(first));
    expect(second).not.toBe(first);
    expect(checkboxes().every((cb) => cb.checked)).toBe(true);
  });

  it("keeps the message as authored when the action actually changes", () => {
    const { press, announcement } = renderFilterMenu();

    press(CHECK_ALL);
    expect(announcement()).toBe(filter.filterValueByAllAnnouncement);
    press(CLEAR);
    expect(announcement()).toBe(filter.filterValueByClearAnnouncement);
  });

  it("keeps the live region outside the collapsible section", () => {
    const { press, regions, container } = renderFilterMenu();

    press(CHECK_ALL);
    fireEvent.click(
      screen.getByRole("button", { name: filter.filterByValues })
    );

    const collapsible = container.querySelector<HTMLElement>(
      ".luckysheet-filter-byvalue"
    );
    expect(collapsible?.style.display).toBe("none");
    expect(regions()).toHaveLength(1);
    regions().forEach((r) => expect(collapsible?.contains(r)).toBe(false));
  });

  it("does not carry an announcement over into the next time the popup opens", () => {
    const { press, announcement, regions, close, reopen } = renderFilterMenu();

    press(CLEAR);
    expect(announcement()).toBe(filter.filterValueByClearAnnouncement);

    // Closing only makes the component return null; it stays mounted, so
    // without the close-transition reset the old text would come back with it.
    close();
    expect(regions()).toHaveLength(0);

    reopen(3);
    expect(regions()).toHaveLength(1);
    expect(announcement()).toBe("");
  });

  it("starts silent when the same column is reopened", () => {
    const { press, announcement, close, reopen } = renderFilterMenu();

    press(CLEAR);
    close();
    reopen();

    expect(announcement()).toBe("");
  });

  it("does not resurrect the message when switching columns without closing", () => {
    const { press, announcement, reopen } = renderFilterMenu();

    // Clicking another column's filter arrow swaps filterContextMenu straight
    // from one column to the next: the arrow stops mousedown from reaching
    // document, so useOutsideClick never closes the popup in between.
    press(CLEAR);
    reopen(1);
    expect(announcement()).toBe("");

    reopen(0);
    expect(announcement()).toBe("");
  });

  it("still announces normally after a close and reopen", () => {
    const { press, announcement, close, reopen } = renderFilterMenu();

    press(CLEAR);
    close();
    reopen();
    press(CLEAR);

    expect(announcement()).toBe(filter.filterValueByClearAnnouncement);
  });

  it("applies each transform to dates, values and hidden rows alike", () => {
    const { press, checkedKeys } = renderFilterMenu({
      valueCount: 4,
      valuesUncheck: ["v1"],
      dates: ["2024-01-01", "2024-01-02"],
      datesUncheck: ["2024-01-01"],
    });

    // Dates render their own checkboxes ahead of the value list, so seeing
    // them here is the point: one transform reached both domains.
    const everything = [
      "2024Year",
      "01Month",
      "01",
      "02",
      "v0",
      "v1",
      "v2",
      "v3",
    ];

    press(CHECK_ALL);
    expect(checkedKeys()).toEqual(everything);

    press(CLEAR);
    expect(checkedKeys()).toEqual([]);

    press(INVERSE);
    expect(checkedKeys()).toEqual(everything);
  });
});
