import { locale } from "../src/locale";
import en from "../src/locale/en";
import zh from "../src/locale/zh";
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

    it(`keeps both extent placeholders in ${lang}`, () => {
      // replaceHtml substitutes these by name; a translation that drops one
      // would announce a region boundary without saying where it runs. No
      // fallback covers this — the key is present, just malformed.
      expect(infoFor(lang).enteredFilteredRegion).toContain("${start}");
      expect(infoFor(lang).enteredFilteredRegion).toContain("${end}");
    });
  });

  it("prefers the translation over the English fallback", () => {
    // The fallback must only fill gaps, never shadow a translated string.
    expect(infoFor("zh").sheetIsFocused).toBe(zh.info.sheetIsFocused);
    expect(infoFor("zh").sheetIsFocused).not.toBe(en.info.sheetIsFocused);
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
    expect(infoFor("kl").sheetIsFocused).toBe(en.info.sheetIsFocused);
  });
});
