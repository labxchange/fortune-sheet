import { render } from "@testing-library/react";
import { Context, locale } from "@fortune-sheet/core";
import React from "react";
import Workbook from "../src/components/Workbook";

const { info } = locale({ lang: "en" } as unknown as Context);

// WCAG 4.1.2 for the in-cell editor.
//
// The formula bar has been named and typed since "Fixed a11y DOM standards";
// the in-cell editor never was, and the difference is audible. Without a role a
// contenteditable is exposed as a generic container rather than a field with a
// value, so a reader falls back to the container's hypertext, in which every
// child that is its own accessibility object is substituted with U+FFFC. A
// formula is exactly that — a run of coloured spans — so VoiceOver announced
// "object replacement character" for the first presses of a reference pick and
// only reached the reference names once the polite region got its turn.
type RenderOptions = {
  allowEdit?: boolean;
  config?: Record<string, any>;
  celldata?: any[];
};

describe("in-cell editor name and role", () => {
  const renderSheet = ({
    allowEdit = true,
    config,
    celldata,
  }: RenderOptions = {}) =>
    render(
      <Workbook
        lang="en"
        allowEdit={allowEdit}
        data={[{ name: "Sheet1", id: "s1", config, celldata } as any]}
      />
    );

  const editor = () =>
    document.getElementById("luckysheet-rich-text-editor") as HTMLElement;

  it("exposes the editor as a named text field", () => {
    renderSheet();
    expect(editor().getAttribute("role")).toBe("textbox");
    expect(editor().getAttribute("aria-label")).toBe(info.cellEditor);
  });

  it("does not reuse the formula bar's name", () => {
    // Both fields hold the same text and are both in the DOM at once, so one
    // shared name would announce two indistinguishable "Current cell input"
    // text fields.
    renderSheet();
    const fxInput = document.getElementById(
      "luckysheet-functionbox-cell"
    ) as HTMLElement;
    expect(fxInput.getAttribute("aria-label")).toBe(info.currentCellInput);
    expect(editor().getAttribute("aria-label")).not.toBe(
      fxInput.getAttribute("aria-label")
    );
  });

  it("claims neither role nor name when the cell cannot be edited", () => {
    // role="textbox" on a div whose contenteditable is false would be a lie,
    // and an unusable field is worse than an unnamed container.
    // ctx.config is the current sheet's config, so it is set on the sheet.
    renderSheet({ config: { colReadOnly: { 0: 1 } } });
    expect(editor().getAttribute("contenteditable")).toBe("false");
    expect(editor().getAttribute("role")).toBeNull();
    expect(editor().getAttribute("aria-label")).toBeNull();
  });

  it("claims neither role nor name on a read-only workbook", () => {
    // The regression this file exists to prevent. `edit`, the local predicate
    // the ARIA first hung off, reads
    //   !((colReadOnly[c] || rowReadOnly[r]) && ctx.allowEdit === true)
    // so with allowEdit={false} and no per-column config it is
    // `undefined && false` -> falsy -> negated -> TRUE. Gating on it named the
    // editor "Cell editor, edit text" on a workbook nothing can be typed into,
    // and the colReadOnly case above passes either way, so it proved nothing.
    renderSheet({ allowEdit: false });
    expect(editor().getAttribute("role")).toBeNull();
    expect(editor().getAttribute("aria-label")).toBeNull();
  });

  it("claims neither role nor name when the cell is locked", () => {
    // The other branch `edit` never consulted: checkCellIsLocked.
    renderSheet({ celldata: [{ r: 0, c: 0, v: { v: "locked", lo: 1 } }] });
    expect(editor().getAttribute("role")).toBeNull();
    expect(editor().getAttribute("aria-label")).toBeNull();
  });

  it("leaves aria-multiline unset", () => {
    // textbox already defaults to single-line, and the editor can display a
    // pasted multi-line inline string — so asserting false would add a claim
    // without adding information. The formula bar omits it for the same reason.
    renderSheet();
    expect(editor().hasAttribute("aria-multiline")).toBe(false);
  });
});
