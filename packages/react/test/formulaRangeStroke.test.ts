import { readFileSync } from "fs";
import { join } from "path";

import {
  STROKE_PATTERNS,
  strokePatternFor,
  strokeStyle,
} from "../src/components/SheetOverlay/strokePattern";

// The second channel on the formula range box. Colour alone cannot say which
// range belongs to which reference once the hues get close, and it says nothing
// at all in greyscale or under colour-vision deficiency.

describe("strokePatternFor", () => {
  it("cycles solid, dashed, dotted", () => {
    expect([0, 1, 2, 3, 4, 5].map(strokePatternFor)).toEqual([
      "solid",
      "dashed",
      "dotted",
      "solid",
      "dashed",
      "dotted",
    ]);
  });

  it("never runs off the end of the pattern list", () => {
    // The call sites index `colors` raw, so a long formula can hand us an index
    // past every array in play. The pattern must still resolve.
    expect(STROKE_PATTERNS).toContain(strokePatternFor(1000));
  });

  it("falls back to solid for indices that are not usable", () => {
    expect(strokePatternFor(-1)).toBe("solid");
    expect(strokePatternFor(NaN)).toBe("solid");
  });
});

describe("strokeStyle", () => {
  it("leaves the first reference rendering exactly as it did before", () => {
    // Most formulas have one to three references, and the first is by far the
    // most common thing on screen: it must not acquire a gradient.
    const style = strokeStyle(0, "#ae031e", "top");

    expect(style).toEqual({ backgroundColor: "#ae031e" });
    expect(style.backgroundImage).toBeUndefined();
  });

  it("drops the fill on a patterned strip so the gaps stay gaps", () => {
    // A background colour behind the gradient would show through and the strip
    // would read as solid again - the channel would silently do nothing.
    const style = strokeStyle(1, "#0c7578", "top");

    expect(style.backgroundColor).toBe("transparent");
    expect(style.backgroundImage).toContain("#0c7578");
  });

  it("runs the dashes along the strip, not across it", () => {
    expect(strokeStyle(1, "#0c7578", "top").backgroundImage).toContain(
      "to right"
    );
    expect(strokeStyle(1, "#0c7578", "bottom").backgroundImage).toContain(
      "to right"
    );
    expect(strokeStyle(1, "#0c7578", "left").backgroundImage).toContain(
      "to bottom"
    );
    expect(strokeStyle(1, "#0c7578", "right").backgroundImage).toContain(
      "to bottom"
    );
  });

  it("gives dotted a shorter on-length than dashed", () => {
    const dashed = strokeStyle(1, "#0c7578", "top").backgroundImage ?? "";
    const dotted = strokeStyle(2, "#0c7578", "top").backgroundImage ?? "";

    expect(dashed).toContain("6px");
    expect(dotted).toContain("2px");
    expect(dashed).not.toEqual(dotted);
  });

  it("stays solid when no colour is available", () => {
    // `backgroundColor` arrives from context and is typed as possibly absent;
    // a gradient built on `undefined` would paint a literal "undefined" stop.
    expect(strokeStyle(1, undefined, "top")).toEqual({
      backgroundColor: undefined,
    });
  });
});

describe("the range box is actually wired to strokeStyle", () => {
  // Everything above tests `strokeStyle` in isolation, which leaves the call
  // site unguarded: reverting the four border strips in SheetOverlay back to
  // `style={{ backgroundColor }}` would delete the whole feature and keep this
  // suite green. Asserted on the source rather than on a render because
  // SheetOverlay has no test harness in this package - it takes the full
  // workbook context, a canvas 2d context and half a dozen refs - and a guard
  // that only holds when a 400-line fixture is correct is not much of a guard.
  const OVERLAY = readFileSync(
    join(__dirname, "../src/components/SheetOverlay/index.tsx"),
    "utf-8"
  ).replace(/\s+/g, " ");

  it("styles the four border strips through strokeStyle", () => {
    expect(OVERLAY).toContain(
      "className={`fortune-selection-copy-${d} fortune-copy`} style={strokeStyle(rangeIndex, backgroundColor, d)}"
    );
  });

  it("maps the strips over all four edges, in the order strokeStyle expects", () => {
    // `strokeStyle` picks the gradient axis from the edge name, so a strip
    // rendered under the wrong `data-type` would run its dashes across the
    // strip instead of along it.
    expect(OVERLAY).toContain(
      '(["top", "right", "bottom", "left"] as StrokeEdge[]).map('
    );
  });

  it("leaves the corner handles on a plain fill", () => {
    // The handles are 4px squares. A dash pattern at that size is noise, and
    // the box already carries the channel on its edges.
    expect(OVERLAY).toContain(
      'className="fortune-selection-copy-hc" style={{ backgroundColor }}'
    );
  });
});
