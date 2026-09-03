import React, { useContext, useCallback } from "react";
import Dialog from "../components/Dialog";
import { ModalContext } from "../context/modal";

/**
 * Options form of `showDialog`'s tail, so a caller can pass `labelledBy` and
 * give the dialog an accessible name (WCAG 4.1.2). `Dialog` has accepted
 * `labelledBy` since ShortcutsDialog needed it, but `showDialog` forwarded
 * nothing, so every dialog opened through this hook — the Sort modal included —
 * rendered unnamed.
 *
 * Overloaded onto the `type` argument rather than added as a fifth positional
 * one: 35 of the 36 call sites pass only `content` or `content, "ok"`, so a
 * fifth parameter would have to be reached past three `undefined`s.
 */
export type DialogOptions = {
  type?: "ok" | "yesno";
  onOk?: () => void;
  onCancel?: () => void;
  /** Id of the element naming this dialog, usually its heading. */
  labelledBy?: string;
};

export function useDialog() {
  const { showModal, hideModal } = useContext(ModalContext);
  const showDialog = useCallback(
    (
      content: string | React.ReactNode,
      typeOrOptions?: "ok" | "yesno" | DialogOptions,
      onOk: () => void = hideModal,
      onCancel: () => void = hideModal
    ) => {
      // The positional defaults stay the source of `onOk`/`onCancel`, so the
      // options form only has to name what it actually overrides.
      const options: DialogOptions =
        typeof typeOrOptions === "string"
          ? { type: typeOrOptions, onOk, onCancel }
          : { onOk, onCancel, ...typeOrOptions };
      showModal(
        <Dialog
          type={options.type}
          onOk={options.onOk}
          onCancel={options.onCancel}
          labelledBy={options.labelledBy}
        >
          {content}
        </Dialog>
      );
    },
    [hideModal, showModal]
  );
  return {
    showDialog,
    hideDialog: hideModal,
  };
}
