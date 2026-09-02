import { locale } from "@fortune-sheet/core";
import React, { useContext, useId, useState } from "react";
import WorkbookContext from "../../context";
import ColorPicker from "../Toolbar/ColorPicker";
import ColorHexInput from "./ColorHexInput";
import { activateOnEnterOrSpace } from "../../utils/keyboardActivation";
import "./index.css";

type Props = {
  onCustomPick: (color: string | undefined) => void;
  onColorPick: (color: string) => void;
};

export const CustomColor: React.FC<Props> = ({ onCustomPick, onColorPick }) => {
  const { context } = useContext(WorkbookContext);
  const { toolbar, sheetconfig, button } = locale(context);
  const [inputColor, setInputColor] = useState<string | undefined>("#000000");
  const customColorLabelId = useId();

  return (
    <div id="fortune-custom-color">
      <div
        className="color-reset"
        onClick={() => onCustomPick(undefined)}
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
        />
        <ColorHexInput
          value={inputColor}
          onCommit={(color) => {
            setInputColor(color);
            onColorPick(color);
          }}
        />
        <div
          className="button-basic button-primary"
          onClick={() => {
            onCustomPick(inputColor);
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
          onColorPick(color);
        }}
      />
    </div>
  );
};
