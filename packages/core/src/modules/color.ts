/**
 * Colours for formula reference highlighting: the token text inside the editor
 * and the box drawn around the matching range on the grid, indexed by the
 * reference's position in the formula.
 *
 * These were the ECharts v2 categorical palette, picked for chart fills and
 * never vetted as text. Only 6 of the 29 reached 4.5:1 on white, and the two
 * that did sit at indices 0 and 1 - so a short formula looked fine and every
 * reference from the third onwards was unreadable (#fcce10 measured 1.5:1,
 * #e87c25 2.9:1).
 *
 * Two things to know before editing an entry:
 *
 * 1. The gate is not the hex. `.fortune-formula-functionrange-highlight
 *    .fortune-copy` paints the 2px border strips at `opacity: .9`, so what a
 *    Colour Contrast Analyser eyedrops is this colour composited over white. A
 *    palette tuned only to the nominal value passes on paper and fails by hand.
 *    Every entry here clears 4.5:1 *both* solid and at that 0.9 composite;
 *    measured minimums are 5.18:1 and 4.50:1.
 *
 * 2. Indices 2, 4, 6 and 7 are not their original hues. Darkening alone
 *    collapsed #fcce10 and #fad860 - both yellows - onto the same dark gold at
 *    deltaE 1.5, indistinguishable, and they co-occur in any formula with eight
 *    references. Those four carry a deliberate hue rotation to pull them apart.
 *    Do not "correct" them back toward the originals.
 *
 * Every other entry keeps its original hue and saturation at the lightest
 * lightness that clears both gates. Indices 0, 1, 15 and 19 already passed and
 * are untouched.
 *
 * Contrast is all this palette can carry. Past roughly ten references the hues
 * are necessarily close, and under greyscale or CVD they stop separating at
 * all - which is why the range box also varies its stroke pattern by index (see
 * `strokePattern` in `react/src/components/SheetOverlay`).
 */
export const colors = [
  "#c1232b",
  "#27727b",
  "#8b6002",
  "#a55311",
  "#39751f",
  "#d02d01",
  "#736827",
  "#606f03",
  "#985b09",
  "#1e718a",
  "#cb332d",
  "#577116",
  "#726900",
  "#c23e12",
  "#177474",
  "#c12e34",
  "#806500",
  "#0071a2",
  "#28791b",
  "#005eaa",
  "#25727b",
  "#7d660f",
  "#247560",
  "#167098",
  "#147759",
  "#5d6689",
  "#4f5cd1",
  "#3d751d",
  "#1c7380",
];
