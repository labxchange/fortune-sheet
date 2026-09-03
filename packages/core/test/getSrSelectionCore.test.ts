import { getSrSelectionCore, Context } from "../src";
import { contextFactory, selectionFactory } from "./factories/context";

// The two raw fields SheetOverlay builds #sr-selection's display text from,
// and the comparison key Toolbar's withFocusReturn reads before and after a
// command -- so it can tell whether the command touched the same thing
// #sr-selection announces from, and if so, skip its own announcement rather
// than repeating one #sr-selection already made.
describe("getSrSelectionCore", () => {
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

    expect(getSrSelectionCore(ctx)).toEqual({
      rangeText: "A1",
      cellValue: "30",
    });
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
    const before = getSrSelectionCore({
      ...base,
      luckysheet_select_save: selectionFactory([0, 0], [0, 0], 0, 0),
    } as Context);
    const after = getSrSelectionCore({
      ...base,
      luckysheet_select_save: selectionFactory([1, 1], [1, 1], 1, 1),
    } as Context);

    expect(before).not.toEqual(after);
  });

  it("changes when the cell's value changes but the selection does not -- an undo restoring content", () => {
    const selection = selectionFactory([0, 0], [0, 0], 0, 0);
    const before = getSrSelectionCore(
      contextFactory({
        luckysheet_select_save: selection,
        luckysheetfile: [
          { name: "sheet", id: "id_1", order: 0, data: [[null]] },
        ],
      }) as Context
    );
    const after = getSrSelectionCore(
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

    expect(before).not.toEqual(after);
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
    const before = getSrSelectionCore(
      contextFactory({
        luckysheet_select_save: selection,
        luckysheetfile: file,
      }) as Context
    );
    // Bold: a fresh luckysheetfile reference (as immer would produce), same
    // selection, same displayed value -- only a format flag changed.
    const after = getSrSelectionCore(
      contextFactory({
        luckysheet_select_save: selection,
        luckysheetfile: [{ ...file[0], data: [[{ v: 30, m: "30", bl: 1 }]] }],
      }) as Context
    );

    expect(before).toEqual(after);
  });

  it("returns empty fields together when there is no addressable selection", () => {
    const ctx = contextFactory({
      luckysheet_select_save: [],
    }) as Context;

    expect(getSrSelectionCore(ctx)).toEqual({ rangeText: "", cellValue: "" });
  });

  it("returns empty fields together when focus is present but the row/column indices are not, rather than defaulting the cell lookup to 0", () => {
    const ctx = contextFactory({
      luckysheet_select_save: [
        {
          row: [0, 0],
          column: [0, 0],
          row_focus: undefined,
          column_focus: undefined,
        },
      ],
      luckysheetfile: [
        {
          name: "sheet",
          id: "id_1",
          order: 0,
          data: [[{ v: 30, m: "30" }]],
        },
      ],
    }) as unknown as Context;

    expect(getSrSelectionCore(ctx)).toEqual({ rangeText: "", cellValue: "" });
  });

  it('collapses a literal numeric 0 to an empty string, not the text "0"', () => {
    const ctx = contextFactory({
      luckysheet_select_save: selectionFactory([0, 0], [0, 0], 0, 0),
      luckysheetfile: [
        {
          name: "sheet",
          id: "id_1",
          order: 0,
          data: [[{ v: 0, m: 0 }]],
        },
      ],
    }) as Context;

    expect(getSrSelectionCore(ctx).cellValue).toBe("");
  });

  it("stringifies a non-zero numeric .m", () => {
    const ctx = contextFactory({
      luckysheet_select_save: selectionFactory([0, 0], [0, 0], 0, 0),
      luckysheetfile: [
        {
          name: "sheet",
          id: "id_1",
          order: 0,
          data: [[{ v: 42, m: 42 }]],
        },
      ],
    }) as Context;

    expect(getSrSelectionCore(ctx).cellValue).toBe("42");
  });
});
