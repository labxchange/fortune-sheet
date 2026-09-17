/**
 * Colour maths shared by the contrast suites.
 *
 * Three copies of `channel`/`luminance`/`contrast` had accumulated - two in
 * `packages/react/test`, one in `packages/core/test` - which is two too many
 * for something that silently returns a plausible number when it is wrong.
 * Anything asserting on a colour should import from here.
 *
 * WCAG 2.x maths throughout: sRGB linearisation, relative luminance, and the
 * (L1 + 0.05) / (L2 + 0.05) ratio.
 */

export type RGB = [number, number, number];

/** The sheet and panel background everything here is drawn on. */
export const WHITE: RGB = [255, 255, 255];

/** Shorthand is expanded rather than rejected: the stylesheets write both
 *  forms, and slicing `#fff` two characters at a time yields "ff", "f" and "",
 *  the last of which is NaN and poisons every ratio computed from it. */
export function parseHex(hex: string): RGB {
  const short = hex.replace("#", "");
  const full =
    short.length === 3
      ? short
          .split("")
          .map((c) => c + c)
          .join("")
      : short;

  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as RGB;
}

/** WCAG 2.x linearisation of one 0-255 channel. */
export function linearize(channel: number): number {
  const c = channel / 255;

  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance([r, g, b]: RGB): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

export function contrastRatio(a: RGB, b: RGB): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x
  );

  return (lighter + 0.05) / (darker + 0.05);
}

/** The same ratio, for the hex strings a stylesheet is read as. */
export function contrast(a: string, b: string): number {
  return contrastRatio(parseHex(a), parseHex(b));
}

/** What the browser paints for `color` at `alpha` over `over`. */
export function composite(color: RGB, alpha: number, over: RGB = WHITE): RGB {
  return color.map((c, i) =>
    Math.round(c * alpha + over[i] * (1 - alpha))
  ) as RGB;
}

export function toLab([r, g, b]: RGB): [number, number, number] {
  const [lr, lg, lb] = [linearize(r), linearize(g), linearize(b)];
  const x = (0.4124 * lr + 0.3576 * lg + 0.1805 * lb) / 0.95047;
  const y = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  const z = (0.0193 * lr + 0.1192 * lg + 0.9505 * lb) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? t ** (1 / 3) : 7.787 * t + 16 / 116);

  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** CIE76 colour difference - coarse, but enough to catch two entries
 *  collapsing into each other. */
export function deltaE(a: RGB, b: RGB): number {
  const [la, lb] = [toLab(a), toLab(b)];

  return Math.sqrt(la.reduce((sum, v, i) => sum + (v - lb[i]) ** 2, 0));
}

/** L\* alone, for assertions about how a palette is spread. */
export function lightness(rgb: RGB): number {
  return toLab(rgb)[0];
}
