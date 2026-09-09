import { useEffect, useRef, useState } from "react";
import { Context, locale, replaceHtml } from "@fortune-sheet/core";

/**
 * Announce that the formula suggestion list has appeared, and how many entries
 * it holds.
 *
 * The list carries no `aria-expanded` — that attribute is not permitted on the
 * `role="textbox"` both editors use, and re-roling them to `combobox` would
 * change what is announced on every cell move in every consumer. So its
 * appearance is carried by a polite status region instead, which is what WCAG
 * 4.1.3 asks for.
 *
 * The announcement fires once, on the list *appearing* -- not on every
 * keystroke that narrows it. Narrowing needs no message: once the list is open,
 * moving between entries is spoken by the screen reader following
 * `aria-activedescendant`, and re-announcing the count would talk over the
 * learner as they type. `polite` for the same reason.
 *
 * It does not race `#sr-selection`. That region is an assertive alert tied to
 * the selection changing, and the selection does not move during formula entry,
 * so it is silent for exactly as long as this one has something to say.
 *
 * `enabled` is what keeps the two callers from speaking over each other.
 * `functionCandidates` is a single global field with no record of which editor
 * populated it, but the list is only ever rendered under the editor that has
 * focus -- so each caller passes the same condition that gates its own copy of
 * the list, and the region belonging to the editor that is not being typed in
 * stays quiet. Without it, typing in the formula bar would announce the count
 * twice: once from the bar's region and once from the cell's.
 */
export function useFormulaSuggestionAnnouncement(
  context: Context,
  enabled: boolean
): string {
  const { info } = locale(context);
  const [announcement, setAnnouncement] = useState("");

  const candidateCount = enabled ? context.functionCandidates.length : 0;
  const announcedCountRef = useRef(0);

  useEffect(() => {
    if (candidateCount === 0) {
      announcedCountRef.current = 0;
      setAnnouncement("");
      return;
    }
    // Only when the list was closed a moment ago -- the ref, not the count, is
    // the "have I already spoken for this list" record, so a list that narrows
    // from five entries to two stays quiet.
    if (announcedCountRef.current === 0) {
      announcedCountRef.current = candidateCount;
      setAnnouncement(
        replaceHtml(info.formulaSuggestionsAvailable, {
          count: candidateCount,
        })
      );
    }
  }, [candidateCount, info.formulaSuggestionsAvailable]);

  return announcement;
}

export default useFormulaSuggestionAnnouncement;
