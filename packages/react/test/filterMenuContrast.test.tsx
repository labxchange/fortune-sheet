import { readFileSync } from "fs";
import { join } from "path";

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

const CSS = readFileSync(
  join(__dirname, "../src/components/ContextMenu/index.css"),
  "utf-8"
);

/** The stylesheet with comments removed, whitespace collapsed.
 *
 * Both steps are load-bearing here. This file's comments quote the selectors
 * they discuss verbatim, so a search over the raw text finds a rule's own
 * explanation before the rule. And prettier breaks these selector lists across
 * lines, so a rule is not findable on one line. */
const SOURCE = CSS.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\s+/g, " ");

/** Every offset in `SOURCE` at which `selector` appears as a complete selector.
 *
 * Exactness matters: in a collapsed stylesheet the only things that can follow
 * a whole selector are `, ` (another selector in the same list) and ` {` (the
 * block opening). Without that check `.fortune-filter-menu .button-primary`
 * matches inside `.fortune-filter-menu .button-primary:hover` and reads the
 * hover fill as if it were the resting one. The `{` before `}` test is the
 * second half: it keeps a match that somehow landed inside a declaration block
 * from being read as a rule. */
const selectorSites = (selector: string) => {
  const sites: number[] = [];
  for (
    let at = SOURCE.indexOf(selector);
    at !== -1;
    at = SOURCE.indexOf(selector, at + selector.length)
  ) {
    const after = SOURCE.slice(at + selector.length, at + selector.length + 2);
    const open = SOURCE.indexOf("{", at);
    const close = SOURCE.indexOf("}", at);
    if ((after === ", " || after === " {") && open > -1 && open < close) {
      sites.push(at);
    }
  }
  return sites;
};

/** The declarations of the rule whose selector list contains `selector`. */
const ruleFor = (selector: string) => {
  const sites = selectorSites(selector);
  expect(sites.length).toBeGreaterThan(0);
  const open = SOURCE.indexOf("{", sites[0]);
  return SOURCE.slice(open + 1, SOURCE.indexOf("}", open));
};

/** True when a rule's selector list contains `selector` at all. */
const hasRuleFor = (selector: string) => selectorSites(selector).length > 0;

/** The hex `property` is declared as, within `rule`.
 *
 * The name is anchored to a declaration boundary; unanchored, asking for
 * `color` returns `background-color`'s value. Same helper, same reason, as
 * searchReplaceContrast.test.tsx. */
const declaration = (rule: string, property: string) => {
  const match = rule.match(
    new RegExp(`(?:^|[\\s;{])${property}:\\s*(#[0-9a-fA-F]{3,6})`)
  );
  expect(match).toBeTruthy();
  return match![1];
};

const channel = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string) => {
  const short = hex.replace("#", "");
  // Shorthand expanded rather than rejected: this stylesheet writes both forms,
  // and slicing #fff two characters at a time yields "ff", "f" and "", the last
  // of which is NaN and poisons every ratio computed from it.
  const n =
    short.length === 3
      ? short
          .split("")
          .map((c) => c + c)
          .join("")
      : short;
  const [r, g, b] = [0, 2, 4].map((i) =>
    channel(parseInt(n.slice(i, i + 2), 16))
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** The rule that gives every control in both filter panels its ring. */
const SHARED_RING = ".fortune-filter-menu .button-basic:focus-visible";
/** The rule that recolours it for the primary (Confirm) button. */
const PRIMARY_RING =
  ".fortune-filter-menu .button-basic.button-primary:focus-visible";
/** The primary button's resting fill. */
const PRIMARY_FILL = ".fortune-filter-menu .button-primary";
/** The panel both popups are drawn on. */
const PANEL = ".fortune-context-menu";

describe("the filter popup's primary-button focus ring", () => {
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

  it("contrasts with the surface the ring actually lands on", () => {
    // The load-bearing assertion. Fails at #fff (1.00:1) -- the reported bug --
    // and passes at #000 (21:1). The surface is derived from the offset rather
    // than hard-coded, so flipping the ring inset re-points this check instead
    // of silently invalidating it.
    const offset = Number(
      ruleFor(SHARED_RING).match(/outline-offset:\s*(-?[\d.]+)px/)![1]
    );
    const surface =
      offset > 0
        ? declaration(ruleFor(PANEL), "background")
        : declaration(ruleFor(PRIMARY_FILL), "background-color");
    expect(
      contrast(declaration(ruleFor(PRIMARY_RING), "outline-color"), surface)
    ).toBeGreaterThanOrEqual(3);
  });

  it("contrasts with the button it encloses as well", () => {
    // The other reading of 1.4.11, and the one Dialog/index.css sets as the
    // standard for this same button shape: an indicator should pass whether it
    // is measured against the control it encloses or the surface beside it.
    // Black is 3.57:1 on the resting #0063c3 fill.
    expect(
      contrast(
        declaration(ruleFor(PRIMARY_RING), "outline-color"),
        declaration(ruleFor(PRIMARY_FILL), "background-color")
      )
    ).toBeGreaterThanOrEqual(3);
  });

  it("does not let focus move the surface the ring is measured against", () => {
    // The fill darkens on hover only. While it also darkened on :focus-visible,
    // the enclosing surface at the moment the ring is drawn was #00509e, where
    // black is 2.64:1 -- and that figure is exactly what argued the ring to
    // #fff. Re-adding :focus-visible here must fail, which is why the case
    // above reads the resting fill.
    expect(hasRuleFor(`${PRIMARY_FILL}:hover`)).toBe(true);
    expect(hasRuleFor(`${PRIMARY_FILL}:focus-visible`)).toBe(false);
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
