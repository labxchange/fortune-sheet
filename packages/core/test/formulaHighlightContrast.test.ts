import { colors } from "../src";
import {
  WHITE,
  composite,
  contrastRatio,
  deltaE,
  lightness,
  parseHex,
} from "../../../tests/colour";

// The colours formula references are highlighted with, checked against the two
// things that actually render them.
//
// This file exists because the palette silently failed for years: it was the
// ECharts v2 chart palette, and only 4 of its 29 entries cleared 4.5:1 both
// solid and as the range box paints them. Those four sat at indices 0, 1, 15
// and 19, so short formulas looked fine and every reference from the third
// onwards was unreadable. Nothing caught it, because nothing asserted on it.

/**
 * `.fortune-formula-functionrange-highlight .fortune-copy` in
 * `react/src/components/SheetOverlay/index.css`. The 2px border strips of the
 * range box are painted at this opacity, so the colour a Colour Contrast
 * Analyser eyedrops is the composite, not the hex.
 */
const BORDER_STRIP_OPACITY = 0.9;

const TEXT_CONTRAST_FLOOR = 4.5;

/**
 * deltaE below roughly this and two colours read as the same one.
 *
 * Applied to every pair, not to a window. An earlier revision checked only the
 * first eight entries, on the reasoning that a formula's references are
 * consecutive from zero - but formulas are not capped at eight references, and
 * the window stopped one index short of a real collision (2 vs 8, deltaE 9.1,
 * both of which also land on the same stroke pattern).
 */
const DISTINCT_FLOOR = 15;

/**
 * Contrast only ever improves as a colour darkens, so the cheapest way to pass
 * the gates above is to darken every entry to the lightest L* that clears them
 * - which pins the palette to the top of the band and leaves hue as the only
 * channel separating 29 entries. That revision had 35 pairs under the deltaE
 * floor, two of them under 2. This is the assertion that would have caught it
 * before review did.
 */
const LIGHTNESS_SPREAD_FLOOR = 20;

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

  it("keeps every pair in the palette distinguishable, not just a window", () => {
    const pairs = colors.flatMap((hex, i) =>
      colors.slice(i + 1).map((other, j) => ({
        pair: `${i} vs ${i + j + 1}`,
        difference: deltaE(parseHex(hex), parseHex(other)),
      }))
    );

    expect(
      pairs.filter(({ difference }) => difference < DISTINCT_FLOOR)
    ).toEqual([]);
  });

  it("spreads lightness across the band instead of pinning it to the ceiling", () => {
    const levels = colors.map((hex) => lightness(parseHex(hex)));

    expect(Math.max(...levels) - Math.min(...levels)).toBeGreaterThanOrEqual(
      LIGHTNESS_SPREAD_FLOOR
    );
  });

  it("sanity-checks the colour maths against known values", () => {
    // A silently wrong helper would pass everything above.
    expect(contrastRatio(parseHex("#000000"), WHITE)).toBeCloseTo(21, 1);
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 5);
    expect(deltaE(parseHex("#000000"), parseHex("#000000"))).toBeCloseTo(0, 5);
    expect(composite(parseHex("#000000"), 0.5, WHITE)).toEqual([128, 128, 128]);
  });
});
