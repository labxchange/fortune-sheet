import { locale } from "@fortune-sheet/core";
import React, { useContext, useEffect, useRef } from "react";
import WorkbookContext from "../../context";
import SVGIcon from "../SVGIcon";
import { activateOnEnterOrSpace } from "../../utils/keyboardActivation";
import { useEscapeToClose } from "../../hooks/useEscapeToClose";
import "./index.css";

type Props = {
  type?: "ok" | "yesno";
  onOk?: () => void;
  onCancel?: () => void;
  containerStyle?: React.CSSProperties;
  contentStyle?: React.CSSProperties;
  /**
   * Accessible name for the content area, when it scrolls independently of
   * the page. Turns the content `div` into a focusable `role="region"` so
   * keyboard users can reach it and scroll with the arrow keys — a plain
   * `overflow-y: auto` block is otherwise unreachable without a mouse (WCAG
   * 2.1.1).
   */
  contentRegionLabel?: string;
  /** Id of the element naming this dialog, usually its heading. */
  labelledBy?: string;
  /**
   * Escape handler, when it should differ from the close button's. Lets a
   * dialog spend the first Escape undoing something inside itself — clearing a
   * search box, say — instead of discarding the whole dialog. Defaults to
   * `onCancel`, so dialogs that don't care are unaffected.
   *
   * This has to live here rather than in a keydown handler on the inner
   * control: Escape is claimed by `useEscapeToClose` on `document` in the
   * capture phase, so a handler on a descendant never sees it.
   */
  onEscape?: () => void;
  /**
   * Where to put focus on open, when the first focusable element is not the
   * right landing place. Defaults to that first element, which is the close
   * button — fine for a confirm dialog, wrong for one whose first real control
   * is something the user came to use.
   */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  children?: React.ReactNode;
};

const Dialog: React.FC<Props> = ({
  type,
  onOk,
  onCancel,
  children,
  containerStyle,
  contentStyle,
  contentRegionLabel,
  labelledBy,
  onEscape,
  initialFocusRef,
}) => {
  const { context } = useContext(WorkbookContext);
  const { button } = locale(context);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // The setup below must run once per open, not once per handler identity.
  // Callers reasonably pass inline arrows, and when those were in the effect's
  // deps every re-render tore the listener down, re-ran the body and so pulled
  // focus back to the first focusable element — typing in a dialog that
  // filtered its own content bounced the caret to the close button on every
  // keystroke. Reading the handlers from a ref keeps them current without
  // making the effect depend on them.
  const handlers = useRef({ onCancel, onEscape });
  handlers.current = { onCancel, onEscape };

  // Escape via the shared stack rather than a listener of our own. The stack is
  // how layers agree who is innermost: useEscapeToClose listens on `document` in
  // the capture phase, so a still-open toolbar dropdown used to claim the key
  // and stopPropagation before this dialog's element-level listener ever ran —
  // the press appeared to do nothing. autoFocus/restoreFocus are off because
  // the effect below already does both, via initialFocusRef.
  useEscapeToClose({
    onClose: () => {
      const { onEscape: esc, onCancel: cancel } = handlers.current;
      (esc ?? cancel)?.();
    },
    containerRef: dialogRef,
    autoFocus: false,
    restoreFocus: false,
  });

  useEffect(() => {
    previousActiveElement.current =
      document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const trapFocus = (e: KeyboardEvent) => {
      // Escape is not handled here: it goes through useEscapeToClose below, so
      // this dialog joins the same open-instance stack every popup uses.
      if (e.key !== "Tab") return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute("disabled"));
      if (focusable.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement as HTMLElement | null;
      if (e.shiftKey && current === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      }
    };
    const focusable = dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (initialFocusRef?.current) {
      initialFocusRef.current.focus();
    } else if (focusable.length > 0) {
      focusable[0].focus();
    } else {
      dialog.focus();
    }
    dialog.addEventListener("keydown", trapFocus);
    return () => {
      dialog.removeEventListener("keydown", trapFocus);
      if (previousActiveElement.current?.isConnected) {
        previousActiveElement.current.focus();
      }
    };
  }, [initialFocusRef]);

  return (
    <div
      className="fortune-dialog"
      style={containerStyle}
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      // Callers that own a heading pass its id — the `labelledBy` prop the
      // comment here used to defer to, now that a caller (ShortcutsDialog)
      // needs it:
      // https://app.asana.com/1/1201629421181554/project/1210962482862973/task/1217671504196361
      //
      // Callers that pass nothing still name themselves by content:
      // role="dialog" plus aria-modal already has AT announce the role and read
      // what is inside, and the hardcoded, untranslated aria-label="Dialog"
      // that used to be here added nothing over the role. (It was paired with
      // an aria-labelledby pointing at #fortune-sort-title, which exists only
      // inside CustomSort, so every other dialog referenced a missing element.)
      // Those callers do still trip axe's aria-dialog-name rule, which the
      // useless "Dialog" name used to satisfy — the task above stays open until
      // showDialog threads a name through for them too.
      aria-labelledby={labelledBy}
      tabIndex={-1}
    >
      <div className="fortune-modal-dialog-header">
        <div
          className="fortune-modal-dialog-icon-close"
          onClick={onCancel}
          onKeyDown={activateOnEnterOrSpace}
          tabIndex={0}
          role="button"
          aria-label={button.close}
        >
          <SVGIcon name="close" style={{ padding: 7, cursor: "pointer" }} />
        </div>
      </div>
      <div
        className="fortune-dialog-box-content"
        style={contentStyle}
        {...(contentRegionLabel
          ? { tabIndex: 0, role: "region", "aria-label": contentRegionLabel }
          : undefined)}
      >
        {children}
      </div>
      {type != null && (
        <div className="fortune-dialog-box-button-container">
          {type === "ok" ? (
            <div
              className="fortune-message-box-button button-default"
              onClick={onOk}
              onKeyDown={activateOnEnterOrSpace}
              tabIndex={0}
              role="button"
            >
              {button.confirm}
            </div>
          ) : (
            <>
              <div
                className="fortune-message-box-button button-primary"
                onClick={onOk}
                onKeyDown={activateOnEnterOrSpace}
                tabIndex={0}
                role="button"
              >
                {button.confirm}
              </div>
              <div
                className="fortune-message-box-button button-default"
                onClick={onCancel}
                onKeyDown={activateOnEnterOrSpace}
                tabIndex={0}
                role="button"
              >
                {button.cancel}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default Dialog;
