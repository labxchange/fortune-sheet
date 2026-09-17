import { colors } from "../src";

// The colours formula references are highlighted with, checked against the two
// things that actually render them.
//
// This file exists because the palette silently failed for years: it was the
// ECharts v2 chart palette, and only 6 of its 29 entries reached 4.5:1 on white.
// The two that did sat at indices 0 and 1, so short formulas looked fine and
// every reference from the third onwards was unreadable. Nothing caught it,
// because nothing asserted on it.

type RGB = [number, number, number];

/** The sheet background these are drawn on. */
const WHITE: RGB = [255, 255, 255];

/**
 * `.fortune-formula-functionrange-highlight .fortune-copy` in
 * `react/src/components/SheetOverlay/index.css`. The 2px border strips of the
 * range box are painted at this opacity, so the colour a Colour Contrast
 * Analyser eyedrops is the composite, not the hex.
 */
const BORDER_STRIP_OPACITY = 0.9;

const TEXT_CONTRAST_FLOOR = 4.5;

/**
 * deltaE below roughly this and two colours read as the same one. Applied to
 * neighbouring indices, and across the first eight - the references in one
 * formula are consecutive from zero, so those are the entries seen together.
 */
const DISTINCT_FLOOR = 15;
const FORMULA_REFERENCES_SEEN_TOGETHER = 8;

function parseHex(hex: string): RGB {
  const channels = hex.replace("#", "");

  return [0, 2, 4].map((i) => parseInt(channels.slice(i, i + 2), 16)) as RGB;
}

/** WCAG 2.x linearisation of one 0-255 channel. */
function linearize(channel: number): number {
  const c = channel / 255;

  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance([r, g, b]: RGB): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function contrastRatio(a: RGB, b: RGB): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x
  );

  return (lighter + 0.05) / (darker + 0.05);
}

/** What the browser paints for `color` at `alpha` over `over`. */
function composite(color: RGB, alpha: number, over: RGB): RGB {
  return color.map((c, i) =>
    Math.round(c * alpha + over[i] * (1 - alpha))
  ) as RGB;
}

function toLab([r, g, b]: RGB): [number, number, number] {
  const [lr, lg, lb] = [linearize(r), linearize(g), linearize(b)];
  const x = (0.4124 * lr + 0.3576 * lg + 0.1805 * lb) / 0.95047;
  const y = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  const z = (0.0193 * lr + 0.1192 * lg + 0.9505 * lb) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? t ** (1 / 3) : 7.787 * t + 16 / 116);

  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** CIE76 colour difference - coarse, but enough to catch two entries collapsing. */
function deltaE(a: RGB, b: RGB): number {
  const [la, lb] = [toLab(a), toLab(b)];

  return Math.sqrt(la.reduce((sum, v, i) => sum + (v - lb[i]) ** 2, 0));
}

describe("formula reference highlight colours", () => {
  it("are all well-formed six-digit hexes", () => {
    colors.forEach((hex) => expect(hex).toMatch(/^#[0-9a-f]{6}$/));
  });

  it.each(colors.map((hex, index) => [index, hex]))(
    "index %i (%s) reads as text on white",
    (_index, hex) => {
      const ratio = contrastRatio(parseHex(hex as string), WHITE);

      expect(ratio).toBeGreaterThanOrEqual(TEXT_CONTRAST_FLOOR);
    }
  );

  it.each(colors.map((hex, index) => [index, hex]))(
    "index %i (%s) still reads once the range box paints it at 0.9",
    (_index, hex) => {
      const painted = composite(
        parseHex(hex as string),
        BORDER_STRIP_OPACITY,
        WHITE
      );

      expect(contrastRatio(painted, WHITE)).toBeGreaterThanOrEqual(
        TEXT_CONTRAST_FLOOR
      );
    }
  );

  it("keeps neighbouring indices distinguishable", () => {
    const tooClose = colors
      .slice(0, -1)
      .map((hex, i) => ({
        pair: `${i}->${i + 1}`,
        difference: deltaE(parseHex(hex), parseHex(colors[i + 1])),
      }))
      .filter(({ difference }) => difference < DISTINCT_FLOOR);

    expect(tooClose).toEqual([]);
  });

  it("keeps the references of one formula distinguishable from each other", () => {
    // Darkening the palette alone collapsed indices 2 and 7 - both originally
    // yellow - to deltaE 1.5. They only ever appear together in a formula this
    // long, which is exactly why it would not have been noticed by hand.
    const head = colors.slice(0, FORMULA_REFERENCES_SEEN_TOGETHER);

    const pairs = head.flatMap((hex, i) =>
      head.slice(i + 1).map((other, j) => ({
        pair: `${i} vs ${i + j + 1}`,
        difference: deltaE(parseHex(hex), parseHex(other)),
      }))
    );

    expect(
      pairs.filter(({ difference }) => difference < DISTINCT_FLOOR)
    ).toEqual([]);
  });
});
