import { Context } from "../context";
import { locale } from "../locale";

/**
 * Key notation for the two platforms we render. Locale-independent by design:
 * modifier glyphs and the words Ctrl/Alt/Shift are not translated in the
 * spreadsheet applications this model follows, and keeping them out of the
 * locale files means a translation can never desynchronise from the binding
 * the code actually listens for.
 */
export type ShortcutKeys = {
  mac: string;
  windows: string;
};

export type ShortcutItem = {
  /**
   * Stable, locale-independent handle for this row. The dialog is a second
   * description of the binding table, so `keyboardShortcuts.test.js` asserts
   * every id has an exercised case: a row added without a test, or a test
   * without a row, turns the build red rather than waiting to be noticed.
   */
  id: string;
  keys: ShortcutKeys;
  /** Already localised, ready to render. */
  description: string;
};

export type ShortcutSection = {
  /** Already localised, ready to render. */
  title: string;
  items: ShortcutItem[];
};

const ARROWS = "↑ ↓ ← →";

/** Same keys on both platforms. */
const both = (keys: string): ShortcutKeys => ({ mac: keys, windows: keys });

/**
 * The binding that opens this dialog. Named because it is the one shortcut a
 * user cannot learn from the dialog itself — they have to already be in it —
 * so the toolbar button advertises it too, and both must quote the same keys.
 */
export const OPEN_SHORTCUTS_KEYS: ShortcutKeys = {
  mac: "⌘ /",
  windows: "Ctrl + /",
};

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  // `navigator.platform` is deprecated but is the only field available
  // everywhere we run; userAgentData is Chromium-only.
  return /Mac|iPhone|iPad|iPod/i.test(
    (navigator as any).userAgentData?.platform || navigator.platform || ""
  );
}

/** Pick the notation for the platform the user is actually on. */
export function shortcutKeysForPlatform(keys: ShortcutKeys): string {
  return isMacPlatform() ? keys.mac : keys.windows;
}

/**
 * The shortcuts the workbook itself implements, grouped for display.
 *
 * Hosts embedding the workbook add their own groups through the `Workbook`
 * `extraShortcutSections` prop rather than editing this list, so a shortcut
 * that lives outside the grid is still discoverable in the same dialog.
 */
export function getDefaultShortcutSections(ctx: Context): ShortcutSection[] {
  const { info } = locale(ctx);
  const d = info.shortcutDescriptions;

  return [
    {
      title: info.shortcutGroupNavigation,
      items: [
        {
          id: "moveBetweenCells",
          keys: both(ARROWS),
          description: d.moveBetweenCells,
        },
        { id: "moveRight", keys: both("Tab"), description: d.moveRight },
        { id: "moveLeft", keys: both("Shift + Tab"), description: d.moveLeft },
        {
          id: "goToToolbar",
          keys: { mac: "⌘ ⌥ T", windows: "Ctrl + Alt + T" },
          description: d.goToToolbar,
        },
        {
          id: "goToSpreadsheet",
          keys: { mac: "⌘ ⌥ S", windows: "Ctrl + Alt + S" },
          description: d.goToSpreadsheet,
        },
        {
          id: "goToSheetTabs",
          keys: { mac: "⌘ ⌥ B", windows: "Ctrl + Alt + B" },
          description: d.goToSheetTabs,
        },
        {
          id: "nextSheet",
          keys: { mac: "⌥ ↓", windows: "Alt + ↓" },
          description: d.nextSheet,
        },
        {
          id: "previousSheet",
          keys: { mac: "⌥ ↑", windows: "Alt + ↑" },
          description: d.previousSheet,
        },
        {
          id: "jumpToEdge",
          keys: { mac: `⌘ ${ARROWS}`, windows: `Ctrl + ${ARROWS}` },
          description: d.jumpToEdge,
        },
      ],
    },
    {
      title: info.shortcutGroupSelection,
      items: [
        {
          id: "selectRange",
          keys: both(`Shift + ${ARROWS}`),
          description: d.selectRange,
        },
        {
          id: "selectAll",
          keys: { mac: "⌘ A", windows: "Ctrl + A" },
          description: d.selectAll,
        },
        {
          id: "selectRow",
          keys: both("Shift + Space"),
          description: d.selectRow,
        },
        {
          id: "selectColumn",
          keys: { mac: "⌃ Space", windows: "Ctrl + Space" },
          description: d.selectColumn,
        },
        {
          id: "addSelectionRange",
          keys: both("Shift + F8"),
          description: d.addSelectionRange,
        },
        {
          id: "extendToEdge",
          keys: {
            mac: `⌘ ⇧ ${ARROWS}`,
            windows: `Ctrl + Shift + ${ARROWS}`,
          },
          description: d.extendToEdge,
        },
      ],
    },
    {
      title: info.shortcutGroupEditing,
      items: [
        { id: "editCell", keys: both("F2"), description: d.editCell },
        {
          id: "confirmCellEdit",
          keys: both("Enter"),
          description: d.confirmCellEdit,
        },
        {
          id: "deleteCellContent",
          keys: both("Delete / Backspace"),
          description: d.deleteCellContent,
        },
        {
          id: "cancelOrExitMode",
          keys: both("Escape"),
          description: d.cancelOrExitMode,
        },
        {
          id: "insertDateTime",
          keys: { mac: "⌘ ⇧ ;", windows: "Ctrl + Shift + ;" },
          description: d.insertDateTime,
        },
        {
          id: "copy",
          keys: { mac: "⌘ C", windows: "Ctrl + C" },
          description: d.copy,
        },
        {
          id: "cut",
          keys: { mac: "⌘ X", windows: "Ctrl + X" },
          description: d.cut,
        },
        {
          id: "paste",
          keys: { mac: "⌘ V", windows: "Ctrl + V" },
          description: d.paste,
        },
        {
          id: "pasteValuesOnly",
          keys: { mac: "⌘ ⇧ V", windows: "Ctrl + Shift + V" },
          description: d.pasteValuesOnly,
        },
        {
          id: "undo",
          keys: { mac: "⌘ Z", windows: "Ctrl + Z" },
          description: d.undo,
        },
        {
          id: "redo",
          keys: { mac: "⌘ ⇧ Z", windows: "Ctrl + Shift + Z" },
          description: d.redo,
        },
        {
          id: "autoFillDown",
          keys: { mac: "⌘ D", windows: "Ctrl + D" },
          description: d.autoFillDown,
        },
        {
          id: "autoFillRight",
          keys: { mac: "⌘ R", windows: "Ctrl + R" },
          description: d.autoFillRight,
        },
        {
          id: "boldText",
          keys: { mac: "⌘ B", windows: "Ctrl + B" },
          description: d.boldText,
        },
        {
          id: "zoomIn",
          keys: { mac: "⌃ +", windows: "Ctrl + +" },
          description: d.zoomIn,
        },
        {
          id: "zoomOut",
          keys: { mac: "⌃ -", windows: "Ctrl + -" },
          description: d.zoomOut,
        },
        {
          id: "zoomReset",
          keys: { mac: "⌃ 0", windows: "Ctrl + 0" },
          description: d.zoomReset,
        },
      ],
    },
    {
      title: info.shortcutGroupData,
      items: [
        {
          id: "find",
          keys: { mac: "⌘ F", windows: "Ctrl + F" },
          description: d.find,
        },
        {
          id: "replace",
          keys: { mac: "⌘ H", windows: "Ctrl + H" },
          description: d.replace,
        },
        {
          id: "openFilterMenu",
          keys: { mac: "⌃ ⌘ R", windows: "Ctrl + Alt + R" },
          description: d.openFilterMenu,
        },
        {
          id: "contextMenu",
          keys: { mac: "⌘ ⇧ M", windows: "Ctrl + Shift + M" },
          description: d.contextMenu,
        },
        {
          id: "rowContextMenu",
          keys: { mac: "⌘ ⇧ R", windows: "Ctrl + Shift + R" },
          description: d.rowContextMenu,
        },
        {
          id: "columnContextMenu",
          keys: { mac: "⌘ ⇧ L", windows: "Ctrl + Shift + L" },
          description: d.columnContextMenu,
        },
        {
          id: "openShortcuts",
          keys: OPEN_SHORTCUTS_KEYS,
          description: d.openShortcuts,
        },
      ],
    },
  ];
}
