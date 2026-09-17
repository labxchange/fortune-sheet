import { join } from "path";

import { contrast } from "../../../tests/colour";
import { readCssRules } from "../../../tests/cssRules";

// jest maps CSS through identity-obj-proxy, so no stylesheet ever loads and a
// render can prove nothing about colour. The rules are therefore read as text,
// the same way searchReplaceContrast.test.tsx and customSortA11y.test.tsx do.
//
// What this suite exists to catch is narrower than "the ring has a colour".
// The filter popup's Confirm button shipped with `outline-color: #fff` drawn
// 2px OUTSIDE the button, on a white panel -- 1.00:1, painted and invisible
// (WCAG 2.4.11). It got there because the rule was reasoned about as if it sat
// flush on the button's own fill. So the assertions below are written the way
// that mistake could not survive: the surface a ring is measured against is
// derived from `outline-offset`, not assumed, and the colour is checked against
// BOTH surfaces rather than whichever one the comment of the day names.
//
// customSortA11y.test.tsx:618-660 guards the sibling rule and deliberately
// asserts the offset and *not* the colour. That is the half that let this ship.

const {
  raw: CSS,
  ruleFor,
  hasRuleFor,
  declaration,
} = readCssRules(join(__dirname, "../src/components/ContextMenu/index.css"));

/** The rule that gives every control in both filter panels its ring. */
const SHARED_RING = ".fortune-filter-menu .button-basic:focus-visible";
/** The rule that recolours it for the primary (Confirm) button. */
const PRIMARY_RING =
  ".fortune-filter-menu .button-basic.button-primary:focus-visible";
/** The primary button's resting fill. */
const PRIMARY_FILL = ".fortune-filter-menu .button-primary";
/** The rule that recolours it for the destructive (Clear filter) button. */
const DANGER_RING =
  ".fortune-filter-menu .button-basic.button-danger:focus-visible";
/** The destructive button's resting fill. */
const DANGER_FILL = ".fortune-filter-menu .button-danger";
/** The panel both popups are drawn on. */
const PANEL = ".fortune-context-menu";

/** The surface the ring actually lands on, derived rather than assumed: a
 *  positive offset puts it on the panel behind the button, a negative one
 *  inside the button's own fill. This is the fact the `#fff` regression was
 *  reasoned without. */
const ringSurface = (fill: string) => {
  const offset = Number(
    ruleFor(SHARED_RING).match(/outline-offset:\s*(-?[\d.]+)px/)![1]
  );

  return offset > 0
    ? declaration(ruleFor(PANEL), "background")
    : declaration(ruleFor(fill), "background-color");
};

describe("the filter popup's button focus rings", () => {
  it("parses rules without being fooled by the comments or by a prefix", () => {
    // The two ways this suite could read the wrong thing and still pass.
    // The comment on PRIMARY_RING quotes SHARED_RING's selector verbatim.
    expect(CSS).toContain("outline-offset: 2px");
    expect(declaration(ruleFor(PANEL), "background")).toMatch(/^#/);
    // A prefix must not match: PRIMARY_FILL is a prefix of its own :hover rule,
    // whose fill is the darker one. Reading that instead would quietly assert
    // the ring against a surface the resting button never has.
    expect(declaration(ruleFor(PRIMARY_FILL), "background-color")).not.toBe(
      declaration(ruleFor(`${PRIMARY_FILL}:hover`), "background")
    );
  });

  it("sanity-checks the ratio maths against known pairs", () => {
    // A silently wrong contrast helper would pass everything below.
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 1);
    expect(contrast("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrast("#fff", "#000")).toBeCloseTo(21, 1);
    // The value this ticket rejected, against the surface it actually landed
    // on, at the ratio the ticket reported.
    expect(contrast("#fff", "#fff")).toBeLessThan(3);
  });

  it("offsets the ring clear of the button, which is what decides the surface", () => {
    // A positive offset puts the ring on the panel behind the button rather
    // than on the button's own fill. This is the fact the #fff regression was
    // reasoned without: it is the offset, not the fill, that says which colour
    // the ring has to contrast with.
    const offset = ruleFor(SHARED_RING).match(/outline-offset:\s*(-?[\d.]+)px/);
    expect(offset).not.toBeNull();
    expect(Number(offset![1])).toBeGreaterThan(0);
    expect(ruleFor(SHARED_RING)).toMatch(/outline:/);
  });

  it.each([
    ["primary (Confirm)", PRIMARY_RING, PRIMARY_FILL],
    ["destructive (Clear filter)", DANGER_RING, DANGER_FILL],
  ])(
    "the %s ring contrasts with the surface it actually lands on",
    (_name, ring, fill) => {
      // The load-bearing assertion. Fails at #fff (1.00:1) -- the reported bug
      // -- and passes at #000 (21:1). The surface is derived from the offset
      // rather than hard-coded, so flipping the ring inset re-points this check
      // instead of silently invalidating it.
      expect(
        contrast(declaration(ruleFor(ring), "outline-color"), ringSurface(fill))
      ).toBeGreaterThanOrEqual(3);
    }
  );

  it.each([
    ["primary (Confirm)", PRIMARY_RING, PRIMARY_FILL],
    ["destructive (Clear filter)", DANGER_RING, DANGER_FILL],
  ])(
    "the %s ring contrasts with the button it encloses as well",
    (_name, ring, fill) => {
      // The other reading of 1.4.11, and the one Dialog/index.css sets as the
      // standard for this same button shape: an indicator should pass whether
      // it is measured against the control it encloses or the surface beside
      // it. Black is 3.57:1 on the resting #0063c3 fill and 3.55:1 on #be2a27.
      expect(
        contrast(
          declaration(ruleFor(ring), "outline-color"),
          declaration(ruleFor(fill), "background-color")
        )
      ).toBeGreaterThanOrEqual(3);
    }
  );

  it.each([
    ["primary (Confirm)", PRIMARY_FILL],
    ["destructive (Clear filter)", DANGER_FILL],
  ])(
    "focus does not move the surface the %s ring is measured against",
    (_name, fill) => {
      // Each fill darkens on hover only. While they also darkened on
      // :focus-visible, the enclosing surface at the moment the ring is drawn
      // was #00509e / #9c211f, where black is 2.64:1 / 2.65:1 -- and the first
      // of those figures is exactly what argued the Confirm ring to #fff.
      // Re-adding :focus-visible here must fail, which is why the cases above
      // read the resting fill.
      expect(hasRuleFor(`${fill}:hover`)).toBe(true);
      expect(hasRuleFor(`${fill}:focus-visible`)).toBe(false);
    }
  );

  it("leaves the whole row on one standard, not half of one", () => {
    // Confirm, Cancel and Clear filter sit in the same row. Cancel stays on
    // the shared blue ring because its fill is the panel colour; the two
    // filled buttons both override to black. What must not come back is one
    // filled button on each standard.
    expect(declaration(ruleFor(PRIMARY_RING), "outline-color")).toBe(
      declaration(ruleFor(DANGER_RING), "outline-color")
    );
  });

  it("covers the Filter-by-colour submenu, not only the filter popup", () => {
    // Two different panels share one rule, and only the filter popup is
    // exercised downstream -- nothing in the sims opens the colour submenu, so
    // a selector dropped from this list would not surface anywhere else.
    expect(
      hasRuleFor(
        ".luckysheet-filter-bycolor-submenu .button-basic.button-primary:focus-visible"
      )
    ).toBe(true);
    expect(
      hasRuleFor(
        ".luckysheet-filter-bycolor-submenu .button-basic:focus-visible"
      )
    ).toBe(true);
  });
});
