import { render, fireEvent, act } from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";

// After an editing command from the toolbar, focus belongs on the cells it
// acted on rather than on the control that ran it (WCAG 2.4.3): select B5, bold
// it, and the next arrow key should move from B5, not along the toolbar.
describe("Toolbar commands return focus to the cells they act on", () => {
  // A sheet with something in it: a formatting command applied to an empty
  // grid writes nothing, and "nothing changed" is deliberately the case where
  // focus stays put.
  const sheet = {
    name: "Sheet1",
    id: "s1",
    row: 10,
    column: 8,
    celldata: [
      {
        r: 0,
        c: 0,
        v: { v: "alpha", m: "alpha", ct: { fa: "General", t: "s" } },
      },
      {
        r: 0,
        c: 1,
        v: { v: "beta", m: "beta", ct: { fa: "General", t: "s" } },
      },
    ],
  };

  const setup = () => {
    const rendered = render(<Workbook lang="en" data={[sheet as any]} />);
    const { container } = rendered;
    const cellInput = container.querySelector<HTMLElement>(
      "#luckysheet-rich-text-editor"
    )!;
    const button = (label: string) =>
      container.querySelector<HTMLElement>(
        `.fortune-toolbar-button[aria-label="${label}"]`
      )!;
    return { ...rendered, container, cellInput, button };
  };

  // The positive path -- a command that changes cells returns focus to them --
  // is NOT covered here. Every route tried (bold through the generic Button, a
  // colour pick through the wrapped `pick`) commits nothing under jsdom, which
  // has no canvas geometry for the formatting handlers to work against, so the
  // "nothing changed" rule correctly declines to move focus and the assertion
  // would be testing the wrong branch.
  //
  // It is verified in the browser instead (Storybook, `features--basic`):
  // focusing Bold with G34 selected and pressing Enter applies the format and
  // leaves focus on `#luckysheet-rich-text-editor` with the selection intact.
  // A jsdom or e2e positive-path test is still outstanding.

  it("leaves focus alone when the command changes nothing", async () => {
    const { button } = setup();
    // Undo with an empty history is disabled, so it commits nothing. Focus
    // must stay put: relocating the user for a command that did not run is a
    // surprise, not a fix.
    const undo = button("Undo");
    act(() => {
      undo.focus();
      fireEvent.click(undo);
    });

    // Give the deferred focus call a turn to prove it does not fire.
    await act(async () => {
      await new Promise((r) => {
        setTimeout(r, 0);
      });
    });
    expect(document.activeElement).toBe(undo);
  });

  it("never leaves focus on the body", async () => {
    const { button } = setup();
    const bold = button("Bold (Ctrl+B)");
    act(() => {
      bold.focus();
      fireEvent.click(bold);
    });

    await act(async () => {
      await new Promise((r) => {
        setTimeout(r, 0);
      });
    });
    expect(document.activeElement).not.toBe(document.body);
  });
});
