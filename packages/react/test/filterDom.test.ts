import { findFilterFunnel, filterUnchanged } from "../src/utils/filterDom";

// The funnel lookup is the guard that keeps a hidden funnel from being handed
// focus. It is unit-tested here because the state it guards against — a funnel
// scrolled behind a frozen pane, styled `display: none` by
// fixRowStyleOverflowInFreeze — needs scroll geometry that jsdom reports as
// zero, so the integration route cannot produce it faithfully.

const container = () => {
  const root = document.createElement("div");
  root.innerHTML = `
    <div data-filter-col="0" class="luckysheet-filter-options"></div>
    <div data-filter-col="1" class="luckysheet-filter-options"></div>
  `;
  document.body.appendChild(root);
  return root;
};

describe("findFilterFunnel", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("finds a funnel by its absolute column index", () => {
    const root = container();
    expect(findFilterFunnel(root, 1)).toBe(
      root.querySelector('[data-filter-col="1"]')
    );
  });

  it("reports a column with no funnel as absent", () => {
    expect(findFilterFunnel(container(), 7)).toBeNull();
  });

  it("reports a display:none funnel as absent", () => {
    // A browser refuses .focus() on such a node and leaves focus where it was —
    // which, for the popup's footer buttons, is the button the same commit just
    // unmounted, i.e. <body>. querySelector matches hidden nodes and a hidden
    // node is still isConnected, so neither check catches this; reporting it
    // absent here is what lets the caller fall back to the cell input.
    const root = container();
    const hidden = root.querySelector<HTMLElement>('[data-filter-col="0"]')!;
    hidden.style.display = "none";

    expect(hidden.isConnected).toBe(true);
    expect(findFilterFunnel(root, 0)).toBeNull();
    expect(findFilterFunnel(root, 1)).not.toBeNull();
  });

  it("takes a null container and a null column", () => {
    expect(findFilterFunnel(null, 0)).toBeNull();
    expect(findFilterFunnel(container(), null)).toBeNull();
  });
});

describe("filterUnchanged", () => {
  it("compares by reference, so a bail path reads as unchanged", () => {
    const range = { row: [0, 5], column: [2, 3] };
    expect(
      filterUnchanged({ luckysheet_filter_save: range } as any, range)
    ).toBe(true);
    expect(
      filterUnchanged({ luckysheet_filter_save: undefined } as any, range)
    ).toBe(false);
    // A structurally equal but distinct object counts as a change, which is the
    // point: createFilter rebuilds the range with _.assign rather than mutating.
    expect(
      filterUnchanged({ luckysheet_filter_save: { ...range } } as any, range)
    ).toBe(false);
  });
});
