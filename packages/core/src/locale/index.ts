import _ from "lodash";
import en from "./en";
import zh from "./zh";
import es from "./es";
import hi from "./hi";
import ru from "./ru";
import zh_tw from "./zh_tw";
import { Context } from "..";

const localeObj: Record<string, typeof zh> = {
  // @ts-ignore
  en,
  zh,
  // @ts-ignore
  es,
  // @ts-ignore
  "zh-TW": zh_tw,
  // @ts-ignore
  hi,
  // @ts-ignore
  ru,
};

// Resolved languages, cached so the returned object stays referentially stable:
// consumers list it in effect dependency arrays, and a fresh object per call
// would re-run those on every render.
const resolved: Record<string, typeof zh> = {};

/**
 * Merge a language over English so a key the translation omits falls back to
 * the English string instead of `undefined`. Missing strings are otherwise
 * invisible: the locale files are individually `@ts-ignore`d in the map above,
 * so tsc does not catch a gap, and a screen-reader-only string that nothing
 * renders visibly first surfaces as a render-time throw out of `replaceHtml`.
 *
 * Arrays are taken from the translation whole rather than merged index by
 * index. `functionlist` has a different number of entries per language (en 372,
 * zh 371, ru 433), so an index-wise merge would splice English fields into
 * misaligned translated entries.
 */
function resolveLang(lang: string) {
  if (lang === "en") return localeObj.en;
  return _.mergeWith({}, en, localeObj[lang], (_objValue, srcValue) =>
    _.isArray(srcValue) ? srcValue : undefined
  ) as typeof zh;
}

function locale(ctx: Context) {
  const langsToTry = [ctx.lang || "", ctx.lang?.split("-")[0] || ""];
  const lang = langsToTry.find((l) => l in localeObj) ?? "en";
  if (resolved[lang] == null) {
    resolved[lang] = resolveLang(lang);
  }
  return resolved[lang];
}

export { locale };
