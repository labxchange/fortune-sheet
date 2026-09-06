import { Context, getSheetIndex, locale } from "@fortune-sheet/core";
import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import WorkbookContext from "../../context";
import ColorPicker from "../Toolbar/ColorPicker";
import { activateOnEnterOrSpace } from "../../utils/keyboardActivation";
import "./index.css";

type Props = {
  triggerParentUpdate: (state: boolean) => void;
};

export const ChangeColor: React.FC<Props> = ({ triggerParentUpdate }) => {
  const { context, setContext } = useContext(WorkbookContext);
  const { toolbar, sheetconfig, button } = locale(context);
  const [inputColor, setInputColor] = useState<string>("#000000");
  const [selectColor, setSelectColor] = useState<undefined | string>(
    context.luckysheetfile[
      getSheetIndex(context, context.currentSheetId) as number
    ].color
  );

  // 确定按钮
  const certainBtn = useCallback(() => {
    setSelectColor(inputColor);
  }, [inputColor]);

  // Baseline for the counter bump below: the sheet's colour when this
  // instance first mounted, so the mount run (which just re-writes that same
  // colour) doesn't count as a change. A previous-*value* ref rather than a
  // "have I run before" boolean, specifically so it survives React
  // StrictMode's double-invoke of a mount effect — a boolean flip inside the
  // producer still leaves the *second* invocation of that same mount seeing
  // itself as a real change; comparing against the last color actually
  // written does not, because both invocations write the same value.
  const previousColor = useRef(selectColor);

  // 把用户选择的颜色记录在ctx中
  useEffect(() => {
    const isRealChange = previousColor.current !== selectColor;
    previousColor.current = selectColor;
    setContext((ctx: Context) => {
      if (ctx.allowEdit === false) return;
      const index = getSheetIndex(ctx, ctx.currentSheetId) as number;
      ctx.luckysheetfile[index].color = selectColor;
      if (isRealChange) {
        ctx.sheetTabColorChangeCount = (ctx.sheetTabColorChangeCount ?? 0) + 1;
      }
    });
  }, [selectColor, setContext]);

  return (
    <div id="fortune-change-color">
      <div
        className="color-reset"
        onClick={() => setSelectColor(undefined)}
        onKeyDown={activateOnEnterOrSpace}
        tabIndex={0}
        role="button"
      >
        {sheetconfig.resetColor}
      </div>
      <div className="custom-color">
        <div>{toolbar.customColor}:</div>
        <input
          type="color"
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
        }}
      />
    </div>
  );
};
