import {
  locale,
  ShortcutSection,
  getDefaultShortcutSections,
  shortcutKeysForPlatform,
} from "@fortune-sheet/core";
import React, {
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import WorkbookContext from "../../context";
import Dialog from "../Dialog";
import "./index.css";

/**
 * Only one shortcuts dialog may be open per page.
 *
 * A host can mount several workbooks at once — LabXchange's spreadsheet
 * simulations render one per scene in a filmstrip — and each carries its own
 * context, so nothing at the React level stops two from opening. This module
 * scope is shared by every instance in the bundle, which makes it the one place
 * that can see across them. The same approach `useEscapeToClose` takes for its
 * open-popup stack.
 */
let openInstance: string | null = null;

/**
 * Whether this workbook is the one the user can actually see. Hosts hide the
 * inactive copies with `inert` or `aria-hidden`; opening a dialog inside one of
 * those would trap focus in a subtree nothing can reach.
 */
function isReachable(node: HTMLElement | null): boolean {
  if (!node) return false;
  return !node.closest('[inert], [aria-hidden="true"]');
}

const ShortcutsDialog: React.FC<{
  extraSections?: ShortcutSection[];
}> = ({ extraSections }) => {
  const { context, setContext, refs } = useContext(WorkbookContext);
  const { info } = locale(context);
  const instanceId = useId();
  const headingId = `${instanceId}-shortcuts-heading`;
  const searchId = `${instanceId}-shortcuts-search`;
  const open = !!context.showShortcutsDialog;
  const claimed = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");

  const close = React.useCallback(() => {
    setContext((draftCtx) => {
      draftCtx.showShortcutsDialog = false;
    });
  }, [setContext]);

  // Read through a ref rather than closing over `query`, so this keeps one
  // identity for the life of the dialog. Dialog no longer re-runs its setup
  // when a handler changes, but a handler that changed on every keystroke would
  // still be a trap laid for the next person to add a dependency there.
  const queryRef = useRef(query);
  queryRef.current = query;
  const handleEscape = React.useCallback(() => {
    if (queryRef.current) {
      setQuery("");
      return;
    }
    close();
  }, [close]);

  useEffect(() => {
    if (!open) {
      // Reopening starts from the full list rather than the last search.
      setQuery("");
      return undefined;
    }

    if (
      (openInstance != null && openInstance !== instanceId) ||
      !isReachable(refs.workbookContainer.current)
    ) {
      close();
      return undefined;
    }

    openInstance = instanceId;
    claimed.current = true;
    return () => {
      if (claimed.current) {
        openInstance = null;
        claimed.current = false;
      }
    };
  }, [open, instanceId, close, refs.workbookContainer]);

  const sections = useMemo(() => {
    const base = getDefaultShortcutSections(context);
    return extraSections?.length ? [...base, ...extraSections] : base;
  }, [context, extraSections]);

  // Matches the action text and the key notation alike, so both "column" and
  // "space" find Ctrl+Space. Sections that end up empty drop out entirely
  // rather than leaving a bare heading behind.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sections;
    return sections
      .map((section) => ({
        ...section,
        items: section.items.filter(
          (item) =>
            item.description.toLowerCase().includes(q) ||
            item.keys.mac.toLowerCase().includes(q) ||
            item.keys.windows.toLowerCase().includes(q)
        ),
      }))
      .filter((section) => section.items.length > 0);
  }, [sections, query]);

  const matchCount = useMemo(
    () => filtered.reduce((n, section) => n + section.items.length, 0),
    [filtered]
  );

  if (!open || (openInstance != null && openInstance !== instanceId)) {
    return null;
  }

  return (
    // The same wrapper ModalProvider puts around a dialog. Without it this
    // renders as a flex item of `.fortune-container`, which is a column — so
    // the "dialog" appeared above the sheet and pushed it down the page.
    <div
      className="fortune-popover-backdrop fortune-modal-container"
      // SheetOverlay binds mousemove/mouseup on `document`, so without these a
      // text drag inside the dialog — selecting a shortcut's keys to copy them
      // — feeds the grid's drag machinery. ModalProvider carries the same four
      // guards around every other dialog.
      onMouseDown={(e) => e.stopPropagation()}
      onMouseMove={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <Dialog
        onCancel={close}
        // Spend the first Escape on clearing an active filter, so it undoes the
        // search rather than discarding a dialog the user is still reading. The
        // close button stays an unconditional close.
        onEscape={handleEscape}
        // Land on the search box, not the close button: with 30-odd rows,
        // filtering is the first thing most people want, and it doubles as the
        // start of the reading order.
        initialFocusRef={searchRef}
        labelledBy={headingId}
        containerStyle={{ maxWidth: 640, width: "90%" }}
        contentStyle={{ maxHeight: "70vh", overflowY: "auto" }}
      >
        <h2 className="fortune-shortcuts-title" id={headingId}>
          {info.shortcuts}
        </h2>

        <div className="fortune-shortcuts-search">
          <label htmlFor={searchId}>{info.shortcutSearchLabel}</label>
          <input
            id={searchId}
            ref={searchRef}
            type="search"
            value={query}
            placeholder={info.shortcutSearchPlaceholder}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* Filtering is visible at a glance but silent to a screen reader; this
            reports the new count as the results change. */}
        <div className="sr-only" role="status">
          {query.trim()
            ? info.shortcutSearchResultCount.replace(
                "${count}",
                String(matchCount)
              )
            : ""}
        </div>

        {filtered.length === 0 ? (
          <p className="fortune-shortcuts-empty">
            {info.shortcutSearchNoResults.replace("${query}", query.trim())}
          </p>
        ) : (
          filtered.map((section, sectionIndex) => (
            <section className="fortune-shortcuts-section" key={section.title}>
              {/* The table takes its name from this heading: four two-column
                  tables with identical headers are indistinguishable to anyone
                  navigating the dialog table by table. */}
              <h3
                className="fortune-shortcuts-section-title"
                id={`${instanceId}-section-${sectionIndex}`}
              >
                {section.title}
              </h3>
              <table
                className="fortune-shortcuts-table"
                aria-labelledby={`${instanceId}-section-${sectionIndex}`}
              >
                <thead>
                  <tr>
                    <th scope="col">{info.shortcutActionColumn}</th>
                    <th scope="col">{info.shortcutKeysColumn}</th>
                  </tr>
                </thead>
                <tbody>
                  {section.items.map((item) => (
                    <tr key={item.description}>
                      <td>{item.description}</td>
                      <td>
                        <kbd>{shortcutKeysForPlatform(item.keys)}</kbd>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))
        )}
      </Dialog>
    </div>
  );
};

export default ShortcutsDialog;
