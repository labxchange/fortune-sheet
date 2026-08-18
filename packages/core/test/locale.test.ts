import { locale } from "../src/locale";
import { Context } from "../src/context";

// Every language the locale map resolves. "zh-TW" is included deliberately: it
// is the one key that is not also its own file name, so it exercises the map.
const LANGS = ["en", "zh", "es", "hi", "ru", "zh-TW"];

// Strings that only a screen reader ever reads. Nothing renders them visibly, so
// a locale missing one is not noticeable by eye — and `locale()` returns a single
// language object with no per-key fallback to English, so the missing value
// reaches `replaceHtml` as `undefined` and throws during render. The locale files
// are each `// @ts-ignore`d in the map, so tsc does not catch it either.
const SR_KEYS = [
  "sheetIsFocused",
  "sheetNotFocused",
  "sheetSrIntro",
  "cellHasFilterDropdown",
  "cellFilterActive",
  "enteredFilteredRegion",
  "leftFilteredRegion",
];

describe("screen-reader locale coverage", () => {
  LANGS.forEach((lang) => {
    it(`defines every screen-reader string for ${lang}`, () => {
      const { info } = locale({ lang } as unknown as Context);
      SR_KEYS.forEach((key) => {
        const value = (info as unknown as Record<string, unknown>)[key];
        expect(typeof value).toBe("string");
        expect(value).not.toBe("");
      });
    });

    it(`keeps both extent placeholders in ${lang}`, () => {
      const { info } = locale({ lang } as unknown as Context);
      // replaceHtml substitutes these by name; a translation that drops one
      // would announce a region boundary without saying where it runs.
      expect(info.enteredFilteredRegion).toContain("${start}");
      expect(info.enteredFilteredRegion).toContain("${end}");
    });
  });
});
