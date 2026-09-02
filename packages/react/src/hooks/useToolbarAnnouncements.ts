import React, { useCallback, useRef, useState } from "react";
import _ from "lodash";
import { Cell, Context, getFlowdata } from "@fortune-sheet/core";

import { markAsRepeat } from "../utils/liveRegion";

/**
 * What a toolbar action is capable of changing, as one comparable value.
 *
 * Deliberately narrow. A toolbar button acts on the selection, so the focused
 * cell stands in for the whole of it — but only for the actions that are
 * themselves anchor-driven. The character toggles, the decimal steppers, merge
 * and text wrap all read `row_focus`/`column_focus` in `core/modules/toolbar`
 * and return early on an unsuitable anchor, so watching the anchor watches
 * exactly what they can change. The two exceptions are state rather than data —
 * the paint model, and the filter range — so they are carried alongside.
 *
 * **Clear format is not one of them** and must not use this: it rewrites every
 * cell of every selection and rebuilds the border list, none of which the anchor
 * can see. It has its own fingerprint below.
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

/** The keys `handleClearFormat` keeps; everything else on a cell is formatting
 *  and is what the action strips. */
const PRESERVED_BY_CLEAR_FORMAT = ["v", "m", "mc", "f", "ct"];

/**
 * What *clear format* is capable of changing.
 *
 * It walks every cell of every selection replacing the cell with a pick of the
 * keys above, then rebuilds `config.borderInfo`. So the honest question is how
 * many cells in the selection still carry formatting, plus the border list —
 * not what the focused cell looks like. Selecting a text header above a column
 * of bold numbers, with the anchor on the header, is the case the anchor gets
 * wrong: the header survives `_.pick` unchanged while the numbers below lose
 * their formatting, and the action would report nothing.
 *
 * Counting rather than snapshotting keeps this cheap on a whole-column
 * selection, and hidden rows need no special handling: `handleClearFormat`
 * skips them, so a formatted hidden cell is counted identically before and
 * after and correctly reads as "nothing changed".
 */
export function clearFormatFingerprint(ctx: Context): {
  formattedCells: number;
  borderInfo: unknown;
} {
  const flowdata = getFlowdata(ctx);
  let formattedCells = 0;
  ctx.luckysheet_select_save?.forEach((selection) => {
    const [rowSt, rowEd] = selection.row;
    const [colSt, colEd] = selection.column;
    for (let r = rowSt; r <= rowEd; r += 1) {
      for (let c = colSt; c <= colEd; c += 1) {
        const cell = flowdata?.[r]?.[c];
        if (
          cell &&
          Object.keys(cell).some((k) => !PRESERVED_BY_CLEAR_FORMAT.includes(k))
        ) {
          formattedCells += 1;
        }
      }
    }
  });
  return { formattedCells, borderInfo: ctx.config?.borderInfo };
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
   * `fingerprint` decides what counts as "had an effect" — the anchor-cell
   * default suits the actions that are themselves anchor-driven, and an action
   * that reaches wider than its anchor passes its own.
   */
  const announceAfterCommit = useCallback(
    (
      getPhrase: (ctx: Context) => string,
      fingerprint: (ctx: Context) => unknown = actionFingerprint
    ) => {
      const before = fingerprint(contextRef.current);
      setTimeout(() => {
        const ctx = contextRef.current;
        if (_.isEqual(fingerprint(ctx), before)) return;
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
