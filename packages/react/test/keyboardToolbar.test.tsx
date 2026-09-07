import { render, fireEvent, within } from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";
import Button from "../src/components/Toolbar/Button";
import Combo from "../src/components/Toolbar/Combo";

/**
 * Somewhere inside the open popup to hold focus while a submenu row is hovered.
 *
 * These three cases used the Undo button for this. Since popups now dismiss on
 * focus leaving them (WCAG 2.4.11), parking focus on the toolbar behind the
 * popup closes it — correctly — and the rest of the case then runs against a
 * detached node. The assertion being made is unchanged: hovering a submenu
 * trigger must not move focus. It just has to be held somewhere the popup still
 * owns.
 */
const parkFocusInsidePopup = (popup: HTMLElement, notThis: HTMLElement) => {
  const spot = Array.from(
    popup.querySelectorAll<HTMLElement>('[role="button"], button')
  ).find((el) => el !== notThis && !el.contains(notThis));
  spot!.focus();
  return spot!;
};

describe("Toolbar keyboard accessibility", () => {
  it("does not activate a disabled button (Undo, with no history) via Enter or Space", () => {
    const { getByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    const undoButton = getByRole("button", { name: "Undo" });
    const clickSpy = jest.fn();
    undoButton.addEventListener("click", clickSpy);

    undoButton.focus();
    fireEvent.keyDown(undoButton, { key: "Enter" });
    fireEvent.keyDown(undoButton, { key: " " });

    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("opens a combo with Enter, navigates with arrows, and closes with Escape restoring focus", () => {
    const { getAllByRole, queryByText } = render(
      <Workbook data={[{ name: "Sheet1" }]} />
    );
    const [formatCombo] = getAllByRole("button", { name: /^Format:/ });

    formatCombo.focus();
    fireEvent.keyDown(formatCombo, { key: "Enter" });

    const popup = document.querySelector(".fortune-toolbar-combo-popup")!;
    const automaticOption = within(popup as HTMLElement)
      .getByText("Automatic")
      .closest('[role="button"]') as HTMLElement;
    expect(document.activeElement).toBe(automaticOption);

    fireEvent.keyDown(automaticOption, { key: "ArrowDown" });
    const plainTextOption = within(popup as HTMLElement)
      .getByText("Plain text")
      .closest('[role="button"]') as HTMLElement;
    expect(document.activeElement).toBe(plainTextOption);

    fireEvent.keyDown(plainTextOption, { key: "Escape" });
    expect(queryByText("Plain text")).toBeNull();
    expect(document.activeElement).toBe(formatCombo);
  });

  it("navigates the font-color grid with arrow keys", () => {
    const { getAllByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    // index 1 is the dropdown-arrow region, which always toggles the popup
    // (the main button applies the most-recent color instead, when set)
    const [, fontColorArrow] = getAllByRole("button", {
      name: /^Font color/,
    });

    fireEvent.mouseDown(fontColorArrow);
    const grid = document.querySelector(".fortune-toolbar-color-picker")!;
    // A listbox of options, not a grid of gridcells. The visual rows are
    // presentational, so nothing between the listbox and its options can be
    // named by concatenating the eight colour names it contains.
    expect(grid.getAttribute("role")).toBe("listbox");
    expect(within(grid as HTMLElement).queryAllByRole("row")).toHaveLength(0);
    const swatches = within(grid as HTMLElement).getAllByRole("option");
    expect(swatches).toHaveLength(64);

    // A listbox costs one tab stop, with arrows moving inside it. All 64 being
    // tabbable would contradict the role announced above — Tab would step
    // swatch by swatch through the whole palette.
    const tabbable = () =>
      swatches.filter((el) => el.getAttribute("tabindex") === "0");
    expect(tabbable()).toEqual([swatches[0]]);

    (swatches[0] as HTMLElement).focus();
    fireEvent.keyDown(swatches[0], { key: "ArrowRight" });
    expect(document.activeElement).toBe(swatches[1]);
    // the tab stop follows focus, so Tab-away-and-back returns to where the
    // user was rather than resetting to the first swatch
    expect(tabbable()).toEqual([swatches[1]]);

    // named, rather than announcing "pound, e, zero, six, six, six, six"
    expect(swatches[0].getAttribute("aria-label")).toBe("Black");
    expect(
      within(grid as HTMLElement)
        .getAllByRole("option")
        .find((el) => el.getAttribute("aria-label") === "Light red 1")
    ).toBeTruthy();
  });

  // Regression: the palette used to be grid/row/gridcell. role="row" takes its
  // accessible name from its contents, and a row here holds nothing but eight
  // named swatches, so moving onto a swatch announced the colour and then all
  // eight colour names of the row it had entered. Nothing between the listbox
  // and an option may reach the accessibility tree.
  it("does not expose any palette container that AT would name by its contents", () => {
    const { getAllByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    const [, fontColorArrow] = getAllByRole("button", {
      name: /^Font color/,
    });

    fireEvent.mouseDown(fontColorArrow);
    const picker = document.querySelector(
      ".fortune-toolbar-color-picker"
    ) as HTMLElement;

    // no name-from-contents container survives anywhere inside the palette
    expect(picker.querySelector('[role="row"]')).toBeNull();
    expect(picker.querySelector('[role="grid"]')).toBeNull();
    expect(picker.querySelector('[role="gridcell"]')).toBeNull();

    // every wrapper between an option and the listbox is presentational, so
    // the options are owned directly by the listbox in the tree
    const options = within(picker).getAllByRole("option");
    options.forEach((option) => {
      let node = option.parentElement;
      while (node && node !== picker) {
        expect(node.getAttribute("role")).toBe("presentation");
        node = node.parentElement;
      }
    });

    // the swatch's own name is the colour and nothing else
    expect(options[0].getAttribute("aria-label")).toBe("Black");
    expect(options[0].textContent).toBe("");
  });

  it("closes a Combo dropdown (Format) when its own trigger is clicked again", () => {
    const { getAllByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    const [formatCombo] = getAllByRole("button", { name: /^Format:/ });

    // A real browser click dispatches mousedown, mouseup, then click as
    // separate events — fireEvent.click() alone only dispatches a single
    // synthetic click and can't reproduce the race this guards against
    // (useOutsideClick closes the popup on mousedown; the toggle used to
    // run on click, reading the just-closed state and reopening it).
    fireEvent.mouseDown(formatCombo);
    fireEvent.mouseUp(formatCombo);
    fireEvent.click(formatCombo);
    expect(document.querySelector(".fortune-toolbar-combo-popup")).toBeTruthy();

    fireEvent.mouseDown(formatCombo);
    fireEvent.mouseUp(formatCombo);
    fireEvent.click(formatCombo);
    expect(document.querySelector(".fortune-toolbar-combo-popup")).toBeNull();
  });

  it("Font color's arrow toggles the picker via mousedown; its main button still applies the last color directly instead of toggling", () => {
    const { getAllByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    const [fontColorMain, fontColorArrow] = getAllByRole("button", {
      name: /^Font color/,
    });

    // main button has a custom onClick (apply the last-used color) — a
    // real click on it must not open the picker
    fireEvent.mouseDown(fontColorMain);
    fireEvent.mouseUp(fontColorMain);
    fireEvent.click(fontColorMain);
    expect(document.querySelector(".fortune-toolbar-color-picker")).toBeNull();

    // the arrow always toggles the picker, and does so on mousedown
    fireEvent.mouseDown(fontColorArrow);
    fireEvent.mouseUp(fontColorArrow);
    fireEvent.click(fontColorArrow);
    expect(
      document.querySelector(".fortune-toolbar-color-picker")
    ).toBeTruthy();

    fireEvent.mouseDown(fontColorArrow);
    fireEvent.mouseUp(fontColorArrow);
    fireEvent.click(fontColorArrow);
    expect(document.querySelector(".fortune-toolbar-color-picker")).toBeNull();
  });

  it("hovering the border color/style submenus does not steal focus, while keyboard opening still autofocuses and Escape restores it", () => {
    const { getAllByRole, getByText } = render(
      <Workbook data={[{ name: "Sheet1" }]} />
    );
    // index 1 is the dropdown-arrow region, which always toggles the popup
    // (the main button applies the border directly, when clicked)
    const [, borderArrow] = getAllByRole("button", { name: /^Border/ });

    fireEvent.mouseDown(borderArrow);
    const popup = document.querySelector(
      ".fortune-toolbar-combo-popup"
    ) as HTMLElement;

    [
      // The two submenus differ in role, and deliberately: the colour one owns
      // the shared `ColorPicker`, which is a `listbox`, and `role="menu"` may
      // only own `menuitem`/`menuitemradio`/`menuitemcheckbox`/`group` — so it
      // is a group (axe: aria-required-children). The style one still says
      // menu; its children are `role="button"`, the same class of mismatch, but
      // pre-existing and left alone here.
      {
        label: "border color",
        menuClass: "fortune-border-select-menu",
        role: "group",
      },
      {
        label: "border style",
        menuClass: "fortune-border-select-menu",
        role: "menu",
      },
    ].forEach(({ label, menuClass, role }) => {
      const trigger = getByText(label).closest(
        '[role="button"]'
      ) as HTMLElement;

      const parked = parkFocusInsidePopup(popup, trigger);
      fireEvent.mouseEnter(trigger);
      expect(document.activeElement).toBe(parked);
      fireEvent.mouseLeave(trigger);
      expect(document.activeElement).toBe(parked);

      trigger.focus();
      fireEvent.keyDown(trigger, { key: "Enter" });
      expect(document.activeElement).not.toBe(trigger);
      expect(
        (document.activeElement as HTMLElement).closest(`.${menuClass}`)
      ).toBeTruthy();
      // the submenu must be a sibling of the role="button" trigger, not a
      // descendant of it, or its contents are invisible to screen readers
      const submenuId = trigger.getAttribute("aria-controls");
      expect(submenuId).toBeTruthy();
      const submenu = document.getElementById(submenuId!)!;
      expect(submenu.getAttribute("role")).toBe(role);
      expect(trigger.contains(submenu)).toBe(false);

      fireEvent.keyDown(document.activeElement!, { key: "Escape" });
      expect(document.activeElement).toBe(trigger);
    });
  });

  it("hovering the Custom-formats submenu does not steal focus, while keyboard opening still autofocuses and Escape restores it", () => {
    const { getAllByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    const [formatCombo] = getAllByRole("button", { name: /^Format:/ });

    formatCombo.focus();
    fireEvent.keyDown(formatCombo, { key: "Enter" });
    const popup = document.querySelector(
      ".fortune-toolbar-combo-popup"
    ) as HTMLElement;
    const customFormatsRow = within(popup)
      .getByText("Custom formats")
      .closest('[role="button"]') as HTMLElement;

    const parked = parkFocusInsidePopup(popup, customFormatsRow);
    fireEvent.mouseEnter(customFormatsRow);
    expect(document.activeElement).toBe(parked);
    fireEvent.mouseLeave(customFormatsRow);
    expect(document.activeElement).toBe(parked);

    customFormatsRow.focus();
    fireEvent.keyDown(customFormatsRow, { key: "Enter" });
    expect(document.activeElement).not.toBe(customFormatsRow);
    expect(
      (document.activeElement as HTMLElement).closest(".more-format")
    ).toBeTruthy();
    const submenuId = customFormatsRow.getAttribute("aria-controls");
    expect(submenuId).toBeTruthy();
    const submenu = document.getElementById(submenuId!)!;
    expect(submenu.getAttribute("role")).toBe("menu");
    expect(customFormatsRow.contains(submenu)).toBe(false);

    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(document.activeElement).toBe(customFormatsRow);
  });

  it("hovering the Highlight-cell-rules condition-format submenu does not steal focus, while keyboard opening still autofocuses and Escape restores it", () => {
    const { getByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    const conditionFormatCombo = getByRole("button", {
      name: "Conditional format",
    });
    fireEvent.mouseDown(conditionFormatCombo);
    const popup = document.querySelector(
      ".fortune-toolbar-combo-popup"
    ) as HTMLElement;
    const highlightRow = within(popup)
      .getByText("Highlight cell rules")
      .closest('[role="button"]') as HTMLElement;

    const parked = parkFocusInsidePopup(popup, highlightRow);
    fireEvent.mouseEnter(highlightRow);
    expect(document.activeElement).toBe(parked);
    fireEvent.mouseLeave(highlightRow);
    expect(document.activeElement).toBe(parked);

    highlightRow.focus();
    fireEvent.keyDown(highlightRow, { key: "Enter" });
    expect(document.activeElement).not.toBe(highlightRow);
    expect(
      (document.activeElement as HTMLElement).closest(
        ".condition-format-sub-menu"
      )
    ).toBeTruthy();
    const submenuId = highlightRow.getAttribute("aria-controls");
    expect(submenuId).toBeTruthy();
    const submenu = document.getElementById(submenuId!)!;
    expect(submenu.getAttribute("role")).toBe("menu");
    expect(highlightRow.contains(submenu)).toBe(false);

    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(document.activeElement).toBe(highlightRow);
  });
});

describe("Combo popup ARIA belongs to the control that opens the popup", () => {
  it("keeps popup state off the main button when it has its own action", () => {
    const { getAllByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    const [main, arrow] = getAllByRole("button", { name: /^Font color/ });

    // The main button applies the most recent colour and never opens the
    // popup, so claiming one told the user to expect a menu that pressing it
    // would never produce.
    expect(main.hasAttribute("aria-haspopup")).toBe(false);
    expect(main.hasAttribute("aria-expanded")).toBe(false);
    expect(main.hasAttribute("aria-controls")).toBe(false);

    // The colour picker is a grid of swatch buttons, not a menu, so the arrow
    // is a plain disclosure: expanded + controls, no haspopup.
    expect(arrow.hasAttribute("aria-haspopup")).toBe(false);
    expect(arrow.getAttribute("aria-expanded")).toBe("false");
    expect(arrow.hasAttribute("aria-controls")).toBe(false);

    fireEvent.mouseDown(arrow);

    expect(arrow.getAttribute("aria-expanded")).toBe("true");
    const popupId = arrow.getAttribute("aria-controls");
    expect(popupId).toBeTruthy();
    const popup = document.getElementById(popupId!)!;
    expect(popup).toBeTruthy();
    expect(popup.classList.contains("fortune-toolbar-combo-popup")).toBe(true);

    // the other half of the old bug: the main button read "collapsed" while
    // the arrow's popup was open
    expect(main.hasAttribute("aria-expanded")).toBe(false);
  });

  it("keeps popup state on the main button when the main button is the toggle", () => {
    const { getAllByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    const [main] = getAllByRole("button", { name: /^Format:/ });

    expect(main.getAttribute("aria-haspopup")).toBe("menu");
    expect(main.getAttribute("aria-expanded")).toBe("false");
    // referencing an id that is not in the DOM is invalid, and the popup is
    // rendered only while open
    expect(main.hasAttribute("aria-controls")).toBe(false);

    fireEvent.mouseDown(main);

    expect(main.getAttribute("aria-expanded")).toBe("true");
    const popupId = main.getAttribute("aria-controls");
    expect(popupId).toBeTruthy();
    expect(
      document
        .getElementById(popupId!)!
        .classList.contains("fortune-toolbar-combo-popup")
    ).toBe(true);

    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(main.getAttribute("aria-expanded")).toBe("false");
    expect(main.hasAttribute("aria-controls")).toBe(false);
  });

  it("names an icon-only combo without a dangling colon", () => {
    const { getAllByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);

    // icon-only: no text to append, so the name is just the tooltip
    const [fontColorMain] = getAllByRole("button", { name: /^Font color/ });
    expect(fontColorMain.getAttribute("aria-label")).toBe("Font color");

    // Border passed a hardcoded text="边框设置" that Combo never rendered
    // (iconId wins), so it reached the accessible name and nothing else
    const [borderMain] = getAllByRole("button", { name: /^Border/ });
    expect(borderMain.getAttribute("aria-label")).toBe("Border");

    // a combo that really has text still gets "tooltip: value"
    const [formatMain] = getAllByRole("button", { name: /^Format:/ });
    expect(formatMain.getAttribute("aria-label")).toBe("Format: Automatic");
  });
});

describe("Combo main button with an unavailable action", () => {
  const getFontColor = (
    getAllByRole: ReturnType<typeof render>["getAllByRole"]
  ) => getAllByRole("button", { name: /^Font color/ });

  it("reports the colour button as disabled until a colour has been picked", () => {
    const { getAllByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    const [main, arrow] = getFontColor(getAllByRole);

    // onClick is `if (color) pick(color)` and there is no recent colour on a
    // fresh sheet, so the button looked live and silently did nothing
    expect(main.getAttribute("aria-disabled")).toBe("true");
    // the arrow must stay enabled — it is how the first colour gets picked
    expect(arrow.hasAttribute("aria-disabled")).toBe(false);
    fireEvent.mouseDown(arrow);
    expect(
      document.querySelector(".fortune-toolbar-color-picker")
    ).toBeTruthy();
  });

  it("swallows the disabled colour button's activation keys", () => {
    const { getAllByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    const [main] = getFontColor(getAllByRole);
    expect(main.getAttribute("aria-disabled")).toBe("true");

    main.focus();
    // fireEvent returns false when preventDefault was called. The grid's own
    // keydown handler is a React handler on .fortune-container, an ancestor of
    // the toolbar, so a disabled control has to consume Enter/Space rather
    // than ignore them — otherwise Enter reaches handleGlobalEnter and moves
    // the selection. (A native addEventListener on the ancestor cannot show
    // this: it fires before React's root dispatch, so React's stopPropagation
    // could never stop it. The stopPropagation half of onActivationKeyDown is
    // covered against a React ancestor in the Button specs below.)
    expect(fireEvent.keyDown(main, { key: "Enter" })).toBe(false);
    expect(fireEvent.keyDown(main, { key: " " })).toBe(false);

    // and pressing it does not open the popup either
    expect(document.querySelector(".fortune-toolbar-color-picker")).toBeNull();
  });

  // Asserted against Combo directly rather than by picking a colour in a
  // rendered Workbook: `disabled` is derived from
  // refs.globalCache.recentTextColor, a mutable ref, so it only refreshes on
  // the next render — and on a sheet with no selection handleTextColor
  // produces no state change, immer returns identical state, and React bails
  // out of re-rendering, so the flip never lands. Same property as the
  // existing swatch-bar indicator, which reads the same ref.
  it("gates the main button's own action on disabled", () => {
    const onClick = jest.fn();
    const props = {
      tooltip: "Font color",
      iconId: "font-color",
      hasPopup: false as const,
      onClick,
    };
    const { getByRole, rerender } = render(
      <Combo {...props} disabled>
        {() => <div />}
      </Combo>
    );
    const main = getByRole("button", { name: "Font color" });

    fireEvent.click(main);
    expect(fireEvent.keyDown(main, { key: "Enter" })).toBe(false);
    expect(fireEvent.keyDown(main, { key: " " })).toBe(false);
    expect(onClick).not.toHaveBeenCalled();

    rerender(<Combo {...props}>{() => <div />}</Combo>);

    expect(main.hasAttribute("aria-disabled")).toBe(false);
    fireEvent.click(main);
    expect(onClick).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(main, { key: "Enter" });
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});

describe("Toolbar Button disabled state", () => {
  // aria-disabled tells the user the control is inert; every activation path
  // has to agree with that, or a mouse user gets the action a keyboard user
  // was denied and a screen-reader user was told not to expect.
  it("ignores click, mousedown, Enter and Space when disabled", () => {
    const onClick = jest.fn();
    const { getByRole } = render(
      <Button tooltip="Undo" iconId="undo" disabled onClick={onClick} />
    );
    const button = getByRole("button", { name: "Undo" });

    fireEvent.click(button);
    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent.keyDown(button, { key: " " });

    expect(onClick).not.toHaveBeenCalled();
  });

  it("ignores mousedown, Enter and Space when disabled in onMouseDown mode", () => {
    const onMouseDown = jest.fn();
    const { getByRole } = render(
      <Button tooltip="More" iconId="more" disabled onMouseDown={onMouseDown} />
    );
    const button = getByRole("button", { name: "More" });

    fireEvent.mouseDown(button);
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent.keyDown(button, { key: " " });

    expect(onMouseDown).not.toHaveBeenCalled();
  });

  it("activates once per click and once per Enter when not disabled", () => {
    const onClick = jest.fn();
    const { getByRole } = render(
      <Button tooltip="Undo" iconId="undo" onClick={onClick} />
    );
    const button = getByRole("button", { name: "Undo" });

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(button, { key: "Enter" });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  // The grid's own keydown handler is bound on .fortune-container, an ancestor
  // of the toolbar, so an Enter that merely "does nothing" here would still
  // bubble into handleGlobalEnter and move the selection.
  it("does not let Enter or Space bubble past a disabled button", () => {
    const onAncestorKeyDown = jest.fn();
    const { getByRole } = render(
      <div onKeyDown={onAncestorKeyDown}>
        <Button tooltip="Undo" iconId="undo" disabled />
      </div>
    );
    const button = getByRole("button", { name: "Undo" });

    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent.keyDown(button, { key: " " });

    expect(onAncestorKeyDown).not.toHaveBeenCalled();
  });

  it("lets unrelated keys bubble past a disabled button", () => {
    const onAncestorKeyDown = jest.fn();
    const { getByRole } = render(
      <div onKeyDown={onAncestorKeyDown}>
        <Button tooltip="Undo" iconId="undo" disabled />
      </div>
    );

    fireEvent.keyDown(getByRole("button", { name: "Undo" }), { key: "a" });

    expect(onAncestorKeyDown).toHaveBeenCalledTimes(1);
  });

  // `Combo` appends its `text` to the tooltip to build the accessible name, but
  // renders that text visibly only when there is no `iconId`. Merge-cell has an
  // icon, so a stray `text="合并单元格"` was invisible on screen and reached
  // only screen readers, as "Merge cells: 合并单元格".
  // Identify a button by its icon rather than by dumping the node: an unnamed
  // icon button has nothing else to call it by, and 20 serialised divs in a
  // failure message are unreadable.
  const toolbarButtonNames = (toolbar: ReturnType<typeof within>) =>
    toolbar.getAllByRole("button").map((button) => ({
      icon:
        button
          .querySelector("use")
          ?.getAttribute("xlink:href")
          ?.replace(/^#/, "") ?? "(no icon)",
      name: button.getAttribute("aria-label") ?? button.textContent ?? "",
    }));

  it("names icon-only combos without leaking untranslated text", () => {
    const { getByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    const toolbar = within(getByRole("toolbar"));

    expect(toolbar.getByRole("button", { name: "Merge cells" })).toBeTruthy();

    toolbarButtonNames(toolbar).forEach(({ name }) => {
      // Any CJK in a toolbar button's accessible name means a hardcoded string
      // escaped the locale files — the class of bug this test exists to catch.
      expect(name).not.toMatch(/[一-鿿]/);
    });
  });

  it("gives every toolbar button a name at all", () => {
    const { getByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    const toolbar = within(getByRole("toolbar"));

    // Without this the sweep above passes vacuously: a refactor that dropped
    // the aria-labels would leave every name as the empty string, which
    // contains no CJK and so would look clean.
    //
    // It also catches a whole class of bug on its own. `Button`/`CustomButton`
    // set `aria-label={tooltip}`, and Toolbar derives `tooltip` as
    // `toolbar[name]` — so an entry in `toolbarItems` (core settings) with no
    // matching `toolbar.<name>` locale key renders a control that announces as
    // bare "button" and nothing else. `search` was exactly that, and nothing
    // visible was wrong: the icon rendered, the click worked, only the name was
    // missing. Same 4.1.2 failure as the leaked Chinese string, one step
    // further along.
    const names = toolbarButtonNames(toolbar);
    expect(names.length).toBeGreaterThan(0);

    // Reported by icon id: an unnamed icon button has nothing else to call it
    // by, and a serialised node per offender is unreadable in a failure.
    const unnamed = names
      .filter(({ name }) => name.trim() === "")
      .map(({ icon }) => icon)
      .sort();
    expect(unnamed).toEqual([]);
  });

  it("localises the toolbar names rather than hardcoding English", () => {
    const { getByRole } = render(
      <Workbook lang="zh" data={[{ name: "Sheet1" }]} />
    );
    const toolbar = within(getByRole("toolbar"));

    // The positive control for the CJK sweep. Deleting merge-cell's stray
    // `text` prop must not cost the button its translated name: the tooltip it
    // is built from is a locale string, so in Chinese the name is expected to
    // BE Chinese. This is what distinguishes "no leaked hardcoded string" from
    // "no localisation at all".
    expect(toolbar.getByRole("button", { name: "合并单元格" })).toBeTruthy();
  });
});
