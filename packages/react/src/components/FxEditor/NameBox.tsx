import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import _ from "lodash";
import {
  GRID_ROOT_CLASS,
  columnCharToIndex,
  getFlowdata,
  getRangetxt,
  iscelldata,
  locale,
  normalizeSelection,
  scrollToHighlightCell,
} from "@fortune-sheet/core";
import WorkbookContext from "../../context";
import { markAsRepeat } from "../../utils/liveRegion";

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

type Resolved = {
  row: [number, number];
  column: [number, number];
  clamped: boolean;
};

/**
 * Resolve a validated reference to row/column indices, clamped to the sheet.
 *
 * Deliberately not `getcellrange`, which would otherwise do this: it memoises
 * every string it resolves into `ctx.formulaCache.cellTextToIndexList`, a cache
 * nothing invalidates when rows or columns are inserted. That is survivable
 * while only the formula engine writes to it, but routing *navigation* through
 * it would let a name box jump seed the range a later `=SUM(A:A)` resolves to.
 * Parsing here also keeps resolution outside the `setContext` recipe, so a
 * reference that fails to resolve can be rejected properly rather than
 * bailing out mid-commit with the focus already moved.
 *
 * `iscelldata` has already accepted the syntax; this only turns it into
 * indices. A missing row half means the whole column (`A:A`), a missing column
 * half the whole row (`3:3`) — both admitted by `iscelldata` and both useful.
 */
const resolveReference = (
  txt: string,
  maxRow: number,
  maxColumn: number
): Resolved | null => {
  const parts = txt.split(":");
  if (parts.length > 2) return null;

  const rowOf = (part: string) => parseInt(part.replace(/[^0-9]/g, ""), 10) - 1;
  const columnOf = (part: string) =>
    columnCharToIndex(part.replace(/[^A-Za-z]/g, ""));

  const [start, end = start] = parts;
  const rawRow: [number, number] = [rowOf(start), rowOf(end)];
  const rawColumn: [number, number] = [columnOf(start), columnOf(end)];

  // A bare column or row carries no index for the other axis; it spans it.
  if (Number.isNaN(rawRow[0]) && Number.isNaN(rawRow[1])) {
    rawRow[0] = 0;
    rawRow[1] = maxRow;
  }
  if (Number.isNaN(rawColumn[0]) && Number.isNaN(rawColumn[1])) {
    rawColumn[0] = 0;
    rawColumn[1] = maxColumn;
  }
  if (rawRow.some(Number.isNaN) || rawColumn.some(Number.isNaN)) return null;
  if (rawRow[0] > rawRow[1] || rawColumn[0] > rawColumn[1]) return null;

  const row: [number, number] = [
    clamp(rawRow[0], 0, maxRow),
    clamp(rawRow[1], 0, maxRow),
  ];
  const column: [number, number] = [
    clamp(rawColumn[0], 0, maxColumn),
    clamp(rawColumn[1], 0, maxColumn),
  ];
  // `A0` and `A99999` are both syntactically fine and neither exists. Landing
  // the user somewhere they did not ask for is defensible; doing it silently is
  // not, so the caller announces it.
  const clamped =
    row[0] !== rawRow[0] ||
    row[1] !== rawRow[1] ||
    column[0] !== rawColumn[0] ||
    column[1] !== rawColumn[1];

  return { row, column, clamped };
};

/**
 * The reference box at the left of the formula bar.
 *
 * It was a display-only div: it showed the range in focus and accepted nothing,
 * so the one way to reach a distant cell was to scroll or arrow to it (WCAG
 * 2.1.1), and a screen reader announced it as static text rather than as the
 * control it looks like (4.1.2). It is now a labelled text input that both
 * tracks the selection and navigates to a typed reference.
 *
 * A native `<input>` rather than the `contentEditable` the formula bar uses:
 * the value flows through React's `value` prop, so — unlike that editor's
 * `innerHTML` path, which needs `escapeHTMLTag`/`escapeScriptTag` — a typed
 * string is never markup, and the role, value exposure and caret behaviour come
 * for free.
 */
const LocationBox: React.FC = () => {
  const { context, setContext, refs } = useContext(WorkbookContext);
  const { info } = locale(context);
  const inputRef = useRef<HTMLInputElement>(null);
  /**
   * `null` is the resting state: display the reference of the selection and
   * follow it as it moves. A string means the user is mid-edit, and a selection
   * change underneath must leave the half-typed text alone — an effect writing
   * the derived reference into the input on every `luckysheet_select_save`
   * change would erase it on any stray re-render.
   */
  const [draft, setDraft] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const statusCount = useRef(0);

  const rangeText = useMemo(() => {
    const lastSelection = _.last(context.luckysheet_select_save);
    if (
      !(
        lastSelection &&
        lastSelection.row_focus != null &&
        lastSelection.column_focus != null
      )
    )
      return "";
    const rf = lastSelection.row_focus;
    const cf = lastSelection.column_focus;
    const focusCellText = () =>
      getRangetxt(context, context.currentSheetId, {
        column: [cf, cf],
        row: [rf, rf],
      });
    if (context.config.merge != null && `${rf}_${cf}` in context.config.merge) {
      return focusCellText();
    }
    const text = getRangetxt(context, context.currentSheetId, lastSelection);
    // The workbook's first selection is `row: [0, null]` — the extent is not
    // resolved until a layout pass — and `getRangetxt` renders that end as
    // `NaN`: "A1:NaN". Cosmetic in the div this replaces; not here. It is the
    // announced value of a textbox, and `iscelldata` *accepts* it, so Enter on
    // an untouched name box committed a garbage range and silently selected
    // the whole sheet. The focus cell is what the box means in that state, and
    // is what `#sr-selection` already falls back to for the same reason.
    return text.includes("NaN") ? focusCellText() : text;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.currentSheetId, context.luckysheet_select_save]);

  // Selecting the reverted text is a DOM operation on a controlled input, so it
  // has to happen after the reverted value has been written back — not in the
  // handler that decided to revert.
  const selectOnStatus = useRef(false);
  useEffect(() => {
    if (!status || !selectOnStatus.current) return;
    selectOnStatus.current = false;
    inputRef.current?.select();
  }, [status]);

  /** A live region is silent when written the same text twice running, and two
   *  bad references in a row is the ordinary way to hit that. Same modulo-2
   *  marker the announcement hooks use. */
  const announce = useCallback((message: string) => {
    statusCount.current += 1;
    setStatus(statusCount.current % 2 === 0 ? markAsRepeat(message) : message);
  }, []);

  const commit = useCallback(() => {
    const txt = (draft ?? rangeText).trim();

    // An untouched box is not a command. Without this, focusing the box and
    // pressing Enter — including the Enter someone presses to retry after a
    // rejection — replaced the whole selection with its last range, silently
    // discarding a Ctrl-click multi-selection, and threw focus into the grid.
    if (txt === rangeText.trim()) {
      setDraft(null);
      return;
    }

    const flowdata = getFlowdata(context);
    const maxRow = (flowdata?.length ?? 0) - 1;
    const maxColumn = (flowdata?.[0]?.length ?? 0) - 1;

    // Validation and resolution both happen here, before anything is mutated,
    // so every rejection path is taken with the selection and the focus still
    // untouched. `iscelldata` strips a leading sheet name before testing, so
    // `Sheet2!A1` would pass it — sheet-qualified references are a non-goal
    // (they mean switching the active sheet), hence the `!` check ahead of it.
    const resolved =
      !txt ||
      txt.includes("!") ||
      !iscelldata(txt) ||
      maxRow < 0 ||
      maxColumn < 0
        ? null
        : resolveReference(txt, maxRow, maxColumn);

    if (!resolved) {
      setDraft(null);
      selectOnStatus.current = true;
      announce(info.nameBoxInvalidReference);
      return;
    }

    const [r1, r2] = resolved.row;
    const [c1, c2] = resolved.column;
    setDraft(null);
    setContext((draftCtx) => {
      draftCtx.luckysheet_select_status = false;
      draftCtx.luckysheet_select_save = [
        {
          row: [r1, r2],
          column: [c1, c2],
          row_focus: r1,
          column_focus: c1,
          // `A:A` and `3:3` are flagged the way `selectWholeLine` flags them,
          // so the headers highlight and the row/column context menus behave as
          // they do for a header click.
          ...(c1 === 0 && c2 === maxColumn ? { row_select: true } : {}),
          ...(r1 === 0 && r2 === maxRow ? { column_select: true } : {}),
        },
      ];
      normalizeSelection(draftCtx, draftCtx.luckysheet_select_save);
      scrollToHighlightCell(draftCtx, r1, c1);
    });

    // The cell itself is announced by `#sr-selection` once focus lands, so this
    // only has to report the part the user cannot infer: that they did not go
    // where they asked.
    if (resolved.clamped) {
      announce(info.nameBoxReferenceClamped);
    } else {
      setStatus("");
    }

    // Focus follows the selection into the grid, so the arrows keep working
    // where the user just navigated to — a deliberate focus change on user
    // action, and the point of the control. Rejection deliberately does not do
    // this: it would strand whoever mistyped.
    //
    // The target is the cell input, which is exactly where a plain click on a
    // cell leaves focus (`cellAreaMouseDown`), deferred the same way so the
    // input is in position first. Focusing the grid *root* was the obvious
    // choice and was wrong: it is an unnamed container with focusable
    // descendants, so a screen reader landing there navigated into it and read
    // the first thing it found — announcing "Select all cells" to a user who
    // had just navigated somewhere else entirely. The cell input is carved out
    // of `handleGlobalKeyDown`'s grid guard by name, so the arrows still work
    // from it, and focusing it does not begin editing — a click proves both.
    setTimeout(() => {
      const cellInput = refs.cellInput.current;
      if (cellInput) {
        cellInput.focus();
        return;
      }
      refs.workbookContainer.current
        ?.querySelector<HTMLElement>(`.${GRID_ROOT_CLASS}`)
        ?.focus();
    });
  }, [
    announce,
    context,
    draft,
    info.nameBoxInvalidReference,
    info.nameBoxReferenceClamped,
    rangeText,
    refs.cellInput,
    refs.workbookContainer,
    setContext,
  ]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setDraft(null);
        setStatus("");
      }
    },
    [commit]
  );

  return (
    <div className="fortune-name-box-container">
      <input
        ref={inputRef}
        type="text"
        // The class the div carried is kept: it is what the consuming
        // simulations' end-to-end tests locate this control by.
        className="fortune-name-box"
        dir="ltr"
        aria-label={info.nameBox}
        value={draft ?? rangeText}
        onChange={(e) => setDraft(e.target.value)}
        // Seeding the draft on focus is what stops a selection change from
        // overwriting the box while it is being typed into. Clearing the status
        // here rather than on blur is deliberate: a successful commit moves
        // focus into the grid, and clearing on blur would wipe the clamp
        // message before a screen reader had read it.
        onFocus={() => {
          setDraft(rangeText);
          setStatus("");
        }}
        // Abandoning on blur, as Escape does. Leaving a stale draft behind
        // would silently stop the box tracking the selection for good.
        onBlur={() => setDraft(null)}
        onKeyDown={onKeyDown}
      />
      <div id="sr-nameBox" className="sr-only" role="status">
        {status}
      </div>
    </div>
  );
};

export default LocationBox;
