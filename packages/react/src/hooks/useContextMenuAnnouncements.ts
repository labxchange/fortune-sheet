import React, { useEffect, useId, useRef, useState } from "react";
import _ from "lodash";
import { Context, locale, replaceHtml } from "@fortune-sheet/core";

/** Ignored by screen readers, but makes the text node differ so a repeat of the
 * same phrase is spoken. Same trick as `useFilterAnnouncements`. */
const ZERO_WIDTH_SPACE = "​";

/**
 * Suffix of the id of the element holding the text, which is referenced both as
 * a live region and as the cell input's description.
 *
 * A suffix rather than the whole id, because the id has to be unique per
 * workbook and this fork is embedded several times on one page: the spreadsheet
 * sim renders one `<Workbook>` per section, five of them in the Exploratory Data
 * Analysis sim alone. With a fixed id every instance rendered
 * `id="sr-contextMenuRegion"`, and an `aria-describedby` IDREF resolves to the
 * *first* match in the document — so the description of the cell input in
 * instance 3 pointed at instance 0's region, which is permanently empty. The
 * announcement was written correctly, into a region nothing referenced, and
 * VoiceOver read the focus utterance with a blank description: "text entry area,
 * blank, main". Every test rendered a single workbook, so all of them passed.
 *
 * Exported for tests, which locate the region with `[id$=...]`.
 */
export const CONTEXT_MENU_REGION_ID_SUFFIX = "sr-contextMenuRegion";

/**
 * How long the result stays available to be read. Long enough for a screen
 * reader to reach it in the focus utterance, short enough that it is gone before
 * the user navigates back to the same cell and would hear it a second time.
 */
const CLEAR_AFTER_MS = 4000;

/** The object `locale()` resolves to — the shape `key` below indexes into. */
type Strings = ReturnType<typeof locale>;

/** The keys of one locale section whose values are strings. */
type StringKeys<T> = {
  [K in keyof T]-?: T[K] extends string ? K : never;
}[keyof T];

/** Dotted paths into one locale section that resolve to a string. */
type PathsIn<S extends keyof Strings> = `${S & string}.${StringKeys<
  Strings[S]
> &
  string}`;

/**
 * Every key `announce` accepts.
 *
 * Typed rather than left as `string`, because the failure mode of a wrong key is
 * the exact WCAG 4.1.3 failure this hook exists to fix: `_.get` returns
 * `undefined`, the effect below returns early, and the action ships **silent** —
 * no throw, no console warning, nothing to notice. Only 8 of the ~32 keys in use
 * are asserted end-to-end anywhere in the suite (the rest need a merged range, a
 * read-only sheet or a hidden row to reach), so a typo in the other 24 would not
 * have failed a test either. `tsc` covers all of them at once.
 *
 * The template-built keys stay covered too: `countKey` is generic, so
 * `` `rightclick.announceRowInserted${"Above" | "Below"}` `` is inferred as a
 * union of literals against this type rather than widening to `string`.
 *
 * Three sections, because that is what the two menus and the sheet tab use.
 * Naming a string in a fourth is a type error asking you to add the section
 * here — deliberately, since the whole locale flattened is a union large enough
 * to be worth not asking `tsc` to build on every check.
 */
export type AnnouncementKey =
  | PathsIn<"rightclick">
  | PathsIn<"filter">
  | PathsIn<"sheetconfig">;

/**
 * Record the result of a menu action for the screen reader (WCAG 4.1.3).
 *
 * `key` is a dotted path into the locale object ("rightclick.announceCleared",
 * "filter.announceFilteredByColor") rather than a bare key, because the two
 * menus this serves keep their strings in different locale sections.
 *
 * `seq` is what makes a repeat speak: inserting a column twice produces the same
 * sentence, and without a changing trigger nothing would re-announce.
 *
 * Lives here, beside the hook that reads it, because both the cell context menu
 * and the filter dropdown write it while the element they write to belongs to
 * SheetOverlay. The filter dropdown has a region of its own, but that one renders
 * *inside* the menu and unmounts the instant an action closes it, so it can never
 * report a sort, a Confirm or a Clear filter.
 */
export function announce(
  draftCtx: Context,
  key: AnnouncementKey,
  params?: Record<string, string | number>
) {
  draftCtx.contextMenuAnnouncement = {
    key,
    params,
    seq: (draftCtx.contextMenuAnnouncement?.seq ?? 0) + 1,
  };
}

/**
 * Announce the result of a completed context-menu or filter-menu action.
 *
 * The delivery mechanism here is deliberate and was arrived at the hard way.
 *
 * Almost every one of these actions also moves focus to the cell input, because
 * a separate ticket requires it (WCAG 2.4.3). VoiceOver responds to a focus
 * change by announcing the newly focused element — "text entry area, blank" —
 * and that utterance **discards a live-region message queued in the same
 * moment**. A polite region was silent for that reason. Making the region
 * assertive did not help either: the focus announcement still won, and the only
 * action a user could hear was the one that happened not to move focus.
 *
 * So the result is not raced against the focus utterance; it is made *part* of
 * it. The text is written synchronously and the cell input points at it with
 * `aria-describedby`, so the focus announcement becomes "text entry area, blank,
 * 3 columns inserted to the left." — one utterance that cannot be dropped in
 * favour of another.
 *
 * The element is also a live region in its own right, for the few actions that
 * do not move focus (the filter dropdown's rows, before its own close moves
 * focus). It ships **assertive** — `role="alert" aria-live="assertive"` in
 * `SheetOverlay` — and that is load-bearing, not a preference: polite shipped
 * first and a VoiceOver pass found the messages silently dropped, because a
 * polite message queued alongside a focus utterance is discarded rather than
 * spoken after it. Assertive interrupts instead.
 *
 * That leaves two mechanisms pointed at the same text, and they can overlap:
 * assertive is not dropped, so on an action that moves focus the result may be
 * spoken twice — once as the interrupt, once inside the focus utterance. The
 * layering is deliberate (either one alone has a case where it is silent), but
 * which of the two wins per screen reader is not something the automated tests
 * can settle. It is the specific question the VoiceOver + Safari and
 * NVDA + Firefox passes need to answer; if double-speak turns out to be real,
 * the fix is to drop `aria-live` here and rely on the description alone.
 *
 * Both the text and the `aria-describedby` are cleared after a few seconds, or a
 * later visit to the same cell would read a stale result as its description.
 */
export function useContextMenuAnnouncements(
  context: Context,
  cellInputRef?: React.RefObject<HTMLElement | null>
): { regionId: string; announcement: string } {
  // The hook owns the id and hands it back for the caller to render, rather than
  // the caller passing one in: the `aria-describedby` written below and the
  // `id` on the region then cannot drift apart, which is the whole failure this
  // replaces.
  const regionId = `${useId()}-${CONTEXT_MENU_REGION_ID_SUFFIX}`;
  const strings = locale(context);
  const [announcement, setAnnouncement] = useState("");
  const announceCount = useRef(0);
  const request = context.contextMenuAnnouncement;
  // The whole trigger. Keying the effect on the request object would re-run it
  // on every context commit, since immer hands back a new object each time.
  const seq = request?.seq;

  // The request is never cleared from the context — only this hook's local
  // state is — which would matter if this component could mount fresh next to a
  // context that already holds one: the effect keys on `seq`, so a first mount
  // would replay the last result as if it had just happened. It cannot. The
  // only owner of a non-null request is `Workbook`'s own state, and `Sheet` (and
  // so `SheetOverlay`) is rendered without a `key`, so switching sheets
  // reconciles rather than remounts. The one route that does remount
  // `SheetOverlay` is remounting `Workbook`, which re-runs `defaultContext` and
  // starts from `undefined`. Clearing it would need a second commit per
  // announcement to buy nothing.

  useEffect(() => {
    if (request == null) return undefined;
    // Dotted path, so a caller can name a string in any locale section.
    const template = _.get(strings, request.key);
    // A key that does not resolve is left silent rather than announced as
    // "undefined" — so this branch is a fallback, not a guard: reaching it means
    // the action has already failed 4.1.3 quietly. Three things keep it
    // unreachable, and it is worth being exact about which covers what:
    //
    //  * `AnnouncementKey` — `tsc` rejects a key English does not define.
    //  * "locale key parity" (`core/test/locale.test.ts`) — every key English
    //    defines exists in the other five files, or is on a recorded backlog
    //    that `locale()` fills from English.
    //  * "keeps every English placeholder" (same file) — a translation cannot
    //    drop a `${count}` and render the sentence with no number. That case
    //    resolves to a non-empty string, so nothing here would catch it.
    if (typeof template !== "string" || template === "") return undefined;
    const text = request.params
      ? replaceHtml(template, request.params)
      : template;

    // Synchronous, not deferred. `focusAfterCommit` moves focus on a macrotask,
    // so the description has to be in the DOM before that runs or the focus
    // utterance is composed without it. This is the opposite of what this hook
    // used to do, and the reason it was inaudible.
    announceCount.current += 1;
    const spoken =
      announceCount.current % 2 === 0 ? `${text}${ZERO_WIDTH_SPACE}` : text;
    setAnnouncement(spoken);
    const cell = cellInputRef?.current;
    cell?.setAttribute("aria-describedby", regionId);

    /*
     * And written straight into the region as well as into state.
     *
     * `setAnnouncement` above is the source of truth — React owns this text
     * node and will render the same string moments later. But it renders on
     * React's own schedule, whereas the thing that has to see the text is a
     * `setTimeout(0)` focus move armed by `Dialog`'s cleanup *earlier in the
     * same commit*. Those are two different queues, so "the state render wins"
     * is a scheduling assumption rather than a guarantee — and if it loses, the
     * description resolves to an element that is still empty and the focus
     * utterance says "text entry area, blank". That is this bug's third
     * recurrence and each one has been an ordering assumption like it.
     *
     * `act()` flushes state and effects together, so no jsdom test can tell the
     * two apart: this is hardening against an ordering I cannot observe here,
     * not a fix for a reproduced failure. It is safe either way — React's
     * following commit writes the identical string, so the DOM converges on the
     * same value whichever lands first.
     */
    const region = document.getElementById(regionId);
    if (region) region.textContent = spoken;

    const timer = setTimeout(() => {
      setAnnouncement("");
      cell?.removeAttribute("aria-describedby");
    }, CLEAR_AFTER_MS);
    return () => {
      clearTimeout(timer);
      // The attribute has to come off with the timer, not just when the timer
      // fires. `cellInputRef` belongs to the workbook, not to this hook, so it
      // outlives this effect: cancelling the timer and stopping there left the
      // cell input describing a region that had unmounted — a dangling IDREF,
      // which readers resolve to nothing or fall through to the element's own
      // name, on the one control whose description is load-bearing here.
      //
      // Safe on the `seq` path too, and the ordering is the reason: React runs
      // this cleanup before the next effect body, which re-points the attribute
      // at the same id immediately. Removing then re-adding is also what makes
      // a repeat announcement a change rather than a no-op.
      cell?.removeAttribute("aria-describedby");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq]);

  return { regionId, announcement };
}

export default useContextMenuAnnouncements;
