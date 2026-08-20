import { locale } from "@fortune-sheet/core";
import React, { useContext, useEffect, useRef } from "react";
import WorkbookContext from "../../context";
import SVGIcon from "../SVGIcon";
import { activateOnEnterOrSpace } from "../../utils/keyboardActivation";
import "./index.css";

type Props = {
  type?: "ok" | "yesno";
  onOk?: () => void;
  onCancel?: () => void;
  containerStyle?: React.CSSProperties;
  contentStyle?: React.CSSProperties;
  /** Id of the element naming this dialog, usually its heading. */
  labelledBy?: string;
  children?: React.ReactNode;
};

const Dialog: React.FC<Props> = ({
  type,
  onOk,
  onCancel,
  children,
  containerStyle,
  contentStyle,
  labelledBy,
}) => {
  const { context } = useContext(WorkbookContext);
  const { button } = locale(context);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousActiveElement.current =
      document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const trapFocus = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel?.();
        return;
      }
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
    if (focusable.length > 0) {
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
  }, [onCancel]);

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
      <div className="fortune-dialog-box-content" style={contentStyle}>
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
