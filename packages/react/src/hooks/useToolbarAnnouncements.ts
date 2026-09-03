import React, { useCallback, useRef, useState } from "react";
import _ from "lodash";
import { Cell, Context, getFlowdata } from "@fortune-sheet/core";

import { markAsRepeat } from "../utils/liveRegion";

/**
 * The cell a toolbar action is anchored on: the one holding the selection's
 * focus. Shared by the fingerprints below and by the phrases that report what
 * an action produced, so all three ask the same question of the same cell.
 */
export function anchorCell(ctx: Context): Cell | undefined | null {
  const selection = ctx.luckysheet_select_save?.[0];
  const flowdata = getFlowdata(ctx);
  const row = selection?.row_focus;
  const column = selection?.column_focus;
  return flowdata && row != null && column != null
    ? flowdata[row]?.[column]
    : undefined;
}

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
 * **Clear format and applying a border are not among them** and must not use
 * this: one rewrites every cell of every selection and rebuilds the border
 * list, the other writes only to that list — none of which the anchor can see.
 * Each has its own fingerprint below.
 */
function actionFingerprint(ctx: Context): {
  cell: Cell | undefined | null;
  paintModelOn: boolean;
  filterRange: unknown;
} {
  return {
    cell: anchorCell(ctx),
    paintModelOn: ctx.luckysheetPaintModelOn === true,
    filterRange: ctx.luckysheet_filter_save,
  };
}

/**
 * What *applying a border* is capable of changing.
 *
 * `handleBorder` writes nothing to the cell: it appends to `config.borderInfo`,
 * a sheet-level list the anchor cell cannot see. So the anchor fingerprint
 * above would report every border as a no-op. Its only refusal is a read-only
 * sheet, which returns before the append, so the list moving is exactly the
 * question "did the border land".
 */
export function borderFingerprint(ctx: Context): unknown {
  return ctx.config?.borderInfo;
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
   * For an action that *sets* a value rather than flipping one — a size, a
   * format, an alignment picked from a list.
   *
   * `announceAfterCommit` is wrong for these. It speaks only when something
   * moved, which is the right question for a toggle (a toggle that changed
   * nothing was refused) and the wrong one for a picker: choosing 12pt on a
   * cell that is already 12pt is a request that succeeded, and reporting it as
   * silence would make the control announce itself only intermittently. So the
   * phrase is asked instead to read the committed state and confirm the value
   * it wanted is the value now there — which stays silent for the refusals
   * that matter (a read-only sheet, a selection nothing was written to)
   * without treating "already correct" as one of them.
   */
  const announceOutcome = useCallback(
    (getPhrase: (ctx: Context) => string) => {
      setTimeout(() => {
        const phrase = getPhrase(contextRef.current);
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

  return { announcement, announceAfterCommit, announceOutcome, announceNow };
}

export default useToolbarAnnouncements;
