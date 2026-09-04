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

/**
 * Resolved non-optionally on purpose. As `?.textContent ?? ""` this returned
 * the empty string for a *missing* region as readily as for a silent one, so
 * every "says nothing" assertion below passed just as well with the whole
 * feature deleted. Failing loudly on a missing region is what makes those
 * assertions mean silence.
 */
const announcement = (container: HTMLElement) => {
  const region = container.querySelector("#sr-toolbar");
  if (!region) throw new Error("#sr-toolbar is not in the document");
  return region.textContent ?? "";
};

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

  /**
   * Opens the toolbar's only combo and activates one of its rows. Opened from
   * the arrow rather than the main button, because a combo whose main button
   * carries its own action (border applies all borders) leaves the arrow as
   * the only route to the popup.
   */
  const pickFromCombo = (container: HTMLElement, label: string) => {
    act(() => {
      fireEvent.mouseDown(
        container.querySelector<HTMLElement>(".fortune-toolbar-combo-arrow")!
      );
    });
    const option = within(
      container.querySelector<HTMLElement>(".fortune-toolbar-combo-popup")!
    )
      .getByText(label)
      .closest('[role="button"]') as HTMLElement;
    act(() => {
      fireEvent.click(option);
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

  it("reports a merge as a merge and the same press again as a split", async () => {
    // Every row of this combo is a toggle: mergeCells un-merges whenever the
    // selection already holds a merged cell. Naming the row that was pressed
    // said "Cells merged." while the sheet had just split them.
    const { container, getByRole, ref } = renderSheet({
      toolbarItems: ["merge-cell"],
    });
    act(() => {
      ref.current?.setSelection([{ row: [0, 1], column: [0, 0] }]);
    });

    clickToolbarButton(getByRole, "Merge cells");
    await flush();
    expect(announcement(container)).toContain("Cells merged.");

    clickToolbarButton(getByRole, "Merge cells");
    await flush();
    expect(announcement(container)).toContain("Cells unmerged.");
  });

  it("reports Merge all over merged cells as the split it performs", async () => {
    // The same toggle reached from the popup, where the row's own label is the
    // most misleading thing the announcement could have repeated.
    const { container, getByRole, ref } = renderSheet({
      toolbarItems: ["merge-cell"],
    });
    act(() => {
      ref.current?.setSelection([{ row: [0, 1], column: [0, 0] }]);
    });

    clickToolbarButton(getByRole, "Merge cells");
    await flush();

    pickFromCombo(container, "Merge all");
    await flush();

    expect(announcement(container)).toContain("Cells unmerged.");
  });

  it("says what to do when the selection is a single cell", async () => {
    // `mergeCells` skips a single-cell range outright, and a sheet mounts with
    // exactly one cell selected — so this is the most likely press of the
    // button, and it moved nothing, repainted nothing and (until this) said
    // nothing. Reported as broken: "the merge button is neither clickable nor
    // operable by keyboard". Both were fine; the silence was the defect.
    const { container, getByRole, ref } = renderSheet({
      toolbarItems: ["merge-cell"],
    });
    selectA1(ref);

    clickToolbarButton(getByRole, "Merge cells");
    await flush();

    expect(announcement(container)).toContain(
      "Select two or more cells to merge."
    );
  });

  it("says why merge does nothing on a read-only row", async () => {
    // The ending that was actually reported: a range dragged across the Basic
    // story's `rowReadOnly` rows. `isAllowEdit` fails, `handleMerge` returns
    // before touching the sheet, and nothing on screen marks those rows — so
    // the button looked broken rather than declined.
    const { container, getByRole, ref } = renderSheet({
      toolbarItems: ["merge-cell"],
      data: [
        {
          name: "Sheet1",
          id: "s1",
          celldata,
          row: 10,
          column: 6,
          config: { rowReadOnly: { 0: 1, 1: 1 } },
        },
      ],
    });
    act(() => {
      ref.current?.setSelection([{ row: [0, 1], column: [0, 0] }]);
    });

    clickToolbarButton(getByRole, "Merge cells");
    await flush();

    expect(announcement(container)).toContain(
      "Cannot perform this operation in read-only mode"
    );
  });

  it("says the selection holds nothing merged when asked to unmerge", async () => {
    // The same dead end from the other direction: a range wide enough to act
    // on, with no merged cell in it for merge-cancel to undo.
    const { container, ref } = renderSheet({
      toolbarItems: ["merge-cell"],
    });
    act(() => {
      ref.current?.setSelection([{ row: [0, 1], column: [0, 0] }]);
    });

    pickFromCombo(container, "Unmerge");
    await flush();

    expect(announcement(container)).toContain(
      "No merged cells in the selection."
    );
  });

  it("does not tell an unmerge to select more cells to merge", async () => {
    // `handleMerge` answers "every range is one cell" before it looks at which
    // row was pressed, and the toolbar mapped that answer to the merge phrase
    // unconditionally — so Unmerge over a single cell, which is the sheet's own
    // mount state and so the likeliest press of that row, told the user to
    // select more cells *to merge*: the action they had not chosen.
    const { container, ref } = renderSheet({
      toolbarItems: ["merge-cell"],
    });
    selectA1(ref);

    pickFromCombo(container, "Unmerge");
    await flush();

    expect(announcement(container)).not.toContain("to merge");
    expect(announcement(container)).toContain(
      "No merged cells in the selection."
    );
  });

  it("still tells a merge to select more cells", async () => {
    // The counter-path: that phrase is right for the row it belongs to, and
    // the fix must not silence it there.
    const { container, ref } = renderSheet({
      toolbarItems: ["merge-cell"],
    });
    selectA1(ref);

    pickFromCombo(container, "Merge all");
    await flush();

    expect(announcement(container)).toContain("Select two or more cells");
  });

  it("announces the size chosen for the font", async () => {
    const { container, ref } = renderSheet({ toolbarItems: ["font-size"] });
    selectA1(ref);

    pickFromCombo(container, "14");
    await flush();

    expect(announcement(container)).toContain("Font size: 14.");
  });

  it("announces a size the cell already carried, not only a change", async () => {
    // A size is a value picked from a list, not a toggle. Choosing 14 on a cell
    // that is already 14 is a request that succeeded, so gating it on the cell
    // changing would leave the control announcing itself only intermittently —
    // which reads as a broken control rather than as a deliberate silence.
    const { container, ref } = renderSheet({ toolbarItems: ["font-size"] });
    selectA1(ref);

    pickFromCombo(container, "14");
    await flush();
    const first = announcement(container);

    pickFromCombo(container, "14");
    await flush();
    const second = announcement(container);

    expect(first).toContain("Font size: 14.");
    expect(second).toContain("Font size: 14.");
    // Same words, a different text node, or the region would say nothing.
    expect(second).not.toBe(first);
  });

  it("says nothing about a size the sheet refused to apply", async () => {
    // The other half of that contract: not gating on a change must not turn the
    // announcement into a report of the request. updateFormat returns before
    // writing anything on a read-only sheet.
    const { container, ref } = renderSheet({
      toolbarItems: ["font-size"],
      allowEdit: false,
    });
    selectA1(ref);

    pickFromCombo(container, "14");
    await flush();

    expect(announcement(container)).toBe("");
  });

  it("announces the border that was applied", async () => {
    // handleBorder appends to config.borderInfo and writes nothing to the cell,
    // so the anchor fingerprint the other actions share reports every border as
    // a no-op. Pressing the main button applies all borders without opening the
    // popup, which is the route with the least feedback of any.
    const { container, getByRole, ref } = renderSheet({
      toolbarItems: ["border"],
    });
    selectA1(ref);

    clickToolbarButton(getByRole, "Border");
    await flush();

    expect(announcement(container)).toContain("Border: All borders.");
  });

  it("reports removing borders as a removal, not as a border called None", async () => {
    const { container, ref } = renderSheet({ toolbarItems: ["border"] });
    selectA1(ref);

    pickFromCombo(container, "No border");
    await flush();

    expect(announcement(container)).toContain("Borders removed.");
  });

  it("says nothing when the sheet refused the border", async () => {
    const { container, getByRole, ref } = renderSheet({
      toolbarItems: ["border"],
      allowEdit: false,
    });
    selectA1(ref);

    clickToolbarButton(getByRole, "Border");
    await flush();

    expect(announcement(container)).toBe("");
  });

  it("announces a sort from the Sort and filter menu", async () => {
    // The one action in that menu with no state to watch: sortSelection has
    // five silent refusals, so it reports whether it sorted instead.
    const { container, ref } = renderSheet({ toolbarItems: ["filter"] });
    act(() => {
      ref.current?.setSelection([{ row: [0, 1], column: [0, 0] }]);
    });

    pickFromCombo(container, "Ascending");
    await flush();

    expect(announcement(container)).toContain("Ascending sort applied.");
  });

  it("distinguishes a descending sort from an ascending one", async () => {
    const { container, ref } = renderSheet({ toolbarItems: ["filter"] });
    act(() => {
      ref.current?.setSelection([{ row: [0, 1], column: [0, 0] }]);
    });

    pickFromCombo(container, "Descending");
    await flush();

    expect(announcement(container)).toContain("Descending sort applied.");
  });

  it("announces a sort that reordered nothing, having already been sorted", async () => {
    // Sorting the same way twice is a success that changes no data, so nothing
    // a fingerprint could watch moves. Reporting it as silence would make the
    // control answer only every other press.
    const { container, ref } = renderSheet({ toolbarItems: ["filter"] });
    act(() => {
      ref.current?.setSelection([{ row: [0, 1], column: [0, 0] }]);
    });

    pickFromCombo(container, "Ascending");
    await flush();
    const first = announcement(container);

    pickFromCombo(container, "Ascending");
    await flush();
    const second = announcement(container);

    expect(first).toContain("Ascending sort applied.");
    expect(second).toContain("Ascending sort applied.");
    expect(second).not.toBe(first);
  });

  it("says nothing when the sort was refused", async () => {
    // A read-only sheet is the first of sortSelection's five refusals, and all
    // five are silent — which is why announcing on the click rather than on the
    // outcome would report sorts that never happened.
    const { container, ref } = renderSheet({
      toolbarItems: ["filter"],
      allowEdit: false,
    });
    act(() => {
      ref.current?.setSelection([{ row: [0, 1], column: [0, 0] }]);
    });

    pickFromCombo(container, "Ascending");
    await flush();

    expect(announcement(container)).toBe("");
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

  it("keeps the border colour popup open while its typed-colour field is in use", () => {
    // This row hides its submenu on mouseleave, and hiding it blurs whatever is
    // focused inside — so a pointer drifting off the row while the hex field or
    // the native swatch was being used took the caret with it. Unlike the sheet
    // tab's version this popup is display-toggled rather than unmounted, so the
    // damage was the lost focus rather than the lost value.
    const { getAllByRole, getByText, ref } = renderSheet({
      toolbarItems: ["border"],
    });
    selectA1(ref);

    const [, borderArrow] = getAllByRole("button", { name: /^Border/ });
    act(() => {
      fireEvent.mouseDown(borderArrow);
    });
    const colorRow = getByText("border color").closest(
      '[role="button"]'
    ) as HTMLElement;
    act(() => {
      fireEvent.keyDown(colorRow, { key: "Enter" });
    });

    const menu = document.getElementById(
      colorRow.getAttribute("aria-controls")!
    )!;
    const field = menu.querySelector<HTMLInputElement>(
      ".fortune-color-hex-input"
    )!;
    const row = colorRow.parentElement!;

    // Real focus, not a synthetic focus event: the guard asks the document
    // where focus actually is.
    act(() => {
      field.focus();
    });
    act(() => {
      fireEvent.mouseLeave(row);
    });
    expect(menu.style.display).toBe("block");

    // And the counter-path: with focus back out of the submenu, the pointer
    // closes it.
    //
    // Focus goes to the colour *row* — still inside the Combo popup, outside
    // `colorRef` — rather than blurring to `<body>`. Blurring to nothing takes
    // focus out of the Combo entirely, which is the case `Combo`'s
    // `closeOnFocusOut` now dismisses (WCAG 2.4.11); the popup unmounts, and
    // this assertion would then read a detached node whose inline style is
    // frozen at whatever it last rendered. The row is also the honest gesture:
    // the pointer leaves a row the keyboard has come back to.
    act(() => {
      colorRow.focus();
    });
    act(() => {
      fireEvent.mouseLeave(row);
    });
    expect(menu.style.display).toBe("none");
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

  it("announces assertively, so the button's own hint cannot swallow it", () => {
    const { container } = renderSheet();
    const region = container.querySelector("#sr-toolbar")!;
    expect(region.getAttribute("role")).toBe("alert");
    expect(region.getAttribute("aria-atomic")).toBe("true");
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

describe("what an action reports when it reaches past the anchor", () => {
  const flushTask = async () => {
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
  };

  const render2 = () => {
    const ref = React.createRef<WorkbookInstance>();
    const view = render(
      <Workbook
        ref={ref}
        lang="en"
        data={[
          {
            name: "Sheet1",
            id: "s1",
            row: 10,
            column: 6,
            celldata: [
              // A1 already bold, A2 plain: pressing Bold over A1:A2 anchored on
              // A1 changes A2 and leaves the anchor exactly as it was.
              { r: 0, c: 0, v: { v: "1", m: "1", bl: 1 } },
              { r: 1, c: 0, v: { v: "2", m: "2" } },
            ],
          },
        ]}
      />
    );
    return { ...view, ref };
  };

  it("announces a change made to a cell that is not the anchor", async () => {
    // The fingerprint watched only the focused cell, so this was silent: A2
    // gained `bl: 1`, a real change to a real cell, and the anchor never moved.
    // Half of "toolbar action status not announced", on the multi-cell
    // selection that is the reason to press a toolbar button at all.
    const { container, getByRole, ref } = render2();
    act(() => {
      ref.current?.setSelection([
        { row: [0, 1], column: [0, 0], row_focus: 0, column_focus: 0 },
      ]);
    });

    act(() => {
      fireEvent.click(getByRole("button", { name: "Bold (Ctrl+B)" }));
    });
    await flushTask();

    expect(announcement(container)).toContain("Bold on.");
  });

  it("still reports the direction a single-cell toggle actually went", async () => {
    // The anchor case has to keep working: widening the fingerprint must not
    // cost the selection of one cell, where it was already correct. A1 is
    // already bold, so pressing Bold clears it.
    const { container, getByRole, ref } = render2();
    act(() => {
      ref.current?.setSelection([
        { row: [0, 0], column: [0, 0], row_focus: 0, column_focus: 0 },
      ]);
    });

    act(() => {
      fireEvent.click(getByRole("button", { name: "Bold (Ctrl+B)" }));
    });
    await flushTask();
    expect(announcement(container)).toContain("Bold off.");
  });

  it("stays silent on a sheet that cannot be edited", async () => {
    // `updateFormat` returns on `isAllowEdit`, so nothing is written and the
    // fingerprint is unmoved — the guarantee that made the anchor fingerprint
    // worth having in the first place, kept while widening it.
    const ref = React.createRef<WorkbookInstance>();
    const { container, getByRole } = render(
      <Workbook
        ref={ref}
        lang="en"
        allowEdit={false}
        data={[
          {
            name: "Sheet1",
            id: "s1",
            row: 10,
            column: 6,
            celldata: [{ r: 0, c: 0, v: { v: "1", m: "1" } }],
          },
        ]}
      />
    );
    act(() => {
      ref.current?.setSelection([
        { row: [0, 1], column: [0, 0], row_focus: 0, column_focus: 0 },
      ]);
    });

    act(() => {
      fireEvent.click(getByRole("button", { name: "Bold (Ctrl+B)" }));
    });
    await flushTask();

    expect(announcement(container)).toBe("");
  });
});

describe("removing a colour is an outcome too", () => {
  const flushTask = async () => {
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
  };

  const renderColoured = () => {
    const ref = React.createRef<WorkbookInstance>();
    const view = render(
      <Workbook
        ref={ref}
        lang="en"
        data={[
          {
            name: "Sheet1",
            id: "s1",
            row: 10,
            column: 6,
            celldata: [{ r: 0, c: 0, v: { v: "1", m: "1", fc: "#ff0000" } }],
          },
        ]}
      />
    );
    return { ...view, ref };
  };

  it("says a text colour was removed rather than saying nothing", async () => {
    // Reset color guarded with `if (!color) return ""`, which made clearing the
    // one colour action with nothing to say — while the sheet tab beside it has
    // announced its own removal since this branch added `sheetColorRemoved`.
    const { container, getByRole, ref } = renderColoured();
    act(() => {
      ref.current?.setSelection([
        { row: [0, 0], column: [0, 0], row_focus: 0, column_focus: 0 },
      ]);
    });

    fireEvent.mouseDown(getByRole("button", { name: "Font color: Dropdown" }));
    const reset = document.querySelector<HTMLElement>(
      "#fortune-custom-color .color-reset"
    )!;
    act(() => {
      fireEvent.click(reset);
    });
    await flushTask();

    expect(announcement(container)).toContain("Text color removed.");
  });

  it("never reads the template back when a border colour is reset", async () => {
    // `CustomBorder` forwarded `undefined` as `color as string`, and
    // `replaceHtml` returns the *unsubstituted* match for a missing value — so
    // this announced the literal "Border color: ${color}.", spoken as "dollar
    // sign, open brace, color".
    const { container, getByRole } = render(
      <Workbook
        lang="en"
        data={[{ name: "Sheet1", id: "s1", row: 10, column: 6 }]}
      />
    );

    fireEvent.mouseDown(getByRole("button", { name: "Border: Dropdown" }));
    // The colour submenu is display-toggled rather than conditionally mounted,
    // so its reset row is reachable without driving the hover open.
    const reset = document.querySelector<HTMLElement>(
      ".fortune-border-select-menu #fortune-custom-color .color-reset"
    )!;
    expect(reset).toBeTruthy();
    act(() => {
      fireEvent.click(reset);
    });
    await flushTask();

    expect(announcement(container)).not.toContain("${");
    expect(announcement(container)).toContain("Border color removed.");
  });
});

describe("the toolbar palettes mark the colour that is actually applied", () => {
  const openFontColour = (getByRole: any) => {
    fireEvent.mouseDown(getByRole("button", { name: "Font color: Dropdown" }));
    const popup = document.querySelector<HTMLElement>("#fortune-custom-color");
    if (!popup) throw new Error("the font colour popup did not open");
    return popup;
  };

  const selectedIn = (popup: HTMLElement) =>
    Array.from(
      popup.querySelectorAll<HTMLElement>(
        '[role="option"][aria-selected="true"]'
      )
    );

  it("marks nothing when the cell has no colour of its own", () => {
    // The regression this guards. `CustomColor`'s `inputColor` is a *draft*
    // seeded to "#000000" and reset every time `Combo` remounts the popup, so
    // wiring the palette to it marked Black as applied on every single open —
    // a confident false claim where the old constant `false` at least made
    // none. The palette is fed the cell's own colour now.
    const ref = React.createRef<WorkbookInstance>();
    const { getByRole } = render(
      <Workbook
        ref={ref}
        lang="en"
        data={[
          {
            name: "Sheet1",
            id: "s1",
            row: 10,
            column: 6,
            celldata: [{ r: 0, c: 0, v: { v: "1", m: "1" } }],
          },
        ]}
      />
    );
    act(() => {
      ref.current?.setSelection([
        { row: [0, 0], column: [0, 0], row_focus: 0, column_focus: 0 },
      ]);
    });

    expect(selectedIn(openFontColour(getByRole))).toHaveLength(0);
  });

  it("marks the cell's own text colour when it has one", () => {
    const ref = React.createRef<WorkbookInstance>();
    const { getByRole } = render(
      <Workbook
        ref={ref}
        lang="en"
        data={[
          {
            name: "Sheet1",
            id: "s1",
            row: 10,
            column: 6,
            celldata: [{ r: 0, c: 0, v: { v: "1", m: "1", fc: "#674ea7" } }],
          },
        ]}
      />
    );
    act(() => {
      ref.current?.setSelection([
        { row: [0, 0], column: [0, 0], row_focus: 0, column_focus: 0 },
      ]);
    });

    const selected = selectedIn(openFontColour(getByRole));
    expect(selected).toHaveLength(1);
    expect(selected[0].style.backgroundColor).toBe("rgb(103, 78, 167)");
  });
});

describe("a picked border colour is the colour the next border gets", () => {
  const flushTask = async () => {
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
  };

  it("carries the announced colour into the border that follows", async () => {
    // `onPick` stores the colour and `onColorPicked` announces it, with nothing
    // tying the two together. `announceNow` is the right call for a pick that
    // repaints nothing — there is no committed effect to fingerprint — but it
    // is also what leaves an announcement that cannot notice the store failing:
    // emptying `onPick` kept every other assertion in this file green while
    // every subsequent border drew in the default colour, saying "Border color:
    // Red." the whole time. Structurally the same shape as a Confirm announcing
    // a sheet colour it never applied, which is the finding this closes.
    const { container, getByRole, ref } = renderSheet({
      toolbarItems: ["border"],
    });
    act(() => {
      ref.current?.setSelection([{ row: [0, 0], column: [0, 0] }]);
    });

    fireEvent.mouseDown(getByRole("button", { name: "Border: Dropdown" }));
    // The colour submenu is display-toggled rather than conditionally mounted,
    // so its swatches are reachable without driving the hover open. Index 8 is
    // the first swatch of the palette's second row, #f00f00.
    const swatch = document.querySelectorAll<HTMLElement>(
      '.fortune-border-select-menu #fortune-custom-color [role="option"]'
    )[8];
    expect(swatch).toBeTruthy();
    act(() => {
      fireEvent.click(swatch);
    });
    await flushTask();

    expect(announcement(container)).toContain("Border color: Red.");

    act(() => {
      fireEvent.click(getByRole("button", { name: "Border" }));
    });
    await flushTask();

    // The claim under test: what was announced is what the sheet stored.
    const borderInfo = (ref.current?.getSheet() as any)?.config?.borderInfo;
    expect(borderInfo).toHaveLength(1);
    expect(borderInfo[0].color).toBe("#f00f00");
    expect(borderInfo[0].borderType).toBe("border-all");
  });
});
