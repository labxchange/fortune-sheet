import { Patch as ImmerPatch } from "immer";
import { PatchOptions } from "./utils";

export type Op = {
  op:
    | "replace"
    | "remove"
    | "add"
    | "insertRowCol"
    | "deleteRowCol"
    | "addSheet"
    | "deleteSheet";
  id?: string;
  path: (string | number)[];
  value?: any;
};

export type Rect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type CellStyle = {
  bl?: number;
  it?: number;
  ff?: number | string;
  fs?: number;
  fc?: string;
  ht?: number;
  vt?: number;
  tb?: string;
  cl?: number;
  un?: number;
  tr?: string;
};

export type Cell = {
  v?: string | number | boolean;
  m?: string | number;
  mc?: { r: number; c: number; rs?: number; cs?: number };
  f?: string;
  ct?: { fa?: string; t?: string; s?: any };
  qp?: number;
  spl?: any;
  bg?: string;
  lo?: number;
  rt?: number;
  ps?: {
    left: number | null;
    top: number | null;
    width: number | null;
    height: number | null;
    value: string;
    isShow: boolean;
  };
  hl?: { r: number; c: number; id: string };
} & CellStyle;

export type CellWithRowAndCol = {
  r: number;
  c: number;
  v: Cell | null;
};

export type CellMatrix = (Cell | null)[][];

export type Selection = {
  left?: number;
  width?: number;
  top?: number;
  height?: number;
  left_move?: number;
  width_move?: number;
  top_move?: number;
  height_move?: number;
  row: number[];
  column: number[];
  row_focus?: number;
  column_focus?: number;
  moveXY?: { x: number; y: number };
  row_select?: boolean;
  column_select?: boolean;
};

export type Presence = {
  sheetId: string;
  username: string;
  userId?: string;
  color: string;
  selection: {
    r: number;
    c: number;
  };
};

export type SheetConfig = {
  merge?: Record<string, { r: number; c: number; rs: number; cs: number }>; // 合并单元格
  rowlen?: Record<string, number>; // 表格行高
  columnlen?: Record<string, number>; // 表格列宽
  rowhidden?: Record<string, number>; // 隐藏行
  colhidden?: Record<string, number>; // 隐藏列
  customHeight?: Record<string, number>;
  customWidth?: Record<string, number>;
  borderInfo?: any[]; // 边框
  authority?: any;
  rowReadOnly?: Record<number, number>;
  colReadOnly?: Record<number, number>;
};

export type Image = {
  id: string;
  width: number;
  height: number;
  left: number;
  top: number;
  src: string;
};

export type Sheet = {
  name: string;
  config?: SheetConfig;
  order?: number;
  color?: string;
  data?: CellMatrix;
  celldata?: CellWithRowAndCol[];
  id?: string;
  images?: Image[];
  zoomRatio?: number;
  column?: number;
  row?: number;
  addRows?: number;
  status?: number;
  hide?: number;
  luckysheet_select_save?: Selection[];
  luckysheet_selection_range?: {
    row: number[];
    column: number[];
  }[];
  calcChain?: any[];
  defaultRowHeight?: number;
  defaultColWidth?: number;
  showGridLines?: boolean | number;
  pivotTable?: any;
  isPivotTable?: boolean;
  filter?: Record<string, any>;
  filter_select?: { row: number[]; column: number[] };
  luckysheet_conditionformat_save?: any[];
  luckysheet_alternateformat_save?: any[];
  dataVerification?: any;
  hyperlink?: Record<string, { linkType: string; linkAddress: string }>;
  dynamicArray_compute?: any;
  dynamicArray?: any[];
  frozen?: {
    type: "row" | "column" | "both" | "rangeRow" | "rangeColumn" | "rangeBoth";
    range?: { row_focus: number; column_focus: number };
  };
};

export type CommentBox = {
  r: number;
  c: number;
  rc: string;
  autoFocus: boolean;
  value: string;
  size: {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
  } & Rect;
} & Rect;

export type SearchResult = {
  r: number;
  c: number;
  sheetName: string;
  sheetId: string;
  cellPosition: string;
  value: string;
};

export type LinkCardProps = {
  sheetId: string;
  r: number;
  c: number;
  rc: string;
  originText: string;
  originType: string;
  originAddress: string;
  position: { cellLeft: number; cellBottom: number };
  isEditing: boolean;
  selectingCellRange?: boolean;
};

export type RangeDialogProps = {
  show: boolean;
  rangeTxt: string;
  type: string;
  singleSelect: boolean;
};

export type DataRegulationProps = {
  type: string;
  type2: string;
  rangeTxt: string;
  value1: string;
  value2: string;
  validity: string;
  remote: boolean;
  prohibitInput: boolean;
  hintShow: boolean;
  hintValue: string;
};

export type ConditionRulesProps = {
  rulesType: string;
  rulesValue: string;
  textColor: { check: boolean; color: string };
  cellColor: { check: boolean; color: string };
  betweenValue: { value1: string; value2: string };
  dateValue: string;
  repeatValue: string;
  projectValue: string;
};

export type FilterOptions = {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
  left: number;
  top: number;
  width: number;
  height: number;
  items: {
    col: number;
    left: number;
    top: number;
  }[];
};

export type History = {
  patches: ImmerPatch[];
  inversePatches: ImmerPatch[];
  options?: PatchOptions;
};

export type Freezen = {
  horizontal?: { freezenhorizontaldata: any[]; top: number };
  vertical?: { freezenverticaldata: any[]; left: number };
};

export type GlobalCache = {
  verticalScrollLock?: boolean;
  horizontalScrollLock?: boolean;
  overwriteCell?: boolean;
  ignoreWriteCell?: boolean;
  doNotFocus?: boolean;
  doNotUpdateCell?: boolean;
  recentTextColor?: string;
  recentBackgroundColor?: string;
  visibleColumnsUnique?: number[];
  visibleRowsUnique?: number[];
  undoList: History[];
  redoList: History[];
  /**
   * Which cell Replace last wrote, and what it wrote it for.
   *
   * Replace parks the selection on the cell it just rewrote, so the next press
   * finds that same cell again. Usually harmless — the replacement no longer
   * matches, so the search moves on — but when the replacement still contains
   * the search text ("8_10" -> "8_10_") the cell stays a match forever and
   * every press appends again. No stateless rule can tell "the user wants this
   * cell replaced" apart from "we just replaced it", because the text really is
   * still there; this is that missing distinction.
   *
   * The rule it implements is exactly: *if the cell we are about to replace is
   * the one we just replaced, under the same terms and modes on the same
   * sheet, move to the next one instead.* It is a test of the cell Replace has
   * picked, not of the selection — a range anchored on the just-replaced cell
   * satisfies it too, and so does landing back on that cell because the
   * selection sits somewhere that does not match at all. Find Next, clicking a
   * result row, another sheet, and editing either field or any of the three
   * modes all change what that cell or that identity is, so they invalidate
   * the cursor without anything having to clear it.
   *
   * The consequence is that reselecting the very cell Replace left the
   * selection on is refused: nothing here can tell that apart from never
   * having left it. A user who deliberately goes back to append once more has
   * to change a field first. That is the trade this ticket asks for — the
   * reported bug is that very cell being rewritten on every press.
   *
   * It lives here rather than in `Context` because it is not document state:
   * `filterPatch` keeps only `luckysheetfile` patches, so a cursor held in
   * context would be invisible to undo and would survive it, and the next
   * press would skip the cell the user had just restored. Undo and redo clear
   * it (`Workbook`), because they move the document out from under it.
   */
  replaceCursor?: {
    sheetId: string;
    r: number;
    c: number;
    searchText: string;
    replaceText: string;
    checkModes: {
      regCheck: boolean;
      wordCheck: boolean;
      caseCheck: boolean;
    };
  };
  editingCommentBoxEle?: HTMLDivElement;
  freezen?: Record<string, Freezen>;
  image?: {
    imgInitialPosition: Rect | undefined;
    cursorMoveStartPosition: { x: number; y: number } | undefined;
    resizingSide: string | undefined;
  };
  commentBox?: {
    movingId: string | undefined;
    resizingId: string | undefined;
    resizingSide: string | undefined;
    commentRC: { r: number; c: number; rc: string };
    boxInitialPosition: Rect | undefined;
    cursorMoveStartPosition: { x: number; y: number } | undefined;
  };
  searchDialog?: {
    // No hover flag here: the wheel guard asks the event's target instead, so
    // there is nothing to keep in sync with the pointer. See
    // SELF_SCROLLING_SELECTOR in events/mouse.ts.
    moveProps?: {
      initialPosition: Rect | undefined;
      cursorMoveStartPosition: { x: number; y: number } | undefined;
    };
  };
  linkCard?: {
    mouseEnter?: boolean;
    rangeSelectionModal?: {
      initialPosition: Rect | undefined;
      cursorMoveStartPosition: { x: number; y: number } | undefined;
    };
  };
  dragCellStartPos?: {
    x: number;
    y: number;
  };
  touchMoveStatus?: boolean;
  touchHandleStatus?: boolean;
  touchMoveStartPos?: {
    x: number;
    y: number;
    vy: number;
    moveType: string;
    vy_x?: number;
    vy_y?: number;
    scrollTop?: number;
    scrollLeft?: number;
  };
};

export type SingleRange = { row: number[]; column: number[] };
export type Range = SingleRange[];

// FORMULA
export type FormulaDependency = {
  row: [number, number];
  column: [number, number];
  sheetId: string | undefined;
};

type AncestorFormulaCell = {
  [rxcxix: string]: number;
};

export type FormulaCellInfo = {
  formulaDependency: FormulaDependency[];
  calc_funcStr: string;
  key: string;
  r: number;
  c: number;
  id: string;
  parents: AncestorFormulaCell;
  chidren: AncestorFormulaCell;
  color: string;
};

export type FormulaCellInfoMap = {
  [rxcxix: string]: FormulaCellInfo;
};

export type FormulaCell = {
  r: number;
  c: number;
  id: string;
  parent?: AncestorFormulaCell;
  func?: [boolean, number, string];
  color?: string;
  chidren?: AncestorFormulaCell;
  times?: number;
};
