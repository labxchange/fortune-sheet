import _ from "lodash";
import { Context } from "../context";
import { Range } from "../types";
import { getSheetIndex } from "../utils";
import { isInlineStringCT } from "./inline-string";

/**
 * Merges, or un-merges, every range of the selection.
 *
 * Returns whether it changed anything. Each branch below skips a range that is
 * a single cell (`r1 === r2 && c1 === c2`), and the un-merge branches touch
 * only cells that carry an `mc` — so a press can legitimately do nothing, and
 * before this returned a value the caller had no way to tell that from a merge
 * that happened. The toolbar reports the outcome to a screen reader, where the
 * difference is the whole message: a single-cell selection left the button
 * looking dead to both mouse and keyboard. Same contract as `sortSelection`.
 */
export function mergeCells(
  ctx: Context,
  sheetId: string,
  ranges: Range,
  type: string
): boolean {
  // if (!checkIsAllowEdit()) {
  //   tooltip.info("", locale().pivotTable.errorNotAllowEdit);
  //   return;
  // }
  const idx = getSheetIndex(ctx, sheetId);
  if (idx == null) return false;

  const sheet = ctx.luckysheetfile[idx];

  const cfg = sheet.config || {};
  if (cfg.merge == null) {
    cfg.merge = {};
  }

  const d = sheet.data!;

  /** Whether any cell's merge state was actually rewritten. */
  let acted = false;

  // if (!checkProtectionNotEnable(ctx.currentSheetId)) {
  //   return;
  // }
  if (type === "merge-cancel") {
    for (let i = 0; i < ranges.length; i += 1) {
      const range = ranges[i];
      const r1 = range.row[0];
      const r2 = range.row[1];
      const c1 = range.column[0];
      const c2 = range.column[1];

      if (r1 === r2 && c1 === c2) {
        continue;
      }

      const fv: any = {};

      for (let r = r1; r <= r2; r += 1) {
        for (let c = c1; c <= c2; c += 1) {
          const cell = d[r][c];

          if (cell != null && cell.mc != null) {
            acted = true;
            const mc_r = cell.mc.r;
            const mc_c = cell.mc.c;

            if ("rs" in cell.mc) {
              delete cell.mc;
              delete cfg.merge[`${mc_r}_${mc_c}`];

              fv[`${mc_r}_${mc_c}`] = _.cloneDeep(cell) || {};
            } else {
              // let cell_clone = fv[mc_r + "_" + mc_c];
              const cell_clone = _.cloneDeep(fv[`${mc_r}_${mc_c}`]);

              delete cell_clone.v;
              delete cell_clone.m;
              delete cell_clone.ct;
              delete cell_clone.f;
              delete cell_clone.spl;

              d[r][c] = cell_clone;
            }
          }
        }
      }
    }
  } else {
    let isHasMc = false; // 选区是否含有 合并的单元格

    for (let i = 0; i < ranges.length; i += 1) {
      const range = ranges[i];
      const r1 = range.row[0];
      const r2 = range.row[1];
      const c1 = range.column[0];
      const c2 = range.column[1];

      for (let r = r1; r <= r2; r += 1) {
        for (let c = c1; c <= c2; c += 1) {
          const cell = d[r][c];

          if (cell?.mc) {
            isHasMc = true;
            break;
          }
        }
      }
    }

    if (isHasMc) {
      // 选区有合并单元格（选区都执行 取消合并）
      for (let i = 0; i < ranges.length; i += 1) {
        const range = ranges[i];
        const r1 = range.row[0];
        const r2 = range.row[1];
        const c1 = range.column[0];
        const c2 = range.column[1];

        if (r1 === r2 && c1 === c2) {
          continue;
        }

        const fv: any = {};

        for (let r = r1; r <= r2; r += 1) {
          for (let c = c1; c <= c2; c += 1) {
            const cell = d[r][c];

            if (cell != null && cell.mc != null) {
              acted = true;
              const mc_r = cell.mc.r;
              const mc_c = cell.mc.c;

              if ("rs" in cell.mc) {
                delete cell.mc;
                delete cfg.merge[`${mc_r}_${mc_c}`];

                fv[`${mc_r}_${mc_c}`] = _.cloneDeep(cell) || {};
              } else {
                // let cell_clone = fv[mc_r + "_" + mc_c];
                const cell_clone = _.cloneDeep(fv[`${mc_r}_${mc_c}`]);

                delete cell_clone.v;
                delete cell_clone.m;
                delete cell_clone.ct;
                delete cell_clone.f;
                delete cell_clone.spl;

                d[r][c] = cell_clone;
              }
            }
          }
        }
      }
    } else {
      for (let i = 0; i < ranges.length; i += 1) {
        const range = ranges[i];
        const r1 = range.row[0];
        const r2 = range.row[1];
        const c1 = range.column[0];
        const c2 = range.column[1];

        if (r1 === r2 && c1 === c2) {
          continue;
        }

        // Set per branch, not before the dispatch: an unrecognised `type`
        // must not report a merge that never happened. `handlerMap`'s
        // "merge-all" entry passes "mergeAll", which matches none of the three,
        // and `handleMerge` turns a `true` here into a "changed" announcement.
        if (type === "merge-all") {
          acted = true;
          let fv = {};
          let isfirst = false;

          for (let r = r1; r <= r2; r += 1) {
            for (let c = c1; c <= c2; c += 1) {
              const cell = d[r][c];

              if (
                cell != null &&
                (isInlineStringCT(cell.ct) ||
                  !_.isEmpty(cell.v) ||
                  cell.f != null) &&
                !isfirst
              ) {
                fv = _.cloneDeep(cell) || {};
                isfirst = true;
              }

              d[r][c] = { mc: { r: r1, c: c1 } };
            }
          }

          d[r1][c1] = fv;
          const a = d[r1][c1];
          if (!a) return acted;
          a.mc = { r: r1, c: c1, rs: r2 - r1 + 1, cs: c2 - c1 + 1 };

          cfg.merge[`${r1}_${c1}`] = {
            r: r1,
            c: c1,
            rs: r2 - r1 + 1,
            cs: c2 - c1 + 1,
          };
        } else if (type === "merge-vertical") {
          acted = true;

          for (let c = c1; c <= c2; c += 1) {
            let fv = {};
            let isfirst = false;

            for (let r = r1; r <= r2; r += 1) {
              const cell = d[r][c];

              if (
                cell != null &&
                (!_.isEmpty(cell.v) || cell.f != null) &&
                !isfirst
              ) {
                fv = _.cloneDeep(cell) || {};
                isfirst = true;
              }

              d[r][c] = { mc: { r: r1, c } };
            }

            d[r1][c] = fv;
            const a = d[r1][c];
            if (!a) return acted;
            a.mc = { r: r1, c, rs: r2 - r1 + 1, cs: 1 };

            cfg.merge[`${r1}_${c}`] = {
              r: r1,
              c,
              rs: r2 - r1 + 1,
              cs: 1,
            };
          }
        } else if (type === "merge-horizontal") {
          acted = true;

          for (let r = r1; r <= r2; r += 1) {
            let fv = {};
            let isfirst = false;

            for (let c = c1; c <= c2; c += 1) {
              const cell = d[r][c];

              if (
                cell != null &&
                (!_.isEmpty(cell.v) || cell.f != null) &&
                !isfirst
              ) {
                fv = _.cloneDeep(cell) || {};
                isfirst = true;
              }

              d[r][c] = { mc: { r, c: c1 } };
            }

            d[r][c1] = fv;
            const a = d[r][c1];
            if (!a) return acted;
            a.mc = { r, c: c1, rs: 1, cs: c2 - c1 + 1 };

            cfg.merge[`${r}_${c1}`] = {
              r,
              c: c1,
              rs: 1,
              cs: c2 - c1 + 1,
            };
          }
        }
      }
    }
  }
  sheet.config = cfg;
  if (sheet.id === ctx.currentSheetId) {
    ctx.config = cfg;
  }
  return acted;
}
