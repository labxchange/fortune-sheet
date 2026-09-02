import { render, act, fireEvent, within } from "@testing-library/react";
import React from "react";
import Workbook, { WorkbookInstance } from "../src/components/Workbook";

// The toolbar's own accessibility contract, as opposed to the keyboard
// navigation between its items (keyboardToolbar.test.tsx): how many controls a
// combo exposes, whether the hover tooltip reaches the accessibility tree, what
// an action tells a screen reader afterwards, and whether the shortcuts button
// says which shortcut it is.

const celldata = [
  { r: 0, c: 0, v: { v: "1", m: "1", ct: { fa: "General", t: "n" } } },
  { r: 1, c: 0, v: { v: "2", m: "2", ct: { fa: "General", t: "n" } } },
];

/** announceAfterCommit defers by a task, so let that task run. */
const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
};

const renderSheet = (props: Record<string, unknown> = {}) => {
  const ref = React.createRef<WorkbookInstance>();
  const view = render(
    <Workbook
      ref={ref}
      lang="en"
      data={[{ name: "Sheet1", id: "s1", celldata, row: 10, column: 6 }]}
      {...props}
    />
  );
  return { ...view, ref };
};

const announcement = (container: HTMLElement) =>
  container.querySelector("#sr-toolbar")?.textContent ?? "";

describe("Combo exposes one control per distinct action", () => {
  it("gives a combo that only opens a popup a single tab stop", () => {
    const { container, getAllByRole } = renderSheet();

    // Format has no onClick: pressing the main button opens the popup, and so
    // did the arrow — the same handler, the same popup, the same name.
    expect(getAllByRole("button", { name: /^Format:/ })).toHaveLength(1);

    const combo = container
      .querySelector<HTMLElement>('[aria-label^="Format:"]')!
      .closest(".fortune-toolbar-combo")!;
    const arrow = combo.querySelector<HTMLElement>(
      ".fortune-toolbar-combo-arrow"
    )!;
    expect(arrow.getAttribute("aria-hidden")).toBe("true");
    expect(arrow.hasAttribute("role")).toBe(false);
    // Not tabindex="-1": focusable-but-not-tabbable inside aria-hidden is
    // itself a violation, and nothing focuses this programmatically.
    expect(arrow.hasAttribute("tabindex")).toBe(false);
  });

  it("still opens the popup when the decorative arrow is clicked", () => {
    const { container } = renderSheet();
    const arrow = container
      .querySelector<HTMLElement>('[aria-label^="Format:"]')!
      .closest(".fortune-toolbar-combo")!
      .querySelector<HTMLElement>(".fortune-toolbar-combo-arrow")!;

    fireEvent.mouseDown(arrow);

    expect(
      container.querySelector(".fortune-toolbar-combo-popup")
    ).toBeTruthy();
  });

  it("keeps both controls on a split button, where they do different things", () => {
    const { getAllByRole } = renderSheet();

    // Font color's main button applies the most recent colour and the arrow is
    // the only route to the picker, so the two are genuinely separate actions.
    const [main, arrow] = getAllByRole("button", { name: /^Font color/ });
    expect(arrow).toBeTruthy();
    expect(main.getAttribute("aria-label")).toBe("Font color");
    expect(arrow.getAttribute("aria-label")).toBe("Font color: Dropdown");
    expect(arrow.getAttribute("tabindex")).toBe("0");
  });
});

describe("hover tooltips stay out of the accessibility tree", () => {
  it("hides the duplicate tooltip text on buttons, combos and custom buttons", () => {
    const { container } = renderSheet({
      customToolbarItems: [
        { key: "plot", tooltip: "Plot", iconName: "chart", onClick: () => {} },
      ],
    });

    const tooltips = Array.from(
      container.querySelectorAll<HTMLElement>(".fortune-tooltip")
    );
    expect(tooltips.length).toBeGreaterThan(0);
    tooltips.forEach((tip) => {
      expect(tip.getAttribute("aria-hidden")).toBe("true");
    });

    // All three components that render one are represented: Button and
    // CustomButton hang theirs off .fortune-toolbar-button, Combo off
    // .fortune-toolbar-combo.
    const tooltipIn = (selector: string, label: string) =>
      container
        .querySelector<HTMLElement>(`[aria-label="${label}"]`)!
        .closest(selector)!
        .querySelector(".fortune-tooltip");
    expect(
      tooltipIn(".fortune-toolbar-button", "Undo")?.getAttribute("aria-hidden")
    ).toBe("true");
    expect(
      tooltipIn(".fortune-toolbar-button", "Plot")?.getAttribute("aria-hidden")
    ).toBe("true");
    expect(
      tooltipIn(".fortune-toolbar-combo", "Format: Automatic")?.getAttribute(
        "aria-hidden"
      )
    ).toBe("true");
  });

  it("leaves the control's own name intact and unduplicated", () => {
    const { getByRole, getAllByRole } = renderSheet();
    const toolbar = within(getByRole("toolbar"));

    // The name still comes from aria-label; the tooltip no longer supplies a
    // second copy of it beside the button.
    expect(toolbar.getAllByRole("button", { name: "Undo" })).toHaveLength(1);
    expect(getAllByRole("button", { name: /^Format:/ })).toHaveLength(1);
  });
});

describe("toolbar actions announce what they did", () => {
  const selectA1 = (ref: React.RefObject<WorkbookInstance>) => {
    act(() => {
      ref.current?.setSelection([{ row: [0, 0], column: [0, 0] }]);
    });
  };

  const clickToolbarButton = (getByRole: any, name: string) => {
    act(() => {
      fireEvent.click(getByRole("button", { name }));
    });
  };

  it("reports the state a toggle produced, both ways", async () => {
    const { container, getByRole, ref } = renderSheet({
      toolbarItems: ["bold"],
    });
    selectA1(ref);

    clickToolbarButton(getByRole, "Bold (Ctrl+B)");
    await flush();
    expect(announcement(container)).toContain("Bold on.");

    clickToolbarButton(getByRole, "Bold (Ctrl+B)");
    await flush();
    expect(announcement(container)).toContain("Bold off.");

    clickToolbarButton(getByRole, "Bold (Ctrl+B)");
    await flush();
    expect(announcement(container)).toContain("Bold on.");
  });

  it("re-announces a phrase it has just said, rather than going silent", async () => {
    // A live region says nothing when written the same text twice running,
    // which is exactly what bolding two cells in a row produces. The second
    // one has to differ as text while reading identically aloud.
    const { container, getByRole, ref } = renderSheet({
      toolbarItems: ["bold"],
    });

    selectA1(ref);
    clickToolbarButton(getByRole, "Bold (Ctrl+B)");
    await flush();
    const first = announcement(container);

    act(() => {
      ref.current?.setSelection([{ row: [1, 1], column: [0, 0] }]);
    });
    clickToolbarButton(getByRole, "Bold (Ctrl+B)");
    await flush();
    const second = announcement(container);

    expect(first).toContain("Bold on.");
    expect(second).toContain("Bold on.");
    expect(second).not.toBe(first);
  });

  it("exposes a toggle's state on the control itself, not only in the region", () => {
    const { getByRole, ref } = renderSheet({ toolbarItems: ["bold"] });
    selectA1(ref);
    const bold = getByRole("button", { name: "Bold (Ctrl+B)" });

    expect(bold.getAttribute("aria-pressed")).toBe("false");
    act(() => {
      fireEvent.click(bold);
    });
    expect(bold.getAttribute("aria-pressed")).toBe("true");
  });

  it("leaves a plain button unpressed rather than claiming a state", () => {
    const { getByRole } = renderSheet({ toolbarItems: ["undo"] });
    expect(
      getByRole("button", { name: "Undo" }).hasAttribute("aria-pressed")
    ).toBe(false);
  });

  it("says nothing when the action declined to act", async () => {
    // Increase-decimal returns silently on a cell that is not a number.
    // Announcing the request rather than the result would report a change the
    // sheet never made.
    const { container, getByRole, ref } = renderSheet({
      toolbarItems: ["number-increase"],
    });
    act(() => {
      ref.current?.setSelection([{ row: [5, 5], column: [3, 3] }]);
    });

    clickToolbarButton(getByRole, "Increase decimal places");
    await flush();

    expect(announcement(container)).toBe("");
  });

  // Clear format is the one action here that reaches past its anchor: it
  // rewrites every cell of every selection. Watching the focused cell, as the
  // other actions do, reports nothing whenever the anchor happens to be the
  // one cell with no formatting on it — which is the ordinary shape of a
  // column, a text header above formatted data.
  it("reports a clear that emptied the rest of the selection, not the anchor", async () => {
    const { container, getByRole, ref } = renderSheet({
      toolbarItems: ["bold", "clear-format"],
    });

    // Format A2 only, leaving the A1 anchor with nothing to lose.
    act(() => {
      ref.current?.setSelection([{ row: [1, 1], column: [0, 0] }]);
    });
    clickToolbarButton(getByRole, "Bold (Ctrl+B)");
    await flush();

    act(() => {
      ref.current?.setSelection([{ row: [0, 1], column: [0, 0] }]);
    });
    clickToolbarButton(getByRole, "Clear Format");
    await flush();

    expect(announcement(container)).toContain("Formatting cleared.");
  });

  it("still says nothing when there was no formatting to clear", async () => {
    // The other half of the same contract: widening what the action watches
    // must not turn it into an announcement of the request.
    const { container, getByRole, ref } = renderSheet({
      toolbarItems: ["clear-format"],
    });
    act(() => {
      ref.current?.setSelection([{ row: [0, 1], column: [0, 0] }]);
    });

    clickToolbarButton(getByRole, "Clear Format");
    await flush();

    expect(announcement(container)).toBe("");
  });

  it("announces the mode chosen for text wrap", async () => {
    const { container, ref } = renderSheet({ toolbarItems: ["text-wrap"] });
    selectA1(ref);

    const combo = container.querySelector<HTMLElement>(
      ".fortune-toolbar-combo-button"
    )!;
    act(() => {
      fireEvent.mouseDown(combo);
    });
    const option = within(
      container.querySelector<HTMLElement>(".fortune-toolbar-combo-popup")!
    )
      .getByText("Wrap")
      .closest('[role="button"]') as HTMLElement;
    act(() => {
      fireEvent.click(option);
    });
    await flush();

    expect(announcement(container)).toContain("Text wrap: Wrap.");
  });

  it("announces the border colour, the third colour popup in the toolbar", async () => {
    // CustomColor has three call sites, not two: font colour, background
    // colour, and this one inside CustomBorder. The keyboard and naming fixes
    // reach it for free through the shared component, but the announcement is
    // wired per call site, so this popup applied a colour in silence. Picking
    // here only stores the colour for the next handleBorder — nothing repaints
    // and no cell changes — so it announces directly rather than waiting for a
    // committed effect it will never see.
    const { container, getAllByRole, getByText, ref } = renderSheet({
      toolbarItems: ["border"],
    });
    selectA1(ref);

    // Border is a split button: the main half applies border-all directly, so
    // index 1 — the dropdown arrow — is the half that opens the popup.
    const [, borderArrow] = getAllByRole("button", { name: /^Border/ });
    act(() => {
      fireEvent.mouseDown(borderArrow);
    });

    // Opened by keyboard rather than hover, which is the route the fix is for.
    const colorRow = getByText("border color").closest(
      '[role="button"]'
    ) as HTMLElement;
    act(() => {
      fireEvent.keyDown(colorRow, { key: "Enter" });
    });

    const swatch = document.querySelector<HTMLElement>(
      '#fortune-custom-color [role="option"]'
    )!;
    const name = swatch.getAttribute("aria-label")!;
    act(() => {
      fireEvent.click(swatch);
    });
    await flush();

    expect(announcement(container)).toContain("Border color:");
    expect(announcement(container)).toContain(name);
  });

  it("announces undo and redo, whose effect the sheet cannot show", async () => {
    const { container, getByRole, ref } = renderSheet({
      toolbarItems: ["undo", "redo", "bold"],
    });
    selectA1(ref);
    clickToolbarButton(getByRole, "Bold (Ctrl+B)");
    await flush();

    clickToolbarButton(getByRole, "Undo");
    expect(announcement(container)).toContain("Undone.");

    clickToolbarButton(getByRole, "Redo");
    expect(announcement(container)).toContain("Redone.");
  });

  it("announces politely, so it waits behind whatever the grid is saying", () => {
    const { container } = renderSheet();
    const region = container.querySelector("#sr-toolbar")!;
    expect(region.getAttribute("role")).toBe("status");
    expect(region.classList.contains("sr-only")).toBe(true);
  });
});

describe("the keyboard shortcuts button names its own shortcut", () => {
  const platform = Object.getOwnPropertyDescriptor(
    window.navigator,
    "platform"
  );

  const setPlatform = (value: string) => {
    Object.defineProperty(window.navigator, "platform", {
      value,
      configurable: true,
    });
  };

  afterEach(() => {
    if (platform) {
      Object.defineProperty(window.navigator, "platform", platform);
    }
  });

  const hint = (container: HTMLElement) =>
    container.querySelector(".fortune-toolbar-shortcut-hint");

  it("uses the Ctrl form off the Mac", () => {
    setPlatform("Win32");
    const { getByRole } = renderSheet({
      toolbarItems: ["keyboard-shortcuts"],
    });

    expect(
      getByRole("button", { name: "Keyboard shortcuts (Ctrl + /)" })
    ).toBeTruthy();
  });

  it("uses the command glyph on a Mac", () => {
    setPlatform("MacIntel");
    const { getByRole } = renderSheet({
      toolbarItems: ["keyboard-shortcuts"],
    });

    expect(
      getByRole("button", { name: "Keyboard shortcuts (⌘ /)" })
    ).toBeTruthy();
  });

  it("shows the keys on the button itself, not only on hover", () => {
    // The hover tooltip needs a pointer and a deliberate hover, so a shortcut
    // that lives only there is not the "obvious indication" the button owes.
    setPlatform("Win32");
    const { container, getByRole } = renderSheet({
      toolbarItems: ["keyboard-shortcuts"],
    });

    const button = getByRole("button", {
      name: "Keyboard shortcuts (Ctrl + /)",
    });
    const keys = hint(container)!;
    expect(keys.textContent).toBe("Ctrl + /");
    expect(button.contains(keys)).toBe(true);
    // it is not the hover tooltip, which stays hidden until :hover
    expect(keys.classList.contains("fortune-tooltip")).toBe(false);
    // and it does not say the keys a second time to a screen reader, which
    // already hears them at the end of the button's name
    expect(keys.getAttribute("aria-hidden")).toBe("true");
  });

  it("switches the visible keys with the platform too", () => {
    setPlatform("MacIntel");
    const { container } = renderSheet({
      toolbarItems: ["keyboard-shortcuts"],
    });

    expect(hint(container)?.textContent).toBe("\u2318 /");
  });

  it("quotes the same keys the shortcuts dialog lists", () => {
    setPlatform("Win32");
    const { getByRole } = renderSheet({
      toolbarItems: ["keyboard-shortcuts"],
    });

    act(() => {
      fireEvent.click(
        getByRole("button", { name: "Keyboard shortcuts (Ctrl + /)" })
      );
    });

    const dialog = getByRole("dialog");
    const row = within(dialog)
      .getByText("Open keyboard shortcuts")
      .closest("tr")!;
    expect(row.textContent).toContain("Ctrl + /");
  });
});
