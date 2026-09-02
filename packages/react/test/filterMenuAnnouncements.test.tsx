import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  getFilterColumnValues,
  getFilterColumnColors,
  orderbydatafiler,
  locale,
} from "@fortune-sheet/core";
import FilterMenu from "../src/components/ContextMenu/FilterMenu";
import WorkbookContext from "../src/context";
import { useContextMenuAnnouncements } from "../src/hooks/useContextMenuAnnouncements";

// `clearFilter` and `saveFilter` are stubbed along with the data getters: both
// walk real sheet data and would throw before `announce` is reached, failing
// these cases for a reason unrelated to the bug. Core's own behaviour is covered
// by packages/core/test/filter.test.ts.
jest.mock("@fortune-sheet/core", () => ({
  ...jest.requireActual("@fortune-sheet/core"),
  getFilterColumnValues: jest.fn(),
  getFilterColumnColors: jest.fn(),
  orderbydatafiler: jest.fn(),
  clearFilter: jest.fn(),
  saveFilter: jest.fn(),
}));

const { filter, rightclick } = locale({ lang: "en" } as any);

// Regression cases for a gap found in real-browser testing, not by the suite.
//
// Ticket 1217673938351666 was first read as the right-click cell menu only, but
// the audit uses "Context Menu" for the filter dropdown too — its sibling ticket
// 1217814380695653 is "Context Menu → Filter by Color", which exists only here.
// So sort, Confirm and Clear filter stayed silent.
//
// These actions cannot use this menu's own announcement region, which is why the
// gap was easy to miss: that region renders *inside* the menu and unmounts the
// moment an action closes it. They write to the persistent region in
// SheetOverlay instead, via `announce()`.

type Recorded = { key: string; params?: any; seq: number } | undefined;

function renderMenu(items: string[]) {
  (getFilterColumnValues as any).mockReturnValue({
    values: [],
    valueRowMap: {},
    valuesUncheck: [],
    dates: [],
    dateRowMap: {},
    datesUncheck: [],
    visibleRows: [0, 1, 2],
    flattenValues: [],
  });
  (getFilterColumnColors as any).mockReturnValue({
    bgColors: [],
    fcColors: [],
  });
  // null == success. The sort must stay silent when this reports an error.
  (orderbydatafiler as any).mockReturnValue(null);

  // The real context object the recipe mutates, so `announce` is observable.
  const ctx: any = {
    lang: "en",
    filterContextMenu: {
      x: 0,
      y: 0,
      col: 0,
      startRow: 0,
      endRow: 3,
      startCol: 0,
      endCol: 0,
      listBoxMaxHeight: 400,
    },
  };
  const setContext = (recipe: (c: any) => void) => recipe(ctx);

  render(
    <WorkbookContext.Provider
      value={
        {
          context: ctx,
          setContext,
          settings: { filterContextMenu: items },
          refs: {
            workbookContainer: { current: null },
            cellInput: { current: null },
          },
          handleUndo: () => {},
          handleRedo: () => {},
        } as any
      }
    >
      <FilterMenu />
    </WorkbookContext.Provider>
  );

  return { recorded: (): Recorded => ctx.contextMenuAnnouncement };
}

describe("filter dropdown announces its own actions", () => {
  it("announces a descending sort — the case from the recording", () => {
    const { recorded } = renderMenu(["sort-by-asc", "sort-by-desc"]);

    fireEvent.click(screen.getByText(filter.sortByDesc));

    expect(recorded()?.key).toBe("rightclick.announceSortedDesc");
  });

  it("announces an ascending sort", () => {
    const { recorded } = renderMenu(["sort-by-asc", "sort-by-desc"]);

    fireEvent.click(screen.getByText(filter.sortByAsc));

    expect(recorded()?.key).toBe("rightclick.announceSortedAsc");
  });

  it("stays silent when the sort is refused", () => {
    // orderbydatafiler returns a message for a selection it cannot sort, and
    // shows an alert. Announcing "sorted" there would be a lie, and the focus
    // move is gated on the same signal.
    const { recorded } = renderMenu(["sort-by-asc"]);
    (orderbydatafiler as any).mockReturnValue("cannot sort this");

    fireEvent.click(screen.getByText(filter.sortByAsc));

    expect(recorded()).toBeUndefined();
  });

  it("bumps seq so the same sort twice speaks twice", () => {
    const { recorded } = renderMenu(["sort-by-asc"]);

    fireEvent.click(screen.getByText(filter.sortByAsc));
    const first = recorded()!.seq;
    fireEvent.click(screen.getByText(filter.sortByAsc));

    expect(recorded()!.seq).toBe(first + 1);
  });

  it("announces clearing the filter", () => {
    const { recorded } = renderMenu(["filter-by-value"]);

    fireEvent.click(screen.getByText(filter.clearFilter));

    expect(recorded()?.key).toBe("rightclick.announceFilterRemoved");
  });

  it("owns the colour submenu in the accessibility tree while it is open", () => {
    // The submenu renders as a DOM sibling of the whole menu, because it cannot
    // live inside the role="button" trigger (presentational children would strip
    // its rows). That left it unreachable with VoiceOver's cursor, which walks
    // document order: VO+Arrow from the trigger stepped through the rest of the
    // menu first. `aria-owns` on the trigger's roleless wrapper reparents it.
    renderMenu(["filter-by-color"]);

    const wrapper = screen
      .getByText(filter.filterByColor)
      .closest(".luckysheet-cols-menuitem")!.parentElement!;
    // Closed: no dangling reference, which axe reports as an invalid value.
    expect(wrapper.getAttribute("aria-owns")).toBeNull();

    fireEvent.click(screen.getByText(filter.filterByColor));

    const owns = wrapper.getAttribute("aria-owns");
    expect(owns).toBe("fortune-filter-bycolor-submenu");
    // And it must resolve, or the reparenting silently does nothing.
    expect(document.getElementById(owns!)).not.toBeNull();
  });

  it("announces applying a values filter", () => {
    const { recorded } = renderMenu(["filter-by-value"]);

    fireEvent.click(screen.getByText(filter.filterConform));

    expect(recorded()?.key).toBe("filter.announceFilterApplied");
  });
});

// The keys above are dotted paths, and the two menus draw from different locale
// sections — so resolution is its own failure mode: a wrong path resolves to
// undefined and the region stays silent exactly as if nothing was wired.
describe("announcement keys resolve to real strings", () => {
  const Probe: React.FC<{ key$: string; params?: any }> = ({
    key$,
    params,
  }) => {
    const { announcement } = useContextMenuAnnouncements({
      lang: "en",
      contextMenuAnnouncement: { key: key$, params, seq: 1 },
    } as any);
    return <div data-testid="out">{announcement}</div>;
  };

  it.each([
    ["rightclick.announceSortedAsc", rightclick.announceSortedAsc],
    ["rightclick.announceSortedDesc", rightclick.announceSortedDesc],
    ["rightclick.announceFilterRemoved", rightclick.announceFilterRemoved],
    ["filter.announceFilterApplied", filter.announceFilterApplied],
    ["filter.announceFilteredByColor", filter.announceFilteredByColor],
  ])("resolves %s across locale sections", async (key, expected) => {
    render(<Probe key$={key} />);

    // Published on the next task, deliberately: the action also moves focus, so
    // the region must update after that has happened rather than in the same
    // commit. The region is assertive, so it interrupts the focus utterance
    // instead of being discarded by it.
    await waitFor(() =>
      expect(screen.getByTestId("out").textContent).toBe(expected)
    );
    expect(expected).toBeTruthy();
  });

  it("interpolates counts rather than leaving the placeholder", async () => {
    render(
      <Probe
        key$="rightclick.announceColumnsInsertedLeft"
        params={{ count: 3 }}
      />
    );

    await waitFor(() =>
      expect(screen.getByTestId("out").textContent).toBe(
        "3 columns inserted to the left."
      )
    );
  });

  it("stays silent on a key that does not resolve", async () => {
    // The runtime half of the locale parity guard: better silent than
    // announcing the word "undefined".
    render(<Probe key$="rightclick.nopeNotAKey" />);

    await new Promise((r) => {
      setTimeout(r, 0);
    });
    expect(screen.getByTestId("out").textContent).toBe("");
  });
});
