/**
 * Colours for formula reference highlighting: the token text inside the editor
 * and the box drawn around the matching range on the grid, indexed by the
 * reference's position in the formula.
 *
 * These were the ECharts v2 categorical palette, picked for chart fills and
 * never vetted as text. Only 4 of the 29 cleared 4.5:1 both solid and as the
 * range box actually paints them, so a short formula looked fine and every
 * reference from the third onwards was unreadable (#fcce10 measured 1.5:1,
 * #e87c25 2.9:1).
 *
 * Three things to know before editing an entry:
 *
 * 1. The gate is not the hex. `.fortune-formula-functionrange-highlight
 *    .fortune-copy` paints the 2px border strips at `opacity: .9`, so what a
 *    Colour Contrast Analyser eyedrops is this colour composited over white. A
 *    palette tuned only to the nominal value passes on paper and fails by hand.
 *    Every entry here clears 4.5:1 *both* solid and at that 0.9 composite;
 *    measured minimums are 4.96:1 and 4.50:1.
 *
 * 2. Lightness is staggered on purpose, not minimised. Contrast only ever
 *    improves as a colour darkens, so the cheapest way to satisfy the gate is
 *    to darken every entry to the lightest passing L* -- and that is a trap.
 *    It pins the whole palette to the top of the band (L* 39-46) and leaves hue
 *    as the only channel, at which point entries collapse into each other: an
 *    earlier revision of this array had 35 pairs under deltaE 15, two of them
 *    under 2. These span L* 21-47, and no two entries are within deltaE 15 of
 *    each other.
 *
 * 3. Hue is preserved where it can be. Twenty of the 29 sit at their original
 *    hue angle; the rest are rotated as little as the separation floor allows
 *    (at most 22 degrees, on the teals at indices 1, 9, 14 and 20, which the
 *    original palette crowded). Do not "correct" them back toward the ECharts
 *    values -- the rotation is what keeps them apart.
 *
 * No entry is exempt, including the four that already passed. Indices 0 and 15
 * were both reds at deltaE 4.9 *in the original palette*, so the separation
 * floor is unreachable while either is held fixed.
 *
 * Contrast and lightness are all a palette can carry. Past roughly ten
 * references the hues are necessarily close, and under greyscale or CVD they
 * stop separating at all - which is why the range box also varies its stroke
 * pattern by index (see `strokePattern` in `react/src/components/SheetOverlay`).
 */
export const colors = [
  "#ae031e",
  "#0c7578",
  "#7e6600",
  "#a85100",
  "#454e00",
  "#b4452a",
  "#3c7500",
  "#605430",
  "#905a03",
  "#0f3645",
  "#840015",
  "#546f1b",
  "#393306",
  "#842403",
  "#003f39",
  "#de1230",
  "#574200",
  "#006fa2",
  "#035a00",
  "#1866b4",
  "#00728d",
  "#78662a",
  "#00755d",
  "#005172",
  "#336354",
  "#2a3657",
  "#3c487e",
  "#426630",
  "#245760",
];
