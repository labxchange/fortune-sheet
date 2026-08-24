import { locale } from "../src/locale";
import en from "../src/locale/en";
import es from "../src/locale/es";
import hi from "../src/locale/hi";
import ru from "../src/locale/ru";
import zh from "../src/locale/zh";
import zh_tw from "../src/locale/zh_tw";
import { Context } from "../src/context";

// Every language the locale map resolves. "zh-TW" is included deliberately: it
// is the one key that is not also its own file name, so it exercises the map.
const LANGS = ["en", "zh", "es", "hi", "ru", "zh-TW"];

const infoFor = (lang: string) => locale({ lang } as unknown as Context).info;

describe("screen-reader locale coverage", () => {
  // Strings only a screen reader reads are not noticeable by eye when a
  // translation omits one, the locale files are each `@ts-ignore`d in the map so
  // tsc does not catch it, and `replaceHtml` throws during render on an
  // `undefined` value. `locale()` closes that by falling back per key to
  // English, so the guard is every string English defines rather than a
  // hand-maintained list that the next string added would not be on.
  const enStringKeys = Object.entries(en.info)
    .filter(([, value]) => typeof value === "string")
    .map(([key]) => key);

  LANGS.forEach((lang) => {
    it(`resolves every info string for ${lang}`, () => {
      const info = infoFor(lang) as unknown as Record<string, unknown>;
      // A string — empty included, since English deliberately leaves `row` and
      // `column` blank where other languages carry a suffix. The hazard is
      // `undefined` reaching `replaceHtml`, not emptiness.
      enStringKeys.forEach((key) => {
        expect(typeof info[key]).toBe("string");
      });
    });

    it(`keeps every English placeholder in ${lang}`, () => {
      // Substituted by name, so a translation that drops one renders a static
      // sentence instead — a count region that reports the same number for
      // every search, or a boundary announcement that omits where it runs. No
      // fallback covers this: the key is present, just malformed. Derived from
      // English rather than hand-listed, so the next such string is covered
      // without anyone remembering to add it.
      const info = infoFor(lang) as unknown as Record<string, string>;
      Object.entries(en.info).forEach(([key, value]) => {
        if (typeof value !== "string") return;
        (value.match(/\$\{\w+\}/g) ?? []).forEach((placeholder) => {
          expect(info[key]).toContain(placeholder);
        });
      });
    });
  });

  it("prefers the translation over the English fallback", () => {
    // The fallback must only fill gaps, never shadow a translated string.
    expect(infoFor("zh").currentCellInput).toBe(zh.info.currentCellInput);
    expect(infoFor("zh").currentCellInput).not.toBe(en.info.currentCellInput);
  });

  it("takes arrays from the translation whole rather than by index", () => {
    // `functionlist` has a different number of entries per language, so an
    // index-wise merge would splice English fields into misaligned translated
    // entries.
    expect(zh.functionlist.length).not.toBe(en.functionlist.length);
    expect(locale({ lang: "zh" } as unknown as Context).functionlist).toEqual(
      zh.functionlist
    );
  });

  it("returns a referentially stable object per language", () => {
    // Consumers list the result in effect dependency arrays; a fresh object per
    // call would re-run those on every render.
    expect(locale({ lang: "es" } as unknown as Context)).toBe(
      locale({ lang: "es" } as unknown as Context)
    );
  });

  it("falls back to English for an unknown language", () => {
    expect(infoFor("kl").currentCellInput).toBe(en.info.currentCellInput);
  });
});

/**
 * Locale strings are load-bearing for accessible names now — a toolbar
 * tooltip is also the control's aria-label — so a key English defines and a
 * translation omits is an a11y gap, not just a cosmetic one. The English
 * fallback in `locale()` keeps it from being a *broken* control (the string
 * resolves, in English), which is why the keys below are recorded rather than
 * treated as failures: they are untranslated, not missing at runtime.
 *
 * The point of the test is to stop *new* drift. Adding a key to `en` without
 * adding it to the other five now fails the build instead of waiting to be
 * noticed in review, which is how the last three rounds found one.
 *
 * Scoped to keys English has and a translation lacks. The reverse — es and
 * zh_tw each carry ~170 key paths English no longer has — is stale leftovers
 * that nothing reads, and asserting on them would mean deleting translated
 * strings to satisfy a test.
 */
describe("locale key parity", () => {
  const flattenKeys = (obj: unknown, prefix = ""): string[] =>
    Object.entries(obj as Record<string, unknown>).flatMap(([key, value]) =>
      // arrays are taken whole by the merge, so they are leaves here too
      value && typeof value === "object" && !Array.isArray(value)
        ? flattenKeys(value, `${prefix}${key}.`)
        : [`${prefix}${key}`]
    );

  // Exact, not a floor: a key that gets translated has to come off this list,
  // so the allow-list can't quietly outlive the gap it documents.
  const UNTRANSLATED: Record<string, string[]> = {
    es: [
      "toolbar.clear-format",
      "toolbar.format-painter",
      "toolbar.currency-format",
      "toolbar.percentage-format",
      "toolbar.number-decrease",
      "toolbar.number-increase",
      "toolbar.border-all",
      "toolbar.merge-all",
      "toolbar.strike-through",
      "toolbar.align-left",
      "toolbar.align-center",
      "toolbar.align-right",
      "toolbar.align-top",
      "toolbar.align-mid",
      "toolbar.align-bottom",
      "format.tipDecimalPlaces",
      "format.select",
      "format.format",
      "format.currency",
      "currencyDetail",
      "border.borderDefault",
      "border.borderStyle",
      "splitText.splitSymbols",
      "splitText.tipNoSelect",
      "drag.affectPivot",
    ],
    hi: [],
    ru: [],
    zh: ["toolbar.paintFormat", "protection.enterHintTitle"],
    zh_tw: [
      "toolbar.clear-format",
      "toolbar.format-painter",
      "toolbar.currency-format",
      "toolbar.percentage-format",
      "toolbar.number-decrease",
      "toolbar.number-increase",
      "toolbar.border-all",
      "toolbar.merge-all",
      "toolbar.strike-through",
      "toolbar.align-left",
      "toolbar.align-center",
      "toolbar.align-right",
      "toolbar.align-top",
      "toolbar.align-mid",
      "toolbar.align-bottom",
      "format.tipDecimalPlaces",
      "format.select",
      "format.format",
      "format.currency",
      "currencyDetail",
      "border.borderDefault",
      "border.borderStyle",
      "protection.enterHintTitle",
    ],
  };

  // Keyed by file name rather than by the locale map's key, since the gap is
  // in the translation file itself — "zh-TW" resolves through the fallback.
  const FILES: Record<string, unknown> = { es, hi, ru, zh, zh_tw };

  it.each(Object.keys(UNTRANSLATED))(
    "%s defines every key English does, bar the recorded backlog",
    (lang) => {
      const translated = new Set(flattenKeys(FILES[lang]));
      const missing = flattenKeys(en).filter((key) => !translated.has(key));
      expect(missing.sort()).toEqual([...UNTRANSLATED[lang]].sort());
    }
  );

  it("resolves an untranslated key to the English string rather than undefined", () => {
    // What makes the backlog above tolerable. sortAndFilter is the tooltip and
    // accessible name of the filter combo, and was itself missing from es and
    // zh_tw until this was checked.
    const untranslated = UNTRANSLATED.es[0].split(".");
    const resolved = locale({ lang: "es" } as unknown as Context) as any;
    expect(resolved[untranslated[0]][untranslated[1]]).toBe(
      (en as any)[untranslated[0]][untranslated[1]]
    );
    expect(
      locale({ lang: "es" } as unknown as Context).toolbar.sortAndFilter
    ).toBe("Ordenar y filtrar");
  });
});
