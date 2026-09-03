import { render, fireEvent, act, within } from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";

// Sheet Options -> Change Color, and the near-identical custom-colour popup the
// toolbar's font/background buttons open. Between them they own every control
// the audit flagged: the native colour swatch (which had no accessible name at
// all), and Confirm (which applied a colour, said nothing, and left the menu
// standing open with focus inside it).
//
// The swatch palette itself is the shared `ColorPicker`, already named and
// already a role="listbox" with roving focus, so it is only checked here for
// the part that is specific to being *inside* these popups.

const tick = () =>
  act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });

/** Open Sheet Options -> Change color from the keyboard, as a user would. */
const openChangeColor = (getByRole: any, getByText: any) => {
  const sheetOptionsButton = getByRole("button", { name: "Sheet options" });
  sheetOptionsButton.focus();
  fireEvent.keyDown(sheetOptionsButton, { key: "Enter" });

  const colorRow = getByText("Change color").closest(
    '[role="button"]'
  ) as HTMLElement;
  colorRow.focus();
  fireEvent.keyDown(colorRow, { key: "Enter" });

  const submenu = document.getElementById(
    colorRow.getAttribute("aria-controls")!
  )!;
  return { sheetOptionsButton, colorRow, submenu };
};

/** Non-optional for the same reason as `announcement` in toolbarA11y: an
 *  optional read cannot tell a silent region from an absent one. */
const status = () => {
  const region = document.querySelector("#sr-sheetColor");
  if (!region) throw new Error("#sr-sheetColor is not in the document");
  return region.textContent ?? "";
};

const menuIsOpen = () =>
  document.querySelector(".luckysheet-cols-menu") !== null;

describe("Change Color accessibility", () => {
  describe("the custom colour swatch", () => {
    it("is named by the label already beside it", () => {
      // aria-labelledby rather than a second, invisible aria-label: the visible
      // text is what a speech-input user will say, so the two must not drift
      // (WCAG 2.5.3), and an unnamed colour input announces as nothing at all.
      const { getByRole, getByText } = render(
        <Workbook data={[{ name: "Sheet1" }]} />
      );
      const { submenu } = openChangeColor(getByRole, getByText);

      const swatch = submenu.querySelector<HTMLInputElement>(
        'input[type="color"]'
      )!;
      const labelId = swatch.getAttribute("aria-labelledby");
      expect(labelId).toBeTruthy();
      expect(document.getElementById(labelId!)?.textContent).toContain(
        "CUSTOM"
      );
    });
  });

  describe("Confirm", () => {
    it("announces the colour, closes the menu, and returns focus to the sheet", async () => {
      let sheets: any;
      const { container, getByRole, getByText } = render(
        <Workbook
          data={[{ name: "Sheet1" }]}
          onChange={(data) => {
            sheets = data;
          }}
        />
      );
      const { submenu } = openChangeColor(getByRole, getByText);

      const confirm = within(submenu)
        .getByText("OK")
        .closest('[role="button"]') as HTMLElement;
      fireEvent.click(confirm);

      // The default custom value is #000000, which the palette does name.
      expect(status()).toContain("Sheet color:");
      expect(menuIsOpen()).toBe(false);
      // The outcome, not just the report of one. Without this the suite was
      // green while Confirm announced a colour it had not applied: the write
      // went through an effect on `selectColor`, and closing the menu unmounts
      // this component in the same batched commit, so the effect never ran.
      expect(sheets?.[0]?.color).toBe("#000000");

      await tick();
      expect(document.activeElement).toBe(
        container.querySelector(".luckysheet-cell-input")
      );
    });

    it("applies a typed colour when Confirm is what closes the menu", async () => {
      // The same path with a value that cannot be confused with a default, so
      // a stale `#000000` left over from anywhere else would fail this.
      let sheets: any;
      const { getByRole, getByText } = render(
        <Workbook
          data={[{ name: "Sheet1" }]}
          onChange={(data) => {
            sheets = data;
          }}
        />
      );
      const { submenu } = openChangeColor(getByRole, getByText);
      const swatch = submenu.querySelector<HTMLInputElement>(
        'input[type="color"]'
      )!;
      fireEvent.change(swatch, { target: { value: "#123456" } });

      const confirm = within(submenu)
        .getByText("OK")
        .closest('[role="button"]') as HTMLElement;
      fireEvent.click(confirm);

      expect(sheets?.[0]?.color).toBe("#123456");
      expect(status()).toContain("#123456");
      expect(menuIsOpen()).toBe(false);
    });

    it("leaves the announcement readable after the menu has gone", () => {
      // The whole reason the region lives outside the menu. Confirm applies the
      // colour and closes in one commit; a region inside that subtree would be
      // detached before a screen reader ever read it.
      const { getByRole, getByText } = render(
        <Workbook data={[{ name: "Sheet1" }]} />
      );
      const { submenu } = openChangeColor(getByRole, getByText);

      const confirm = within(submenu)
        .getByText("OK")
        .closest('[role="button"]') as HTMLElement;
      fireEvent.click(confirm);

      const region = document.querySelector("#sr-sheetColor");
      expect(menuIsOpen()).toBe(false);
      expect(region).toBeTruthy();
      expect(region!.getAttribute("role")).toBe("status");
      expect(region!.textContent).toContain("Sheet color:");
    });

    it("keeps the same live-region node across the close, not a fresh one", () => {
      // The assertion above passes either way, and the guarantee is subtle
      // enough to lose by accident: the open and closed branches return
      // different shapes, and it is only React unwrapping an unkeyed top-level
      // fragment that makes both reconcile a bare div at index 0 with the same
      // key and type. Give the region a key, or wrap it in an element, and the
      // node is replaced — a screen reader then reads nothing, silently.
      const { getByRole, getByText } = render(
        <Workbook data={[{ name: "Sheet1" }]} />
      );
      const { submenu } = openChangeColor(getByRole, getByText);
      const before = document.querySelector("#sr-sheetColor");

      const confirm = within(submenu)
        .getByText("OK")
        .closest('[role="button"]') as HTMLElement;
      fireEvent.click(confirm);

      expect(before).toBeTruthy();
      expect(document.querySelector("#sr-sheetColor")).toBe(before);
    });
  });

  describe("the other ways a colour is applied", () => {
    it("announces a swatch pick by the colour's name, not its hex", () => {
      const { getByRole, getByText } = render(
        <Workbook data={[{ name: "Sheet1" }]} />
      );
      const { submenu } = openChangeColor(getByRole, getByText);

      const swatches = submenu.querySelectorAll<HTMLElement>('[role="option"]');
      expect(swatches.length).toBeGreaterThan(0);
      const name = swatches[0].getAttribute("aria-label")!;
      fireEvent.click(swatches[0]);

      expect(status()).toContain(name);
      // A hex read out character by character is the noise the palette names
      // exist to avoid; it must not leak into the announcement either.
      expect(status()).not.toContain("#");
      // Picking is not confirming — the user may be trying several.
      expect(menuIsOpen()).toBe(true);
    });

    it("announces the reset row as a removal", () => {
      const { getByRole, getByText } = render(
        <Workbook data={[{ name: "Sheet1" }]} />
      );
      const { submenu } = openChangeColor(getByRole, getByText);

      const reset = submenu.querySelector<HTMLElement>(".color-reset")!;
      fireEvent.click(reset);

      expect(status()).toContain("Sheet color removed.");
    });

    it("re-announces the same colour picked twice running", () => {
      // A live region is silent when written identical text, and re-applying
      // one colour is an obvious thing to do. Same modulo-2 marker the other
      // announcement hooks use: the text differs, the speech does not.
      const { getByRole, getByText } = render(
        <Workbook data={[{ name: "Sheet1" }]} />
      );
      const { submenu } = openChangeColor(getByRole, getByText);

      const swatch = submenu.querySelector<HTMLElement>('[role="option"]')!;
      fireEvent.click(swatch);
      const first = status();
      fireEvent.click(swatch);
      const second = status();

      expect(second).not.toBe(first);
      expect(second.replace(/\u200B/g, "")).toBe(first.replace(/\u200B/g, ""));
    });
  });

  describe("the typed-colour field", () => {
    // The native colour swatch opens the browser's own picker, whose saturation
    // handle answers the mouse and not the keyboard — browser chrome this repo
    // cannot reach into. Choosing an arbitrary colour was therefore pointer-only
    // (WCAG 2.1.1). This field is the keyboard route to the same outcome; the
    // palette grid covers only its 64 fixed colours.
    const hexField = (root: HTMLElement) =>
      root.querySelector<HTMLInputElement>(".fortune-color-hex-input")!;

    it("is present and named", () => {
      const { getByRole, getByText } = render(
        <Workbook data={[{ name: "Sheet1" }]} />
      );
      const { submenu } = openChangeColor(getByRole, getByText);

      expect(hexField(submenu).getAttribute("aria-label")).toBe("Hex color");
    });

    it("applies a typed colour on Enter, without a pointer", () => {
      const { getByRole, getByText } = render(
        <Workbook data={[{ name: "Sheet1" }]} />
      );
      const { submenu } = openChangeColor(getByRole, getByText);
      const field = hexField(submenu);

      // Deliberately a colour the palette does not contain — that is the whole
      // point of the field, and it also proves the announcement falls back to
      // the hex rather than silently naming some near neighbour.
      fireEvent.focus(field);
      fireEvent.change(field, { target: { value: "#123456" } });
      fireEvent.keyDown(field, { key: "Enter" });

      expect(status()).toContain("#123456");
    });

    it("announces a typed colour by name when the palette has one", () => {
      const { getByRole, getByText } = render(
        <Workbook data={[{ name: "Sheet1" }]} />
      );
      const { submenu } = openChangeColor(getByRole, getByText);
      const field = hexField(submenu);

      fireEvent.focus(field);
      fireEvent.change(field, { target: { value: "#3d85c6" } });
      fireEvent.keyDown(field, { key: "Enter" });

      expect(status()).toContain("Dark blue 1");
    });

    it("accepts the shorthand and normalises it", () => {
      const { getByRole, getByText } = render(
        <Workbook data={[{ name: "Sheet1" }]} />
      );
      const { submenu } = openChangeColor(getByRole, getByText);
      const field = hexField(submenu);

      fireEvent.focus(field);
      fireEvent.change(field, { target: { value: "abc" } });
      fireEvent.keyDown(field, { key: "Enter" });

      expect(status()).toContain("#aabbcc");
    });

    it("ignores text that is not a colour, and restores the last good value", () => {
      // Silence rather than an error: the field is typed into a character at a
      // time, so every prefix of a valid colour would otherwise be a mistake.
      const { getByRole, getByText } = render(
        <Workbook data={[{ name: "Sheet1" }]} />
      );
      const { submenu } = openChangeColor(getByRole, getByText);
      const field = hexField(submenu);

      fireEvent.focus(field);
      fireEvent.change(field, { target: { value: "not a colour" } });
      fireEvent.keyDown(field, { key: "Enter" });

      // Nothing applied, and the field is put back to the colour that is
      // actually in force rather than left holding text that is not one.
      expect(status()).toBe("");
      expect(field.value).toBe("#000000");
    });

    it("leaves the sheet alone when the field is only tabbed through", () => {
      // The field sits between the swatch and Confirm in the tab order, so a
      // keyboard user cannot reach OK without passing through it. Committing on
      // every blur made that traversal apply a colour and announce it — the
      // seeded draft is itself a valid hex, so no typing was needed. Confirm is
      // what applies here, exactly as it is for the swatch beside it.
      let sheets: any;
      const { getByRole, getByText } = render(
        <Workbook
          data={[{ name: "Sheet1" }]}
          onChange={(data) => {
            sheets = data;
          }}
        />
      );
      const { submenu } = openChangeColor(getByRole, getByText);
      const field = hexField(submenu);

      fireEvent.focus(field);
      fireEvent.blur(field);

      expect(status()).toBe("");
      expect(sheets?.[0]?.color).toBeUndefined();
    });

    it("applies a colour the user did type on the way out, not only on Enter", () => {
      // The counter-path: leaving the field is still a commit when there is
      // something to commit, so the inertness above is about the pristine
      // field and not about blur.
      let sheets: any;
      const { getByRole, getByText } = render(
        <Workbook
          data={[{ name: "Sheet1" }]}
          onChange={(data) => {
            sheets = data;
          }}
        />
      );
      const { submenu } = openChangeColor(getByRole, getByText);
      const field = hexField(submenu);

      fireEvent.focus(field);
      fireEvent.change(field, { target: { value: "#123456" } });
      fireEvent.blur(field);

      expect(status()).toContain("#123456");
      expect(sheets?.[0]?.color).toBe("#123456");
    });

    it("survives the pointer wandering off the row mid-entry", () => {
      // The row closes this submenu on mouseleave unless something inside it
      // reports being in use, and only the native swatch was reporting it. The
      // submenu also opens on hover, so a pointer-opened menu plus a click into
      // this field plus any movement off the row unmounted the field and threw
      // the typed value away.
      const { getByRole, getByText } = render(
        <Workbook data={[{ name: "Sheet1" }]} />
      );
      const { colorRow, submenu } = openChangeColor(getByRole, getByText);
      const menuId = colorRow.getAttribute("aria-controls")!;
      const row = colorRow.parentElement!;

      fireEvent.focus(hexField(submenu));
      fireEvent.mouseLeave(row);

      expect(document.getElementById(menuId)).not.toBeNull();
    });

    it("does not hold the submenu open once the field is done with", () => {
      // The counter-path to the guard: an idle field must not turn the row into
      // a menu that will not close.
      const { getByRole, getByText } = render(
        <Workbook data={[{ name: "Sheet1" }]} />
      );
      const { colorRow, submenu } = openChangeColor(getByRole, getByText);
      const menuId = colorRow.getAttribute("aria-controls")!;
      const row = colorRow.parentElement!;
      const field = hexField(submenu);

      fireEvent.focus(field);
      fireEvent.blur(field);
      fireEvent.mouseLeave(row);

      expect(document.getElementById(menuId)).toBeNull();
    });
  });

  describe("the toolbar's custom-colour popup", () => {
    it("names its colour swatch the same way", () => {
      const { getByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);

      // font-color is a split button: the main half applies the last colour,
      // the arrow is what opens the popup, so it keeps its own name and role.
      const arrow = getByRole("button", { name: "Font color: Dropdown" });
      fireEvent.mouseDown(arrow);

      const swatch = document.querySelector<HTMLInputElement>(
        '#fortune-custom-color input[type="color"]'
      );
      // The popup only exists once opened; if the trigger shape changes this
      // asserts nothing rather than passing vacuously.
      expect(swatch).toBeTruthy();
      const labelId = swatch!.getAttribute("aria-labelledby");
      expect(labelId).toBeTruthy();
      expect(document.getElementById(labelId!)?.textContent).toContain(
        "CUSTOM"
      );
    });

    it("announces the colour it applies to the cells", async () => {
      // Applying a colour only repaints, so this was as silent as the sheet-tab
      // one. It rides the toolbar's own status region, which C1 added and which
      // outlives the popup for the same reason #sr-sheetColor does.
      const { container, getByRole } = render(
        <Workbook data={[{ name: "Sheet1" }]} />
      );

      // Moved off A1 first so the colour lands somewhere deliberate rather
      // than on whatever the sheet mounted with.
      const cellInput = container.querySelector<HTMLElement>(
        ".luckysheet-cell-input"
      )!;
      cellInput.focus();
      fireEvent.keyDown(cellInput, { key: "ArrowDown", keyCode: 40 });
      await tick();

      const arrow = getByRole("button", { name: "Font color: Dropdown" });
      fireEvent.mouseDown(arrow);

      const swatch = document.querySelector<HTMLElement>(
        '#fortune-custom-color [role="option"]'
      )!;
      const name = swatch.getAttribute("aria-label")!;
      fireEvent.click(swatch);
      await tick();

      const toolbarRegion = document.querySelector("#sr-toolbar");
      if (!toolbarRegion) throw new Error("#sr-toolbar is not in the document");
      const toolbarStatus = toolbarRegion.textContent ?? "";
      expect(toolbarStatus).toContain("Text color:");
      expect(toolbarStatus).toContain(name);
    });
  });
  describe("the palette's selected option", () => {
    it("marks the colour that is currently in force", () => {
      // aria-selected was a constant false on all 64 options, which is not a
      // neutral answer but a positive claim that the listbox has no selection.
      const { getByRole, getByText } = render(
        <Workbook data={[{ name: "Sheet1", color: "#674ea7" }]} />
      );
      const { submenu } = openChangeColor(getByRole, getByText);

      const options = Array.from(
        submenu.querySelectorAll<HTMLElement>('[role="option"]')
      );
      const selected = options.filter(
        (o) => o.getAttribute("aria-selected") === "true"
      );

      expect(selected).toHaveLength(1);
      expect(selected[0].getAttribute("aria-label")).toBe(
        options
          .find((o) => o.style.backgroundColor === "rgb(103, 78, 167)")!
          .getAttribute("aria-label")
      );
    });

    it("puts the palette's tab stop on that colour rather than on black", () => {
      // Seeded from the applied colour, so the first Tab into the listbox lands
      // on the option a listbox is expected to open on.
      const { getByRole, getByText } = render(
        <Workbook data={[{ name: "Sheet1", color: "#674ea7" }]} />
      );
      const { submenu } = openChangeColor(getByRole, getByText);

      const tabbable = Array.from(
        submenu.querySelectorAll<HTMLElement>('[role="option"]')
      ).filter((o) => o.getAttribute("tabindex") === "0");

      expect(tabbable).toHaveLength(1);
      expect(tabbable[0].getAttribute("aria-selected")).toBe("true");
    });

    it("claims no selection when the sheet has no colour", () => {
      // The counter-path: a palette that always marks something would be as
      // wrong as one that never does.
      const { getByRole, getByText } = render(
        <Workbook data={[{ name: "Sheet1" }]} />
      );
      const { submenu } = openChangeColor(getByRole, getByText);

      expect(
        submenu.querySelectorAll('[role="option"][aria-selected="true"]')
      ).toHaveLength(0);
    });
  });

  describe("the submenu's in-use flag", () => {
    it("is released when Escape closes the menu from inside the field", () => {
      // `onEditingChange(false)` only ever came from `onBlur`, and removing a
      // focused node fires no blur. Escape is capture-phase, so it unmounted
      // the menu with the field still focused and left `isShowInputColor`
      // stuck true — after which the colour row's mouseleave guard never
      // closed the submenu again for the workbook's lifetime.
      const { getByRole, getByText } = render(
        <Workbook data={[{ name: "Sheet1" }]} />
      );
      const { colorRow, submenu } = openChangeColor(getByRole, getByText);

      const field = submenu.querySelector<HTMLInputElement>(
        ".fortune-color-hex-input"
      )!;
      field.focus();
      fireEvent.focus(field);
      fireEvent.keyDown(field, { key: "Escape" });

      // Reopen, and the row must still be able to close itself on mouseleave.
      fireEvent.keyDown(colorRow, { key: "Enter" });
      fireEvent.mouseLeave(colorRow);

      expect(document.querySelector("#fortune-change-color")).toBeNull();
    });

    it("still holds the menu open while the field is genuinely being typed in", () => {
      // The counter-path, so the release above cannot become "the menu closes
      // out from under the field", which is the bug it was added to fix.
      const { getByRole, getByText } = render(
        <Workbook data={[{ name: "Sheet1" }]} />
      );
      const { colorRow, submenu } = openChangeColor(getByRole, getByText);

      const field = submenu.querySelector<HTMLInputElement>(
        ".fortune-color-hex-input"
      )!;
      fireEvent.focus(field);
      fireEvent.mouseLeave(colorRow);

      expect(document.querySelector("#fortune-change-color")).not.toBeNull();
    });
  });
});
