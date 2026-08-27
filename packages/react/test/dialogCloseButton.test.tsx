import { readFileSync } from "fs";
import { join } from "path";
import { render, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";

// The close (X) shared by every dialog in the package. `ShortcutsDialog` owns no
// close control — it delegates its chrome to `Dialog`, which is also what
// SearchReplace and every `showDialog` caller render through — so these cases
// exercise one shared control, reached through the shortcuts dialog because that
// is the surface it was reported on (WCAG 1.4.11: the resting icon composited to
// 1.72:1 on the white panel).
//
// jest maps CSS through identity-obj-proxy, so no stylesheet ever loads and the
// ratio itself cannot be asserted from a render. What a render can prove is that
// the control stays reachable, named, operable, and coloured by the shared rule
// rather than an inline value that rule could never reach. The ratio's own guard
// reads the CSS as text, at the bottom of this file.
const openShortcuts = (container: HTMLElement) => {
  const workbook = container.querySelector<HTMLElement>(".fortune-container")!;
  fireEvent.keyDown(workbook, { key: "/", code: "Slash", ctrlKey: true });
};

const SHARED_CLASS = "fortune-modal-dialog-icon-close";

describe("Dialog close button", () => {
  const openedDialog = async () => {
    const view = render(<Workbook data={[{ name: "Sheet1" }]} />);
    openShortcuts(view.container);
    await waitFor(() => view.getByRole("dialog"));
    return view;
  };

  it("exposes the close control as a button named Close", async () => {
    const { getByRole } = await openedDialog();

    // It is a `div`, not a `<button>`, so the role and the name both come from
    // attributes that can be dropped without anything looking broken.
    expect(getByRole("button", { name: "Close" })).toBeTruthy();
  });

  it("dismisses the dialog when clicked", async () => {
    const { getByRole, queryByRole } = await openedDialog();

    fireEvent.click(getByRole("button", { name: "Close" }));

    // The unconditional close path. Every other dismissal case in this suite
    // goes through Escape, which this dialog deliberately spends on clearing
    // the search box first — so nothing covered the button itself.
    await waitFor(() => expect(queryByRole("dialog")).toBeNull());
  });

  // A native <button> would get these for free; a div role="button" is operable
  // only through activateOnEnterOrSpace, so both keys need their own case.
  it("dismisses the dialog on Enter", async () => {
    const { getByRole, queryByRole } = await openedDialog();

    fireEvent.keyDown(getByRole("button", { name: "Close" }), { key: "Enter" });

    await waitFor(() => expect(queryByRole("dialog")).toBeNull());
  });

  it("dismisses the dialog on Space", async () => {
    const { getByRole, queryByRole } = await openedDialog();

    fireEvent.keyDown(getByRole("button", { name: "Close" }), { key: " " });

    await waitFor(() => expect(queryByRole("dialog")).toBeNull());
  });

  it("names the control in the workbook's language", async () => {
    const { container, getByRole } = render(
      <Workbook lang="zh" data={[{ name: "Sheet1" }]} />
    );
    openShortcuts(container);
    await waitFor(() => getByRole("dialog"));

    // `button.close` is translated in all six locales, so this asserts the
    // wiring rather than guarding a gap.
    expect(getByRole("button", { name: "关闭" })).toBeTruthy();
  });

  it("styles the icon through the shared class, not an inline value", async () => {
    const { getByRole } = await openedDialog();
    const close = getByRole("button", { name: "Close" });

    // The contrast fix is the resting `opacity` in Dialog/index.css. An inline
    // opacity or color here would win over it, and jsdom loads no CSS to
    // compare against — so asserting the inline style is empty is what catches
    // a re-dim that moves back into the markup.
    expect(close.className).toBe(SHARED_CLASS);
    expect(close.style.opacity).toBe("");
    expect(close.style.color).toBe("");
  });

  it("reaches Search and replace through the same shared class", async () => {
    const { getByRole, getAllByRole } = render(
      <Workbook data={[{ name: "Sheet1" }]} toolbarItems={["search"]} />
    );

    fireEvent.click(getByRole("button", { name: "Find and replace" }));

    // Two controls in this dialog are named "Close": the icon, and a text
    // button at the bottom. Only the icon opts into Dialog's rule, and it does
    // so by listing the class rather than by rendering a Dialog — so a rename
    // there would silently drop it back to the 1.72:1 icon while still
    // rendering and still closing.
    const named = await waitFor(() =>
      getAllByRole("button", { name: "Close" })
    );
    const sharing = named.filter((el) =>
      el.className.split(" ").includes(SHARED_CLASS)
    );
    expect(sharing).toHaveLength(1);
  });
});

// The ratio lives entirely in values jsdom never loads: a CSS `opacity` and an
// SVG attribute in a different file. Reading both as text is the only mechanism
// in this package that can fail when the icon is dimmed back below 1.4.11.
describe("the shared rule that governs the close icon's contrast", () => {
  const read = (path: string) => readFileSync(join(__dirname, path), "utf8");
  const css = read("../src/components/Dialog/index.css");

  const ruleBody = (selector: string) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
    if (!match) throw new Error(`no rule for ${selector} in Dialog/index.css`);
    return match[1];
  };

  const opacityOf = (selector: string) => {
    const match = ruleBody(selector).match(/opacity:\s*([\d.]+)/);
    return match ? Number(match[1]) : null;
  };

  // Read rather than hardcoded: the element opacity multiplies the symbol's own
  // stroke-opacity, so changing either file changes the painted ink.
  const strokeOpacity = () => {
    const svg = read("../src/components/SVGDefines.tsx");
    const start = svg.indexOf('id="close"');
    const symbol = svg.slice(start, svg.indexOf("</symbol>", start));
    const match = symbol.match(/strokeOpacity="([\d.]+)"/);
    if (!match) throw new Error("the #close symbol declares no strokeOpacity");
    return Number(match[1]);
  };

  it("keeps the resting icon clear of 3:1", () => {
    const resting = opacityOf(`.${SHARED_CLASS}`);
    expect(resting).not.toBeNull();

    // #262A33 over white reaches 3:1 at an effective alpha of about 0.50; the
    // rule shipped 0.3 x 0.9 = 0.27, which is 1.72:1.
    expect(resting! * strokeOpacity()).toBeGreaterThanOrEqual(0.5);
  });

  it("does not dim the focus ring along with the icon", () => {
    // `opacity` composites the outline too, so anything under 1 here drags the
    // ring down from 5.88:1 — it used to paint at 3.30:1 for this reason.
    expect(opacityOf(`.${SHARED_CLASS}:focus-visible`)).toBe(1);
  });
});
