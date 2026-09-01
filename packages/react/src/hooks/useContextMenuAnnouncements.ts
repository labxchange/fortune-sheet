import { useEffect, useRef, useState } from "react";
import _ from "lodash";
import { Context, locale, replaceHtml } from "@fortune-sheet/core";

/** Ignored by screen readers, but makes the text node differ so a repeat of the
 * same phrase is spoken. Same trick as `useFilterAnnouncements`. */
const ZERO_WIDTH_SPACE = "​";

/**
 * Record the result of a menu action for `#sr-contextMenuRegion` to announce
 * (WCAG 4.1.3). Called inside the `setContext` recipe, so it rides the same
 * commit as the mutation it describes.
 *
 * `key` is a dotted path ("rightclick.announceCleared",
 * "filter.announceFilteredByColor") because the two menus this serves keep their
 * strings in different locale sections. `seq` is what makes a repeat speak —
 * the same action twice produces the same sentence, and identical text is a
 * silent re-render.
 *
 * Shared by the cell context menu and the filter dropdown. The dropdown has its
 * own region, but that one renders *inside* the menu and unmounts the moment an
 * action closes it, so a sort/Confirm/Clear needs a region that outlives it.
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
 * Announce the result of a completed context-menu action.
 *
 * Every action in the menu was silent: a sighted user sees three columns appear,
 * a screen-reader user gets nothing (WCAG 4.1.3). The message states the
 * *result* — "3 columns inserted" — rather than echoing the row's own label,
 * which is what the audit asked for.
 *
 * Unlike `useFilterAnnouncements`, this derives nothing. A menu action's result
 * is not recoverable by diffing state: the count lives only in the handler, and
 * the selection has already moved by the time the region renders. So the handler
 * records `{ key, params, seq }` and this resolves it.
 */
export function useContextMenuAnnouncements(context: Context): string {
  const strings = locale(context);
  const [announcement, setAnnouncement] = useState("");
  const announceCount = useRef(0);
  const request = context.contextMenuAnnouncement;
  // The whole trigger. Keying the effect on the request object would re-run it
  // on every context commit, since immer hands back a new object each time.
  const seq = request?.seq;

  useEffect(() => {
    if (request == null) return undefined;
    const template = _.get(strings, request.key);
    // An unresolved key stays silent rather than announcing "undefined". The
    // locale parity test is the real guard; this is its runtime half.
    if (typeof template !== "string" || template === "") return undefined;
    const text = request.params
      ? replaceHtml(template, request.params)
      : template;

    // Deferred by a task rather than published in this commit, so the result
    // lands after the focus move rather than in the same frame as it.
    // `focusAfterCommit` defers the same way and was scheduled during the click
    // handler — before this effect ran — so it stays ahead in the task queue.
    const timer = setTimeout(() => {
      announceCount.current += 1;
      setAnnouncement(
        announceCount.current % 2 === 0 ? `${text}${ZERO_WIDTH_SPACE}` : text
      );
    });
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq]);

  return announcement;
}

export default useContextMenuAnnouncements;
