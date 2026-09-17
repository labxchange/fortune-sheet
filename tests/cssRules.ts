import { readFileSync } from "fs";

/**
 * A stylesheet read as text, so it can be asserted on.
 *
 * jest maps CSS through identity-obj-proxy, so no stylesheet ever loads and a
 * render can prove nothing about colour. Every contrast suite therefore reads
 * the rules itself, and each one had grown its own parser - one of which was
 * subtly weaker than the other and needed a second helper to paper over it.
 *
 * The single strategy here is the stricter one: comments stripped, whitespace
 * collapsed, selectors matched only at a real boundary. Both steps are
 * load-bearing.
 *
 *  - Stripping comments, because these stylesheets explain a rule directly
 *    above it and quote its selector verbatim while doing so. A plain search
 *    over the raw text finds the explanation before the rule.
 *  - Collapsing whitespace, because prettier breaks a long selector across
 *    lines, and a rule split that way is not findable on any one line.
 *  - Matching at a boundary, because selectors are routinely prefixes of each
 *    other: `.fortune-filter-menu .button-primary` occurs inside its own
 *    `:hover` rule, and the `[aria-selected="true"]` option selector occurs
 *    inside its own `:focus-visible` override. Reading either of those as the
 *    base rule silently asserts against a surface the resting control never
 *    has.
 */
export interface CssRules {
  /** The stylesheet exactly as written, for the few assertions that need the
   *  original formatting - an `@media` block, say. */
  raw: string;
  /** The declarations of the first rule whose selector list contains
   *  `selector`, without the selector or the braces. */
  ruleFor(selector: string): string;
  /** Whether any rule's selector list contains `selector` at all. */
  hasRuleFor(selector: string): boolean;
  /** The hex `property` is declared as, within `rule`. */
  declaration(rule: string, property: string): string;
}

export function readCssRules(path: string): CssRules {
  const raw = readFileSync(path, "utf-8");
  const source = raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\s+/g, " ");

  /** Every offset at which `selector` appears as a complete selector.
   *
   * In a collapsed stylesheet the only things that can follow a whole selector
   * are `, ` (another selector in the same list) and ` {` (the block opening).
   * The `{` before `}` test is the second half: it keeps a match that somehow
   * landed inside a declaration block from being read as a rule. */
  const selectorSites = (selector: string) => {
    const sites: number[] = [];
    for (
      let at = source.indexOf(selector);
      at !== -1;
      at = source.indexOf(selector, at + selector.length)
    ) {
      const after = source.slice(
        at + selector.length,
        at + selector.length + 2
      );
      const open = source.indexOf("{", at);
      const close = source.indexOf("}", at);
      if ((after === ", " || after === " {") && open > -1 && open < close) {
        sites.push(at);
      }
    }
    return sites;
  };

  const hasRuleFor = (selector: string) => selectorSites(selector).length > 0;

  const ruleFor = (selector: string) => {
    const sites = selectorSites(selector);
    if (sites.length === 0) {
      throw new Error(`no rule declares \`${selector}\` in ${path}`);
    }
    const open = source.indexOf("{", sites[0]);
    return source.slice(open + 1, source.indexOf("}", open));
  };

  /** The name is anchored to a declaration boundary; unanchored, asking for
   *  `color` returns `background-color`'s value - silently, and in the
   *  direction that is awkward rather than dangerous, since a rule's
   *  background compared against itself is 1:1 and the assertion fails rather
   *  than passing. */
  const declaration = (rule: string, property: string) => {
    const match = rule.match(
      new RegExp(`(?:^|[\\s;{])${property}:\\s*(#[0-9a-fA-F]{3,6})`)
    );
    if (!match) {
      throw new Error(`\`${property}\` is not declared as a hex in: ${rule}`);
    }
    return match[1];
  };

  return { raw, ruleFor, hasRuleFor, declaration };
}
