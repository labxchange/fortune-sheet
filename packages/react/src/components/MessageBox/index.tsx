import React, { useId } from "react";
import Dialog from "../Dialog";

type Props = {
  type: "ok" | "yesno";
  onOk?: () => void;
  onCancel?: () => void;
  children?: React.ReactNode;
};

/**
 * Every alert in the package — all 24 `showAlert` call sites — renders through
 * here, so what a screen reader says about an outcome is decided in this file.
 *
 * It says it as an `alertdialog` named by its own message, and both halves
 * matter. As a plain `dialog` with no name, the message was a bare <div> with
 * no programmatic relationship to the dialog around it: focus landed on the
 * close button and whether the sentence was read on entry was left to the
 * reader (NVDA generally reads it, VoiceOver frequently does not). That put
 * outcomes like Replace All's count — the only place the number is reported —
 * in the reader-dependent category this package is trying to get out of.
 *
 * The message is the accessible *name* rather than an `aria-describedby`
 * description because there is no title to name it with, and an alertdialog is
 * required to have a name: naming it by the one translated string it has both
 * satisfies that and guarantees the sentence is announced. It also gives these
 * dialogs the name that axe's aria-dialog-name rule wants, which the shared
 * `Dialog` still owes its other callers.
 */
const MessageBox: React.FC<Props> = ({
  type = "yesno",
  onOk,
  onCancel,
  children,
}) => {
  const instanceId = useId();
  const messageId = `${instanceId}-message`;
  return (
    <Dialog
      type={type}
      role="alertdialog"
      labelledBy={messageId}
      onOk={onOk}
      onCancel={onCancel}
      contentStyle={{
        width: 300,
        paddingTop: 20,
        paddingBottom: 30,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div id={messageId}>{children}</div>
    </Dialog>
  );
};

export default MessageBox;
