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
        { keys: both(ARROWS), description: d.moveBetweenCells },
        { keys: both("Tab"), description: d.moveRight },
        { keys: both("Shift + Tab"), description: d.moveLeft },
        {
          keys: { mac: "⌘ ⌥ T", windows: "Ctrl + Alt + T" },
          description: d.goToToolbar,
        },
        {
          keys: { mac: "⌘ ⌥ S", windows: "Ctrl + Alt + S" },
          description: d.goToSpreadsheet,
        },
        {
          keys: { mac: "⌘ ⌥ B", windows: "Ctrl + Alt + B" },
          description: d.goToSheetTabs,
        },
        { keys: { mac: "⌥ ↓", windows: "Alt + ↓" }, description: d.nextSheet },
        {
          keys: { mac: "⌥ ↑", windows: "Alt + ↑" },
          description: d.previousSheet,
        },
      ],
    },
    {
      title: info.shortcutGroupSelection,
      items: [
        { keys: both(`Shift + ${ARROWS}`), description: d.selectRange },
        { keys: { mac: "⌘ A", windows: "Ctrl + A" }, description: d.selectAll },
        { keys: both("Shift + Space"), description: d.selectRow },
        { keys: both("Ctrl + Space"), description: d.selectColumn },
        { keys: both("Shift + F8"), description: d.addSelectionRange },
      ],
    },
    {
      title: info.shortcutGroupEditing,
      items: [
        { keys: both("F2"), description: d.editCell },
        { keys: both("Enter"), description: d.confirmCellEdit },
        { keys: both("Delete"), description: d.deleteCellContent },
        { keys: { mac: "⌘ C", windows: "Ctrl + C" }, description: d.copy },
        { keys: { mac: "⌘ X", windows: "Ctrl + X" }, description: d.cut },
        { keys: { mac: "⌘ V", windows: "Ctrl + V" }, description: d.paste },
        {
          keys: { mac: "⌘ ⇧ V", windows: "Ctrl + Shift + V" },
          description: d.pasteValuesOnly,
        },
        { keys: { mac: "⌘ Z", windows: "Ctrl + Z" }, description: d.undo },
        {
          keys: { mac: "⌘ ⇧ Z", windows: "Ctrl + Shift + Z" },
          description: d.redo,
        },
        {
          keys: { mac: "⌘ D", windows: "Ctrl + D" },
          description: d.autoFillDown,
        },
        {
          keys: { mac: "⌘ R", windows: "Ctrl + R" },
          description: d.autoFillRight,
        },
        { keys: { mac: "⌘ B", windows: "Ctrl + B" }, description: d.boldText },
      ],
    },
    {
      title: info.shortcutGroupData,
      items: [
        { keys: { mac: "⌘ F", windows: "Ctrl + F" }, description: d.find },
        { keys: { mac: "⌘ H", windows: "Ctrl + H" }, description: d.replace },
        {
          keys: { mac: "⌃ ⌘ R", windows: "Ctrl + Alt + R" },
          description: d.openFilterMenu,
        },
        {
          keys: { mac: "⌘ ⇧ M", windows: "Ctrl + Shift + M" },
          description: d.contextMenu,
        },
        {
          keys: { mac: "⌘ ⇧ R", windows: "Ctrl + Shift + R" },
          description: d.rowContextMenu,
        },
        {
          keys: { mac: "⌘ ⇧ L", windows: "Ctrl + Shift + L" },
          description: d.columnContextMenu,
        },
        {
          keys: { mac: "⌘ /", windows: "Ctrl + /" },
          description: d.openShortcuts,
        },
      ],
    },
  ];
}
