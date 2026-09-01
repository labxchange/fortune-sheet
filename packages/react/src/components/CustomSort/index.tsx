import {
  Context,
  getSheetIndex,
  indexToColumnChar,
  locale,
  sortSelection,
} from "@fortune-sheet/core";
import React, {
  ChangeEvent,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import WorkbookContext from "../../context";
import "./index.css";
import { useDialog } from "../../hooks/useDialog";
import { activateOnEnterOrSpace } from "../../utils/keyboardActivation";
import { announce } from "../../hooks/useContextMenuAnnouncements";

type RadioChangeEvent = React.ChangeEvent<HTMLInputElement>;

/**
 * Id of the heading that names this dialog. Exported so the context menu can
 * pass it to `showDialog`'s `labelledBy` without repeating the literal.
 */
export const SORT_DIALOG_TITLE_ID = "fortune-sort-title";

const ASC_RADIO_ID = "fortune-sort-order-asc";
const DESC_RADIO_ID = "fortune-sort-order-desc";
const HAS_HEADER_CHECKBOX_ID = "fortune-sort-haveheader";

const CustomSort: React.FC<{}> = () => {
  const [rangeColChar, setRangeColChar] = useState<string[]>([]);
  const [ascOrDesc, setAscOrDesc] = useState(true);
  const { context, setContext } = useContext(WorkbookContext);
  const [selectedValue, setSelectedValue] = useState<string>("0");
  const [isTitleChange, setIstitleChange] = useState(false);
  const { sort } = locale(context);
  const { hideDialog } = useDialog();

  const handleSortConfirm = useCallback(() => {
    setContext((draftCtx: Context) => {
      sortSelection(draftCtx, ascOrDesc, parseInt(selectedValue, 10));
      // The sort itself was silent. Opening this dialog announces the dialog,
      // and closing it returns focus to the grid — but nothing ever said the
      // data had been reordered, which is the one thing that actually changed
      // (WCAG 4.1.3). Reuses the results the menu's own sort rows announce.
      announce(
        draftCtx,
        ascOrDesc
          ? "rightclick.announceSortedAsc"
          : "rightclick.announceSortedDesc"
      );
      draftCtx.contextMenu = {};
    });
    hideDialog();
  }, [ascOrDesc, hideDialog, selectedValue, setContext]);

  const col_start = context.luckysheet_select_save![0].column[0];
  const col_end = context.luckysheet_select_save![0].column[1];
  const row_start = context.luckysheet_select_save![0].row[0];
  const row_end = context.luckysheet_select_save![0].row[1];
  const startCell = `${indexToColumnChar(col_start)}${row_start + 1}`;
  const endCell = `${indexToColumnChar(col_end)}${row_end + 1}`;

  const sheetIndex = getSheetIndex(context, context.currentSheetId) as number;

  const handleSelectChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedValue(event.target.value);
  };

  // 改变排序方式
  const handleRadioChange = useCallback((e: RadioChangeEvent) => {
    const sortValue = e.target.value;
    setAscOrDesc(sortValue === "asc");
  }, []);

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.checked;
      setIstitleChange(value);
    },
    []
  );

  // 获取排序列
  useEffect(() => {
    const list: string[] = [];
    if (isTitleChange) {
      for (let i = col_start; i <= col_end; i += 1) {
        // 判断列首是否为空
        const cell = context.luckysheetfile[sheetIndex].data?.[row_start]?.[i];
        const colHeaderValue = cell?.m || cell?.v;
        if (colHeaderValue) {
          list.push(colHeaderValue as string);
        } else {
          const ColumnChar = indexToColumnChar(i);
          list.push(`${sort.columnOperation} ${ColumnChar}`);
        }
      }
    } else {
      for (let i = col_start; i <= col_end; i += 1) {
        const ColumnChar = indexToColumnChar(i);
        list.push(ColumnChar);
      }
    }
    setRangeColChar(list);
  }, [
    col_end,
    col_start,
    context.luckysheetfile,
    isTitleChange,
    row_start,
    sheetIndex,
    sort.columnOperation,
  ]);

  return (
    <div className="fortune-sort">
      <div className="fortune-sort-title">
        {/*
          The spaces are real text nodes, and they are load-bearing rather than
          formatting. This element is the dialog's accessible name via
          `aria-labelledby`, and name computation concatenates descendant text
          while ignoring CSS — so while the gaps came only from a `margin: 0 4px`
          on the cell references, the name computed as "Sort range fromF4toH6"
          and VoiceOver read it as one run-together word. That margin is gone, so
          the visible gap and the spoken gap now come from the same source.
        */}
        <span id={SORT_DIALOG_TITLE_ID}>
          {sort.sortRangeTitle} {startCell} {sort.sortRangeTitleTo} {endCell}
        </span>
      </div>

      <div>
        <div className="fortune-sort-modal">
          {/*
            The text beside each control was a bare <span>, so none of this
            dialog's three inputs had an accessible name (WCAG 4.1.2) — a screen
            reader announced "checkbox" and "radio button" and nothing else. A
            real <label> rather than aria-label, because the text is already on
            screen: associating it also makes the words a click target.
          */}
          <div>
            <input
              type="checkbox"
              id={HAS_HEADER_CHECKBOX_ID}
              onChange={handleTitleChange}
            />
            <label htmlFor={HAS_HEADER_CHECKBOX_ID}>{sort.hasTitle}</label>
          </div>

          <div className="fortune-sort-tablec">
            <table cellSpacing="0">
              <tbody>
                <tr>
                  <td style={{ width: "190px" }}>
                    <label htmlFor="fortune-sort-by-select">
                      {sort.sortBy}
                    </label>
                    <select
                      id="fortune-sort-by-select"
                      name="sort_0"
                      className="fortune-sort-by-select"
                      onChange={handleSelectChange}
                    >
                      {rangeColChar.map((col, index) => {
                        return (
                          <option value={index} key={index}>
                            {col}
                          </option>
                        );
                      })}
                    </select>
                  </td>
                  <td>
                    <div>
                      <input
                        type="radio"
                        id={ASC_RADIO_ID}
                        value="asc"
                        defaultChecked
                        name="sort_0"
                        onChange={handleRadioChange}
                      />
                      <label htmlFor={ASC_RADIO_ID}>{sort.asc}</label>
                    </div>
                    <div>
                      <input
                        type="radio"
                        id={DESC_RADIO_ID}
                        value="desc"
                        name="sort_0"
                        onChange={handleRadioChange}
                      />
                      <label htmlFor={DESC_RADIO_ID}>{sort.desc}</label>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="fortune-sort-button">
        <div
          className="button-basic button-primary"
          onClick={handleSortConfirm}
          onKeyDown={activateOnEnterOrSpace}
          tabIndex={0}
          role="button"
        >
          {sort.confirm}
        </div>
      </div>
    </div>
  );
};

export default CustomSort;
