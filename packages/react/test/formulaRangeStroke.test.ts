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
    const style = strokeStyle(0, "#c1232b", "top");

    expect(style).toEqual({ backgroundColor: "#c1232b" });
    expect(style.backgroundImage).toBeUndefined();
  });

  it("drops the fill on a patterned strip so the gaps stay gaps", () => {
    // A background colour behind the gradient would show through and the strip
    // would read as solid again - the channel would silently do nothing.
    const style = strokeStyle(1, "#27727b", "top");

    expect(style.backgroundColor).toBe("transparent");
    expect(style.backgroundImage).toContain("#27727b");
  });

  it("runs the dashes along the strip, not across it", () => {
    expect(strokeStyle(1, "#27727b", "top").backgroundImage).toContain(
      "to right"
    );
    expect(strokeStyle(1, "#27727b", "bottom").backgroundImage).toContain(
      "to right"
    );
    expect(strokeStyle(1, "#27727b", "left").backgroundImage).toContain(
      "to bottom"
    );
    expect(strokeStyle(1, "#27727b", "right").backgroundImage).toContain(
      "to bottom"
    );
  });

  it("gives dotted a shorter on-length than dashed", () => {
    const dashed = strokeStyle(1, "#27727b", "top").backgroundImage ?? "";
    const dotted = strokeStyle(2, "#27727b", "top").backgroundImage ?? "";

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
