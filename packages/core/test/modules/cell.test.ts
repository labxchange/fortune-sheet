// `updateCell` comes from the barrel, not from `../../src/modules/cell`, and
// that is load-bearing. `Context` is a type, so Babel elides its import
// entirely; if the only surviving import were the deep one, it would start
// initialising the module graph partway and `factories/context` would then
// read `FormulaCache` off a half-initialised barrel -- "FormulaCache is not a
// constructor". Importing a value from the barrel makes it initialise first.
import { Context, updateCell } from "../../src";
import { contextFactory, selectionFactory } from "../factories/context";

// `updateCell` used to return nothing on every path, so a caller could not
// tell an accepted write from one data verification had refused. Both keyboard
// commit paths needed that distinction to stop stepping away from a cell whose
// input had just been rejected.
//
// The distinction it reports is deliberately "refused", not "wrote": several of
// the early returns are no-ops (value unchanged, empty cell left empty), and a
// no-op is a request that succeeded. Keying caret movement to "did bytes
// change" would strand the caret whenever a value was re-entered unchanged.
describe("updateCell's result", () => {
  // `type: "dropdown"` keeps the fixture small -- its failure text is a fixed
  // string, so no `ctx.dataVerification.optionLabel_*` table is needed.
  const withRule = () =>
    contextFactory({
      luckysheet_select_save: selectionFactory([0, 0], [0, 0], 0, 0),
      luckysheetfile: [
        {
          name: "sheet",
          id: "id_1",
          order: 0,
          data: [
            [{ v: "yes" }, { v: "yes" }],
            [{ v: "yes" }, { v: "yes" }],
          ],
          dataVerification: {
            "0_0": {
              type: "dropdown",
              value1: "yes,no",
              prohibitInput: true,
            },
          },
        },
      ],
    } as any) as Context;

  const editing = (text: string) => {
    const cellInput = document.createElement("div");
    cellInput.innerText = text;
    return cellInput;
  };

  it("reports a refusal, with its reason, when prohibited input is rejected", () => {
    const ctx = withRule();

    const result = updateCell(ctx, 0, 0, editing("maybe"));

    expect(result).toEqual({ refused: true, reason: "dataVerification" });
    // Paired with the refusal so the assertion above cannot pass against a
    // function that refuses everything: the cell must be genuinely unwritten.
    expect(ctx.luckysheetfile[0].data![0][0]!.v).toBe("yes");
  });

  it("reports no refusal for a value the rule accepts", () => {
    const ctx = withRule();

    const result = updateCell(ctx, 0, 0, editing("no"));

    expect(result).toEqual({ refused: false });
    expect(ctx.luckysheetfile[0].data![0][0]!.v).toBe("no");
  });

  // The no-op path. This is the assertion that pins the "refused" semantics:
  // nothing is written, yet the caller must still be told it may advance.
  it("reports no refusal when the value is unchanged", () => {
    const ctx = withRule();

    const result = updateCell(ctx, 0, 1, editing("yes"));

    expect(result).toEqual({ refused: false });
  });

  // A host veto is not a refusal for movement purposes: it shows the user no
  // dialog, so holding the caret there would give a keyboard user no feedback
  // and no explanation.
  it("reports no refusal when the beforeUpdateCell hook vetoes the write", () => {
    const ctx = withRule();
    const beforeUpdateCell = jest.fn().mockReturnValue(false);
    ctx.hooks.beforeUpdateCell = beforeUpdateCell;

    const result = updateCell(ctx, 0, 1, editing("no"));

    expect(beforeUpdateCell).toHaveBeenCalled();
    expect(result).toEqual({ refused: false });
    // The veto still has to prevent the write -- otherwise this test would
    // pass against a hook that had stopped being consulted at all.
    expect(ctx.luckysheetfile[0].data![0][1]!.v).toBe("yes");
  });
});
