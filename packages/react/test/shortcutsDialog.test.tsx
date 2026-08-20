import {
  render,
  fireEvent,
  waitFor,
  within,
  act,
} from "@testing-library/react";
import React from "react";
import Workbook, { WorkbookInstance } from "../src/components/Workbook";

const openWithShortcut = (container: HTMLElement) => {
  const workbook = container.querySelector<HTMLElement>(".fortune-container")!;
  fireEvent.keyDown(workbook, { key: "/", code: "Slash", ctrlKey: true });
};

describe("Keyboard shortcuts dialog", () => {
  it("is closed until asked for", () => {
    const { queryByRole } = render(<Workbook data={[{ name: "Sheet1" }]} />);
    expect(queryByRole("dialog")).toBeNull();
  });

  it("opens with Ctrl+/ and lists the workbook's shortcuts", async () => {
    const { container, getByRole } = render(
      <Workbook data={[{ name: "Sheet1" }]} />
    );

    openWithShortcut(container);

    const dialog = await waitFor(() => getByRole("dialog"));
    expect(within(dialog).getByText("Copy")).toBeTruthy();
    expect(within(dialog).getByText("Select entire column")).toBeTruthy();
    expect(within(dialog).getByText("Paste values only")).toBeTruthy();
  });

  it("names itself by its heading", async () => {
    const { container, getByRole } = render(
      <Workbook data={[{ name: "Sheet1" }]} />
    );

    openWithShortcut(container);

    const dialog = await waitFor(() => getByRole("dialog"));
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)?.textContent).toBe(
      "Keyboard Shortcuts"
    );
  });

  it("opens from the toolbar button too", async () => {
    const { getByRole, queryByRole } = render(
      <Workbook
        data={[{ name: "Sheet1" }]}
        toolbarItems={["keyboard-shortcuts"]}
      />
    );
    expect(queryByRole("dialog")).toBeNull();

    fireEvent.click(getByRole("button", { name: "Keyboard shortcuts" }));

    await waitFor(() => expect(getByRole("dialog")).toBeTruthy());
  });

  it("closes on Escape", async () => {
    const { container, getByRole, queryByRole } = render(
      <Workbook data={[{ name: "Sheet1" }]} />
    );

    openWithShortcut(container);
    const dialog = await waitFor(() => getByRole("dialog"));
    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => expect(queryByRole("dialog")).toBeNull());
  });

  it("appends the host application's own shortcut groups", async () => {
    const { container, getByRole } = render(
      <Workbook
        data={[{ name: "Sheet1" }]}
        extraShortcutSections={[
          {
            title: "Simulation",
            items: [
              {
                keys: { mac: "⌘ ⌥ N", windows: "Ctrl + Alt + N" },
                description: "Go to task panel",
              },
            ],
          },
        ]}
      />
    );

    openWithShortcut(container);

    const dialog = await waitFor(() => getByRole("dialog"));
    expect(within(dialog).getByText("Simulation")).toBeTruthy();
    expect(within(dialog).getByText("Go to task panel")).toBeTruthy();
    // The host's group is appended, not a replacement.
    expect(within(dialog).getByText("Copy")).toBeTruthy();
  });

  it("opens via the imperative API", async () => {
    const ref = React.createRef<WorkbookInstance>();
    const { getByRole, queryByRole } = render(
      <Workbook ref={ref} data={[{ name: "Sheet1" }]} />
    );
    expect(queryByRole("dialog")).toBeNull();

    act(() => ref.current!.openShortcutsDialog());

    await waitFor(() => expect(getByRole("dialog")).toBeTruthy());

    act(() => ref.current!.closeShortcutsDialog());
    await waitFor(() => expect(queryByRole("dialog")).toBeNull());
  });

  describe("with several workbooks on the page", () => {
    // A host can mount one workbook per scene and hide the inactive ones. Both
    // of these guard against a dialog opening somewhere the user cannot reach,
    // or two opening at once.
    it("opens only one dialog across instances", async () => {
      const { container, getAllByRole, queryAllByRole } = render(
        <>
          <Workbook data={[{ name: "Sheet1" }]} />
          <Workbook data={[{ name: "Sheet2" }]} />
        </>
      );

      const [first, second] =
        container.querySelectorAll<HTMLElement>(".fortune-container");
      fireEvent.keyDown(first, { key: "/", code: "Slash", ctrlKey: true });
      await waitFor(() => expect(getAllByRole("dialog")).toHaveLength(1));

      fireEvent.keyDown(second, { key: "/", code: "Slash", ctrlKey: true });
      await waitFor(() => expect(queryAllByRole("dialog")).toHaveLength(1));
    });

    it("refuses to open inside a hidden workbook", async () => {
      const ref = React.createRef<WorkbookInstance>();
      const { container, queryByRole } = render(
        <div aria-hidden="true">
          <Workbook ref={ref} data={[{ name: "Sheet1" }]} />
        </div>
      );
      expect(container.querySelector(".fortune-container")).toBeTruthy();

      act(() => ref.current!.openShortcutsDialog());

      await waitFor(() => expect(queryByRole("dialog")).toBeNull());
    });
  });
});
