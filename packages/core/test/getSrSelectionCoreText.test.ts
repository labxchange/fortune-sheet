import { getSrSelectionCoreText, Context } from "../src";
import { contextFactory, selectionFactory } from "./factories/context";

// The comparison key Toolbar's withFocusReturn reads before and after a
// command, so it can tell whether the command touched the same thing
// #sr-selection (SheetOverlay) announces from -- and if so, skip its own
// announcement rather than repeating one #sr-selection already made.
describe("getSrSelectionCoreText", () => {
  it("returns the range and the focused cell's displayed value", () => {
    const ctx = contextFactory({
      luckysheet_select_save: selectionFactory([0, 0], [0, 0], 0, 0),
      luckysheetfile: [
        {
          name: "sheet",
          id: "id_1",
          order: 0,
          data: [[{ v: 30, m: "30" }]],
        },
      ],
    }) as Context;

    expect(getSrSelectionCoreText(ctx)).toBe("A1 30");
  });

  it("changes when the selection moves, even to an equally empty cell", () => {
    const base = contextFactory({
      luckysheetfile: [
        {
          name: "sheet",
          id: "id_1",
          order: 0,
          data: [
            [null, null],
            [null, null],
          ],
        },
      ],
    });
    const before = getSrSelectionCoreText({
      ...base,
      luckysheet_select_save: selectionFactory([0, 0], [0, 0], 0, 0),
    } as Context);
    const after = getSrSelectionCoreText({
      ...base,
      luckysheet_select_save: selectionFactory([1, 1], [1, 1], 1, 1),
    } as Context);

    expect(before).not.toBe(after);
  });

  it("changes when the cell's value changes but the selection does not -- an undo restoring content", () => {
    const selection = selectionFactory([0, 0], [0, 0], 0, 0);
    const before = getSrSelectionCoreText(
      contextFactory({
        luckysheet_select_save: selection,
        luckysheetfile: [
          { name: "sheet", id: "id_1", order: 0, data: [[null]] },
        ],
      }) as Context
    );
    const after = getSrSelectionCoreText(
      contextFactory({
        luckysheet_select_save: selection,
        luckysheetfile: [
          {
            name: "sheet",
            id: "id_1",
            order: 0,
            data: [[{ v: "restored", m: "restored" }]],
          },
        ],
      }) as Context
    );

    expect(before).not.toBe(after);
  });

  it("stays the same across a formatting command that touches neither", () => {
    const selection = selectionFactory([0, 0], [0, 0], 0, 0);
    const file = [
      {
        name: "sheet",
        id: "id_1",
        order: 0,
        data: [[{ v: 30, m: "30" }]],
      },
    ];
    const before = getSrSelectionCoreText(
      contextFactory({
        luckysheet_select_save: selection,
        luckysheetfile: file,
      }) as Context
    );
    // Bold: a fresh luckysheetfile reference (as immer would produce), same
    // selection, same displayed value -- only a format flag changed.
    const after = getSrSelectionCoreText(
      contextFactory({
        luckysheet_select_save: selection,
        luckysheetfile: [{ ...file[0], data: [[{ v: 30, m: "30", bl: 1 }]] }],
      }) as Context
    );

    expect(before).toBe(after);
  });

  it("returns an empty string when there is no addressable selection", () => {
    const ctx = contextFactory({
      luckysheet_select_save: [],
    }) as Context;

    expect(getSrSelectionCoreText(ctx)).toBe("");
  });
});
