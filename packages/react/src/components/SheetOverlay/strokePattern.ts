import type { CSSProperties } from "react";

/**
 * Stroke patterns for the formula range box, cycled by reference index.
 *
 * The box tells you which range in the grid belongs to which reference in the
 * formula, and until now it said so with colour alone. Colour is a real channel
 * but a single one: past roughly ten references the available hues stop
 * separating, and under greyscale or colour-vision deficiency they stop
 * separating much sooner. Varying the stroke gives the pairing a second channel
 * that survives both.
 *
 * Index 0 is `solid`, and solid means unchanged rather than a gradient that
 * happens to look solid: `strokeStyle` returns no `backgroundImage` at all for
 * it. That is the single-reference formula only - index 1 is dashed and index 2
 * is dotted, so a two- or three-reference formula does look different from
 * before. The trade is deliberate.
 *
 * Three patterns rather than more: past dotted the next steps (dash-dot,
 * long-dash) stop being told apart at a 2px strip, and a shorter cycle keeps
 * the first reference - the one always on screen - on the unchanged solid.
 */
export const STROKE_PATTERNS = ["solid", "dashed", "dotted"] as const;

export type StrokePattern = (typeof STROKE_PATTERNS)[number];

/** The four border strips of the range box, by their `data-type`. */
export type StrokeEdge = "top" | "right" | "bottom" | "left";

/** on/off lengths in px, keyed by pattern. */
const DASH_LENGTHS: Record<
  Exclude<StrokePattern, "solid">,
  [number, number]
> = {
  dashed: [6, 4],
  dotted: [2, 3],
};

export function strokePatternFor(rangeIndex: number): StrokePattern {
  // Guard the negative and non-finite cases: a broken index should fall back to
  // the unchanged rendering rather than produce `undefined` here.
  if (!Number.isFinite(rangeIndex) || rangeIndex < 0) return "solid";

  return STROKE_PATTERNS[Math.floor(rangeIndex) % STROKE_PATTERNS.length];
}

/**
 * Inline style for one border strip of the range box.
 *
 * The strips are background-filled 2px divs, not CSS borders, so `border-style`
 * cannot reach them - the dashes have to come from a repeating gradient. The
 * gradient runs along the strip: left to right for the horizontal strips, top to
 * bottom for the vertical ones.
 *
 * A patterned strip drops `backgroundColor`, because a fill behind the gradient
 * would show through the gaps and render as solid again.
 */
export function strokeStyle(
  rangeIndex: number,
  color: string | undefined,
  edge: StrokeEdge
): CSSProperties {
  const pattern = strokePatternFor(rangeIndex);

  if (pattern === "solid" || !color) return { backgroundColor: color };

  const [on, off] = DASH_LENGTHS[pattern];
  const axis = edge === "top" || edge === "bottom" ? "to right" : "to bottom";

  return {
    backgroundColor: "transparent",
    backgroundImage: `repeating-linear-gradient(${axis}, ${color} 0, ${color} ${on}px, transparent ${on}px, transparent ${
      on + off
    }px)`,
  };
}
