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

const PLACEHOLDER = /\$\{\w+\}/g;

/** Every `[dotted.path, englishValue]` in `en` whose value is a string. */
const englishStrings = (obj: unknown, prefix = ""): [string, string][] =>
  Object.entries(obj as Record<string, unknown>).flatMap(([key, value]) => {
    if (typeof value === "string") {
      return [[`${prefix}${key}`, value] as [string, string]];
    }
    // Arrays are taken whole by the merge, so their contents are not compared.
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return englishStrings(value, `${prefix}${key}.`);
    }
    return [];
  });

// `match` rather than `test`, because `PLACEHOLDER` is global and `test`
// advances `lastIndex` — filtering with it would skip every other match.
const interpolatedStrings = englishStrings(en).filter(
  ([, value]) => value.match(PLACEHOLDER) != null
);

/** Every `announce*` string English defines, wherever it lives. */
const announcementStrings = englishStrings(en).filter(([path]) =>
  /(^|\.)announce[A-Z]/.test(path)
);

describe("screen-reader locale coverage", () => {
  // Both walkers above derive their list from `en` rather than a hand-written
  // one, so an empty list would make every case that iterates it vacuously
  // green — the failure mode is the test passing, not failing. These two hold
  // them to a floor. Exact counts are deliberately not asserted: adding a
  // string should not fail a test that has nothing to do with it.
  it("finds the strings the cases below iterate", () => {
    expect(interpolatedStrings.length).toBeGreaterThan(20);
    expect(announcementStrings.length).toBeGreaterThan(25);
  });

  LANGS.forEach((lang) => {
    it(`resolves every result announcement for ${lang}`, () => {
      // `announce(key)` is checked against the locale shape by `tsc`, so a
      // *typo* cannot ship. What tsc cannot see is a key that resolves to an
      // empty string: `useContextMenuAnnouncements` treats that the same as an
      // unresolved one and returns early, so the action ships silent — the
      // WCAG 4.1.3 failure the announcements exist to fix, with nothing to
      // notice at runtime.
      //
      // Only 8 of these are asserted end-to-end anywhere in the react suite:
      // the rest need a merged range, a read-only sheet or a hidden row to
      // reach through the UI. This is the guard for the other two thirds, in
      // all six languages rather than the one the component tests render.
      const resolved = locale({ lang } as unknown as Context) as any;
      announcementStrings.forEach(([path]) => {
        const value = path
          .split(".")
          .reduce((acc, key) => acc?.[key], resolved);
        expect(typeof value).toBe("string");
        expect(value).not.toBe("");
      });
    });
  });

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
      // A string — empty included, since `column` is still blank in four of
      // the six files. The hazard here is `undefined` reaching `replaceHtml`,
      // not emptiness; the case below is what holds `row` to more than that.
      enStringKeys.forEach((key) => {
        expect(typeof info[key]).toBe("string");
      });
    });

    it(`gives ${lang} a unit noun for the add-row strip`, () => {
      // The strip renders `${add} [n] ${row} (${addLast})`, so `row` is the
      // only thing naming what the number counts. It was empty in en, es, hi
      // and ru, which left the count with no noun in four of six languages —
      // and an empty string is exactly what the parity and fallback guards
      // above are built to tolerate, so neither could see it.
      //
      // Scoped to `row`. `column` is empty in the same four and stays that
      // way: nothing renders it as a bare unit.
      expect(infoFor(lang).row).not.toBe("");
    });

    it(`keeps every English placeholder in ${lang}`, () => {
      // Substituted by name, so a translation that drops one renders a static
      // sentence instead — a count region that reports the same number for
      // every search, or "columns inserted to the left." with no number. No
      // fallback covers this: the key is present, just malformed. Derived from
      // English rather than hand-listed, so the next such string is covered
      // without anyone remembering to add it.
      //
      // Walks the whole tree, not `en.info`. Scoped to `info` it covered 9 of
      // the 26 interpolated strings English defines: `rightclick` has 10 (the
      // context-menu result announcements), `findAndReplace` 4, and `filter`,
      // `sheetconfig` and `insertLink` one each — none of them visible to it.
      // All 26 are correct in all six languages today, so nothing was broken by
      // the gap; the point is that a section is the wrong unit for a rule about
      // every string.
      //
      // Asserted against the *resolved* locale rather than the file, because
      // that is what a consumer reads: a key the translation omits resolves to
      // the English string, which carries the placeholder by construction. The
      // failure this catches is a key that is present and malformed.
      const resolved = locale({ lang } as unknown as Context) as any;
      interpolatedStrings.forEach(([path, value]) => {
        const translated = path
          .split(".")
          .reduce((acc, key) => acc?.[key], resolved);
        (value.match(PLACEHOLDER) ?? []).forEach((placeholder) => {
          expect(typeof translated).toBe("string");
          expect(translated).toContain(placeholder);
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

/**
 * A translation file can carry a key whose "translation" is the key name itself
 * — `borderTop: "borderTop"` — which the parity test above cannot see, because
 * the key is present. Nothing is undefined, nothing throws, and the menu just
 * renders an English identifier at a reader of that language.
 *
 * The whole `border` section of `es` was in that state: thirteen camelCase
 * identifiers rendered verbatim in the border menu. That is what the
 * "Border labels are English-only" report turned out to be.
 *
 * Matching on `value === key` alone would be noisy and mostly wrong — plenty of
 * strings are legitimately identical to their key (`currencyDetail.EUR`,
 * `rightclick.log`, `align.left`). The signal is the key being **camelCase**:
 * no human language renders `borderTop`, but `EUR` and `log` are fine as they
 * are. So the rule is value === key AND the key has an internal capital, which
 * needs no allow-list and so cannot rot.
 */
describe("locale placeholder values", () => {
  const CAMEL_CASE = /[a-z][A-Z]/;

  const placeholders = (obj: unknown, prefix = ""): string[] =>
    Object.entries(obj as Record<string, unknown>).flatMap(([key, value]) => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return placeholders(value, `${prefix}${key}.`);
      }
      return value === key && CAMEL_CASE.test(key) ? [`${prefix}${key}`] : [];
    });

  const FILES: Record<string, unknown> = { en, es, hi, ru, zh, zh_tw };

  it.each(Object.keys(FILES))(
    "%s translates every camelCase key rather than echoing it",
    (lang) => {
      expect(placeholders(FILES[lang])).toEqual([]);
    }
  );
});
