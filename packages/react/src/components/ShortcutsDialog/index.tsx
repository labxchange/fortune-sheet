import {
  locale,
  ShortcutSection,
  getDefaultShortcutSections,
  shortcutKeysForPlatform,
} from "@fortune-sheet/core";
import React, { useContext, useEffect, useId, useMemo, useRef } from "react";
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
  const open = !!context.showShortcutsDialog;
  const claimed = useRef(false);

  const close = React.useCallback(() => {
    setContext((draftCtx) => {
      draftCtx.showShortcutsDialog = false;
    });
  }, [setContext]);

  useEffect(() => {
    if (!open) return undefined;

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

  if (!open || (openInstance != null && openInstance !== instanceId)) {
    return null;
  }

  return (
    <div className="fortune-modal-dialog-mask">
      <Dialog
        onCancel={close}
        labelledBy={headingId}
        containerStyle={{ maxWidth: 640, width: "90%" }}
        contentStyle={{ maxHeight: "70vh", overflowY: "auto" }}
      >
        <h2 className="fortune-shortcuts-title" id={headingId}>
          {info.shortcuts}
        </h2>
        {sections.map((section) => (
          <section className="fortune-shortcuts-section" key={section.title}>
            <h3 className="fortune-shortcuts-section-title">{section.title}</h3>
            <table className="fortune-shortcuts-table">
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
        ))}
      </Dialog>
    </div>
  );
};

export default ShortcutsDialog;
