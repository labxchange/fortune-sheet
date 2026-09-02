import { readFileSync } from "fs";
import { join } from "path";

// jest maps CSS through identity-obj-proxy, so no stylesheet ever loads and a
// render can prove nothing about colour. The ratio is therefore computed from
// the stylesheet read as text — the same approach dialogCloseButton.test.tsx
// takes for the shared close button.
//
// Not covered here: the third bullet of this ticket, the close (X) button's
// focus indicator. That control is `.fortune-modal-dialog-icon-close`, shared
// from Dialog, and it is fixed on the sibling branch rather than duplicated
// here.

const CSS = readFileSync(
  join(__dirname, "../src/components/SearchReplace/index.css"),
  "utf-8"
);

const channel = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string) => {
  const short = hex.replace("#", "");
  // Shorthand expanded rather than rejected: the stylesheet writes both forms,
  // and slicing two characters at a time out of #fff reads "ff", "f" and "",
  // the last of which is NaN and poisons every ratio computed from it.
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

/** The declarations of the top-level rule declaring `selector`.
 *
 * Anchored to the start of a line, so it takes the base rule rather than the
 * indented copy of the same selector inside the forced-colors block below it
 * — and cannot be fooled by a selector named in a comment. */
const ruleFor = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const at = CSS.search(new RegExp(`^${escaped}\\s*\\{`, "m"));
  expect(at).toBeGreaterThan(-1);
  return CSS.slice(at, CSS.indexOf("}", at));
};

/** The hex value `property` is declared as, within `rule`.
 *
 * The property name is anchored to a declaration boundary, or it matches as a
 * substring: `declaration(rule, "color")` on a rule carrying both would find
 * `background-color:` first and return the wrong colour — silently, and in the
 * direction that makes a contrast assertion pass. */
const declaration = (rule: string, property: string) => {
  const match = rule.match(
    new RegExp(`(?:^|[\\s;{])${property}:\\s*(#[0-9a-fA-F]{3,6})`)
  );
  expect(match).toBeTruthy();
  return match![1];
};

/** The declarations of a rule, found in the stylesheet with its whitespace
 * collapsed — a selector long enough for prettier to break across lines is not
 * findable by `ruleFor`, which matches a selector sitting on one line. */
const flatRuleFor = (selector: string) => {
  const flat = CSS.replace(/\s+/g, " ");
  const at = flat.indexOf(`${selector} {`);
  expect(at).toBeGreaterThan(-1);
  return flat.slice(at, flat.indexOf("}", at));
};

const SELECTED_OPTION =
  '#fortune-search-replace #searchAllbox .boxItem[aria-selected="true"]';

describe("Find and Replace colour contrast", () => {
  it("reads a property that another one ends with", () => {
    // The helper the rest of the suite leans on, on the shape that would fool
    // an unanchored name: `background-color` declared before `color`. Unpinned,
    // this returned the background for both and every ratio below compared a
    // colour with itself.
    const rule = "  background-color: #5b57d1;\n  color: #fff;\n";
    expect(declaration(rule, "color")).toBe("#fff");
    expect(declaration(rule, "background-color")).toBe("#5b57d1");
  });

  it("sanity-checks the ratio maths against known pairs", () => {
    // A contrast helper that is silently wrong would pass everything below.
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 1);
    expect(contrast("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    // Shorthand reads as the same colour, not as NaN.
    expect(contrast("#fff", "#000")).toBeCloseTo(21, 1);
    // The value this ticket rejected, at the ratio the ticket reported.
    expect(contrast("#ffffff", "#8c89fe")).toBeLessThan(4.5);
  });

  it("gives the active tab's text 4.5:1 against its own background", () => {
    const rule = ruleFor("#fortune-search-replace .tabBox span.on");
    const background = declaration(rule, "background-color");
    expect(rule).toContain("color: #fff");
    expect(contrast("#ffffff", background)).toBeGreaterThanOrEqual(4.5);
  });

  it("gives the selected result option's text 4.5:1 against its own background", () => {
    const rule = ruleFor(
      '#fortune-search-replace #searchAllbox .boxItem[aria-selected="true"]'
    );
    const background = declaration(rule, "background-color");
    expect(rule).toContain("color: #fff");
    expect(contrast("#ffffff", background)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps a margin above the threshold rather than sitting on it", () => {
    // 4.52:1 passes and leaves nothing for the next tweak. Both surfaces are
    // held clear of the line so a later shade change fails loudly here.
    const tab = declaration(
      ruleFor("#fortune-search-replace .tabBox span.on"),
      "background-color"
    );
    expect(contrast("#ffffff", tab)).toBeGreaterThan(5);
  });

  it("uses one value for both surfaces, since one value caused both failures", () => {
    const tab = declaration(
      ruleFor("#fortune-search-replace .tabBox span.on"),
      "background-color"
    );
    const row = declaration(
      ruleFor(
        '#fortune-search-replace #searchAllbox .boxItem[aria-selected="true"]'
      ),
      "background-color"
    );
    expect(tab).toBe(row);
  });

  it("keeps the active tab's border visible against its own fill", () => {
    // Non-text contrast, 1.4.11: darkening the fill without the border leaves
    // the border invisible inside it.
    const rule = ruleFor("#fortune-search-replace .tabBox span.on");
    const background = declaration(rule, "background-color");
    const border = declaration(rule, "border-color");
    expect(border).not.toBe(background);
    expect(contrast(background, border)).toBeGreaterThan(1.2);
  });

  it("draws the focus ring in a colour that is visible on the fill it lands on", () => {
    // 1.4.11, and the reason it is not caught by any of the text pairs above:
    // a focus indicator is measured against the surface it is drawn on, and
    // this one has only ever one surface. `onFocus` sets `activeRow` and
    // `aria-selected` keys off `activeRow`, so the focused option is always
    // the selected option — the ring is never drawn on an unselected white
    // row, only ever on the selected fill.
    const fill = declaration(ruleFor(SELECTED_OPTION), "background-color");

    // The token ring every other control in the package uses, taken from the
    // base rule rather than retyped, so a token change is seen here.
    const base = ruleFor(
      "#fortune-search-replace #searchAllbox .boxItem:focus-visible"
    );
    const token = base.match(
      /--color_border_focus_outer,\s*(#[0-9a-fA-F]{3,6})/
    );
    expect(token).toBeTruthy();
    // Which is why it is overridden: it is invisible on that fill.
    expect(contrast(token![1], fill)).toBeLessThan(3);

    const override = flatRuleFor(`${SELECTED_OPTION}:focus-visible`);
    const ring = declaration(override, "outline-color");
    expect(contrast(ring, fill)).toBeGreaterThanOrEqual(3);
  });

  it("keeps the selected option distinguishable under forced colours", () => {
    // The selected option is marked with background-color + color, and forced
    // colours replaces both with system values — so without an override the
    // highlight disappears and every option looks alike. Read as text for the
    // same reason as everything else here: no stylesheet loads under jsdom.
    const at = CSS.search(/@media \(forced-colors: active\) \{/);
    expect(at).toBeGreaterThan(-1);
    const block = CSS.slice(at, CSS.indexOf("\n}", at));

    expect(block).toContain('.boxItem[aria-selected="true"]');
    expect(block).toMatch(/background-color:\s*Highlight/);
    expect(block).toMatch(/color:\s*HighlightText/);
    // The fill alone is not guaranteed across themes; the outline is the belt.
    expect(block).toMatch(/outline:\s*2px solid Highlight/);
    expect(block).toMatch(/forced-color-adjust:\s*none/);
  });

  it("no longer references the rejected colour in any declaration", () => {
    // Comments still name it, deliberately, to record what was wrong.
    const declarations = CSS.split("\n").filter(
      (line) => !line.trim().startsWith("*") && !line.trim().startsWith("/*")
    );
    expect(declarations.join("\n")).not.toContain("#8c89fe");
  });
});
