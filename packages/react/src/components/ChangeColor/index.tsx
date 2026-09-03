import { Context, getSheetIndex, locale } from "@fortune-sheet/core";
import React, {
  useCallback,
  useContext,
  useEffect,
  useId,
  useState,
} from "react";
import WorkbookContext from "../../context";
import ColorPicker from "../Toolbar/ColorPicker";
import ColorHexInput from "../Toolbar/ColorHexInput";
import { activateOnEnterOrSpace } from "../../utils/keyboardActivation";
import "./index.css";

type Props = {
  triggerParentUpdate: (state: boolean) => void;
  /**
   * A colour was applied to the sheet — by a swatch, by the reset row, or by
   * Confirm. `undefined` means the colour was removed.
   *
   * Raised rather than announced here because Confirm also closes this menu:
   * a live region inside a subtree that unmounts in the same commit is gone
   * before a screen reader can read it, so the region has to live in the
   * component that outlives it.
   */
  onColorApplied?: (color: string | undefined) => void;
  /** Confirm was pressed: the caller closes the menu and moves focus. */
  onConfirm?: () => void;
};

export const ChangeColor: React.FC<Props> = ({
  triggerParentUpdate,
  onColorApplied,
  onConfirm,
}) => {
  const { context, setContext } = useContext(WorkbookContext);
  const { toolbar, sheetconfig, button } = locale(context);
  const [inputColor, setInputColor] = useState<string>("#000000");
  const [selectColor, setSelectColor] = useState<undefined | string>(
    context.luckysheetfile[
      getSheetIndex(context, context.currentSheetId) as number
    ].color
  );

  const customColorLabelId = useId();

  // 确定按钮
  const certainBtn = useCallback(() => {
    setSelectColor(inputColor);
    onColorApplied?.(inputColor);
    onConfirm?.();
  }, [inputColor, onColorApplied, onConfirm]);

  // 把用户选择的颜色记录在ctx中
  useEffect(() => {
    setContext((ctx: Context) => {
      if (ctx.allowEdit === false) return;
      const index = getSheetIndex(ctx, ctx.currentSheetId) as number;
      ctx.luckysheetfile[index].color = selectColor;
    });
  }, [selectColor, setContext]);

  return (
    <div id="fortune-change-color">
      <div
        className="color-reset"
        onClick={() => {
          setSelectColor(undefined);
          onColorApplied?.(undefined);
        }}
        onKeyDown={activateOnEnterOrSpace}
        tabIndex={0}
        role="button"
      >
        {sheetconfig.resetColor}
      </div>
      <div className="custom-color">
        {/* The adjacent text is already this control's visible label, so point
            at it rather than adding a second, invisible name — that keeps the
            two in step and satisfies Label in Name (WCAG 2.5.3) for free. */}
        <div id={customColorLabelId}>{toolbar.customColor}:</div>
        <input
          type="color"
          aria-labelledby={customColorLabelId}
          value={inputColor}
          onChange={(e) => setInputColor(e.target.value)}
          onFocus={() => {
            triggerParentUpdate(true);
          }}
          onBlur={() => {
            triggerParentUpdate(false);
          }}
          onKeyDown={(e) => e.stopPropagation()}
        />
        <ColorHexInput
          value={inputColor}
          // The row above closes this submenu on mouseleave unless something
          // inside it says it is in use, and only the native swatch was saying
          // so — a pointer that opened the menu and then drifted off the row
          // unmounted the field mid-entry and took the typed value with it.
          onEditingChange={triggerParentUpdate}
          onCommit={(color) => {
            setInputColor(color);
            setSelectColor(color);
            onColorApplied?.(color);
          }}
        />
        <div
          className="button-basic button-primary"
          onClick={() => {
            certainBtn();
          }}
          onKeyDown={activateOnEnterOrSpace}
          tabIndex={0}
          role="button"
        >
          {button.confirm}
        </div>
      </div>
      <ColorPicker
        onPick={(color) => {
          setInputColor(color);
          setSelectColor(color);
          onColorApplied?.(color);
        }}
      />
    </div>
  );
};
