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
  key: string,
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
 * The element stays a polite live region as well, for the few actions that do
 * not move focus (the filter dropdown's rows, before its own close moves focus).
 * Polite is correct now rather than a compromise: when focus *does* move, the
 * description already carries the text and the queued region message being
 * dropped is exactly what should happen — the alternative is hearing it twice.
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

  useEffect(() => {
    if (request == null) return undefined;
    // Dotted path, so a caller can name a string in any locale section.
    const template = _.get(strings, request.key);
    // A key that does not resolve is left silent rather than announced as
    // "undefined". The locale parity test is what stops this happening; this is
    // the runtime half of the same guard.
    if (typeof template !== "string" || template === "") return undefined;
    const text = request.params
      ? replaceHtml(template, request.params)
      : template;

    // Synchronous, not deferred. `focusAfterCommit` moves focus on a macrotask,
    // so the description has to be in the DOM before that runs or the focus
    // utterance is composed without it. This is the opposite of what this hook
    // used to do, and the reason it was inaudible.
    announceCount.current += 1;
    setAnnouncement(
      announceCount.current % 2 === 0 ? `${text}${ZERO_WIDTH_SPACE}` : text
    );
    const cell = cellInputRef?.current;
    cell?.setAttribute("aria-describedby", regionId);

    const timer = setTimeout(() => {
      setAnnouncement("");
      cell?.removeAttribute("aria-describedby");
    }, CLEAR_AFTER_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq]);

  return { regionId, announcement };
}

export default useContextMenuAnnouncements;
