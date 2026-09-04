import { render, act, fireEvent } from "@testing-library/react";
import React from "react";
import Workbook, { WorkbookInstance } from "../src/components/Workbook";

// `warnDialog` is a string on the context, and the effect that turns it into a
// dialog runs only when that string *changes*. Nothing cleared it, so raising
// the same warning a second time was swallowed: the user repeats the action
// that failed, gets no explanation at all, and the button reads as broken
// rather than as refusing. SheetOverlay now consumes the warning once it has
// been shown — a change touching every one of the ~30 places that write one,
// and until this file, one that could be deleted outright with the whole suite
// still green.

const textOnlyColumn = [
  { r: 0, c: 0, v: { v: "Name", m: "Name", ct: { fa: "General", t: "s" } } },
  { r: 1, c: 0, v: { v: "Ada", m: "Ada", ct: { fa: "General", t: "s" } } },
  { r: 2, c: 0, v: { v: "Grace", m: "Grace", ct: { fa: "General", t: "s" } } },
];

/** The dialog is opened from a 240ms timeout, so let it land. */
const flushDialog = async () => {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 300);
    });
  });
};

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');

describe("a warning raised twice is shown twice", () => {
  const renderSheet = () => {
    const ref = React.createRef<WorkbookInstance>();
    const view = render(
      <Workbook
        ref={ref}
        lang="en"
        toolbarItems={["quick-formula"]}
        data={[
          {
            name: "Sheet1",
            id: "s1",
            row: 10,
            column: 6,
            celldata: textOnlyColumn,
          },
        ]}
      />
    );
    return { ...view, ref };
  };

  /** Sum over a column of labels: nothing to total, and it says so. */
  const pressSum = async (getByRole: any, ref: any) => {
    act(() => {
      ref.current?.setSelection([{ row: [0, 2], column: [0, 0] }]);
    });
    act(() => {
      fireEvent.click(getByRole("button", { name: "Auto SUM" }));
    });
    await flushDialog();
  };

  const dismiss = () => {
    act(() => {
      fireEvent.click(
        document.querySelector<HTMLElement>(".fortune-message-box-button")!
      );
    });
  };

  it("explains the same refusal again the second time it happens", async () => {
    const { getByRole, ref } = renderSheet();

    await pressSum(getByRole, ref);
    expect(dialog()).toBeTruthy();
    expect(dialog()!.textContent).toContain(
      "Cannot perform this operation on a selection that contains no numbers"
    );

    dismiss();
    expect(dialog()).toBeNull();

    // The same string as last time, which is exactly the case that used to be
    // dropped: the effect's dependency never changed, so it never re-ran.
    await pressSum(getByRole, ref);
    expect(dialog()).toBeTruthy();
    expect(dialog()!.textContent).toContain(
      "Cannot perform this operation on a selection that contains no numbers"
    );
  });

  it("stays closed once dismissed, rather than reopening itself", async () => {
    // The counter-path to the fix. Clearing the warning is a write to the
    // context from the effect that reads it, so the way to get this wrong is a
    // loop: consume, re-render, show again. It must settle instead.
    const { getByRole, ref } = renderSheet();

    await pressSum(getByRole, ref);
    dismiss();
    await flushDialog();

    expect(dialog()).toBeNull();
  });
});
