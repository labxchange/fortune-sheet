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
  /**
   * The colour currently in force, for the palette to mark as its selected
   * option. Supplied by the caller because this component cannot know it:
   * `inputColor` below is a *draft* — what Confirm would apply — seeded to
   * black and reset every time `Combo` remounts this popup. Wiring the palette
   * to that draft marked black as the applied colour on every open, whatever
   * the cell actually held, which is a worse answer than none.
   */
  appliedColor?: string;
};

export const CustomColor: React.FC<Props> = ({
  onCustomPick,
  onColorPick,
  appliedColor,
}) => {
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
        selectedColor={appliedColor}
        onPick={(color) => {
          // The draft Confirm would apply has to follow the palette. It did
          // not: `inputColor` was written only by the native swatch and by the
          // hex field, so picking White and then pressing Confirm applied the
          // `"#000000"` seed *over* the white — while the swatch and the hex
          // field beside it still read black and the palette announced white as
          // selected. `ChangeColor` keeps the two in step the same way, and
          // `ColorHexInput`'s contract says it mirrors the colour in force,
          // which it cannot do if a pick never reaches here.
          setInputColor(color);
          onColorPick(color);
        }}
      />
    </div>
  );
};
