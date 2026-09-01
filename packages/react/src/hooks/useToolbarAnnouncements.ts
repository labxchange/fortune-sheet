import React, { useCallback, useRef, useState } from "react";
import _ from "lodash";
import { Cell, Context, getFlowdata } from "@fortune-sheet/core";

import { markAsRepeat } from "../utils/liveRegion";

/**
 * What a toolbar action is capable of changing, as one comparable value.
 *
 * Deliberately narrow. A toolbar button acts on the selection, so the focused
 * cell stands in for the whole of it: every action covered here (the character
 * toggles, clear format, the decimal steppers, merge, text wrap) either changes
 * that cell or changed nothing at all. The two exceptions are state rather than
 * data — the paint model, and the filter range — so they are carried alongside.
 */
function actionFingerprint(ctx: Context): {
  cell: Cell | undefined | null;
  paintModelOn: boolean;
  filterRange: unknown;
} {
  const selection = ctx.luckysheet_select_save?.[0];
  const flowdata = getFlowdata(ctx);
  const row = selection?.row_focus;
  const column = selection?.column_focus;
  return {
    cell:
      flowdata && row != null && column != null
        ? flowdata[row]?.[column]
        : undefined,
    paintModelOn: ctx.luckysheetPaintModelOn === true,
    filterRange: ctx.luckysheet_filter_save,
  };
}

/**
 * Screen-reader feedback for toolbar actions.
 *
 * A toolbar button changes the sheet without moving the selection, so nothing
 * else writes to a live region: the only feedback is the canvas repainting,
 * which a screen-reader user never receives. This adds the missing confirmation.
 *
 * Two things make it more than "announce what was clicked":
 *
 * - **Announce the result, not the request.** The handlers in
 *   `core/modules/toolbar` are full of silent no-op paths — a non-numeric cell
 *   for the decimal steppers, a multi-range selection for the format painter, a
 *   read-only sheet for all of them. Announcing on click would report changes
 *   that never happened, which is worse than silence. So a phrase is only
 *   spoken when the fingerprint above actually moved.
 * - **Read the state after the commit.** The phrase for a toggle depends on the
 *   value the action produced, which does not exist while the handler is still
 *   running. Deferring by a task and re-reading `contextRef` is the same tactic
 *   `focusAfterCommit` uses, and `contextRef.current` is assigned during render,
 *   so by then it holds the committed context.
 */
export function useToolbarAnnouncements(
  contextRef: React.MutableRefObject<Context>
) {
  const [announcement, setAnnouncement] = useState("");
  const announceCount = useRef(0);

  /** A live region is silent when written the same text twice running, and
   *  toggling an attribute off and on again produces exactly that. Same
   *  modulo-2 marker the other announcement hooks use. */
  const announce = useCallback((message: string) => {
    announceCount.current += 1;
    setAnnouncement(
      announceCount.current % 2 === 0 ? markAsRepeat(message) : message
    );
  }, []);

  /**
   * Announce the outcome of a toolbar action, or stay silent if it had none.
   * `getPhrase` receives the committed context so it can describe the state the
   * action produced; returning an empty string suppresses the announcement.
   */
  const announceAfterCommit = useCallback(
    (getPhrase: (ctx: Context) => string) => {
      const before = actionFingerprint(contextRef.current);
      setTimeout(() => {
        const ctx = contextRef.current;
        if (_.isEqual(actionFingerprint(ctx), before)) return;
        const phrase = getPhrase(ctx);
        if (phrase) announce(phrase);
      });
    },
    [contextRef, announce]
  );

  /**
   * For an action whose effect the fingerprint cannot see. Undo and redo are
   * the whole of it: they restore arbitrary state — a row height, a sheet
   * rename — that need not touch the focused cell, and their buttons are
   * already disabled when there is nothing on the stack, so there is no no-op
   * to guard against.
   */
  const announceNow = useCallback(
    (phrase: string) => {
      if (phrase) announce(phrase);
    },
    [announce]
  );

  return { announcement, announceAfterCommit, announceNow };
}

export default useToolbarAnnouncements;
