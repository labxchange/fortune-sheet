import React, { useContext, useRef, useState } from "react";
import { locale } from "@fortune-sheet/core";
import WorkbookContext from "../../context";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import { activateOnEnterOrSpace } from "../../utils/keyboardActivation";

const palette = [
  [
    "#000000",
    "#444444",
    "#666666",
    "#999999",
    "#cccccc",
    "#eeeeee",
    "#f3f3f3",
    "#ffffff",
  ],
  [
    "#f00f00",
    "#f90f90",
    "#ff0ff0",
    "#0f00f0",
    "#0ff0ff",
    "#00f00f",
    "#90f90f",
    "#f0ff0f",
  ],
  [
    "#f4cccc",
    "#fce5cd",
    "#fff2cc",
    "#d9ead3",
    "#d0e0e3",
    "#cfe2f3",
    "#d9d2e9",
    "#ead1dc",
  ],
  [
    "#ea9999",
    "#f9cb9c",
    "#ffe599",
    "#b6d7a8",
    "#a2c4c9",
    "#9fc5e8",
    "#b4a7d6",
    "#d5a6bd",
  ],
  [
    "#e06666",
    "#f6b26b",
    "#ffd966",
    "#93c47d",
    "#76a5af",
    "#6fa8dc",
    "#8e7cc3",
    "#c27ba0",
  ],
  [
    "#c00c00",
    "#e69138",
    "#f1c232",
    "#6aa84f",
    "#45818e",
    "#3d85c6",
    "#674ea7",
    "#a64d79",
  ],
  [
    "#900900",
    "#b45f06",
    "#bf9000",
    "#38761d",
    "#134f5c",
    "#0b5394",
    "#351c75",
    "#741b47",
  ],
  [
    "#600600",
    "#783f04",
    "#7f6000",
    "#274e13",
    "#0c343d",
    "#073763",
    "#20124d",
    "#4c1130",
  ],
];

type Props = {
  onPick: (color: string) => void;
};

const ColorPicker: React.FC<Props> = ({ onPick }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { context } = useContext(WorkbookContext);
  const { info } = locale(context);
  // the locale objects infer exact literal keys, so a hex from `palette`
  // can't index them without widening
  const colorNames = info.colorNames as Record<string, string> | undefined;
  // Roving tabindex: the grid pattern exists so a grid costs one tab stop with
  // arrows moving inside it. Every swatch being tabbable made Tab step through
  // all 64, contradicting the grid role announced below. Keyed on focus rather
  // than on selection (unlike the sheet tabs, a palette has no selected cell),
  // which also leaves the tab stop where the user last was.
  const [activeIndex, setActiveIndex] = useState(0);
  useRovingFocus({
    containerRef,
    orientation: "grid",
    columns: palette[0].length,
    // the swatches carry role="option" now, so the default [role="button"]
    // selector would match nothing
    itemSelector: '[role="option"]',
  });
  return (
    // A listbox, not a grid. This was grid/row/gridcell, on the reasoning that
    // the 2D model the arrow keys implement should also be the one the
    // accessibility tree exposes. In use that is actively worse: role="row"
    // takes its accessible name *from its contents* (ARIA 1.2, "Name From:
    // author, contents"), and a row here contains nothing but eight named
    // swatches — so arrowing onto a swatch announced the colour and then all
    // eight colour names of the row it had entered.
    //
    // Row and column carry no meaning a user has to act on here; the colour
    // name is the whole payload. listbox/option says "pick one of these",
    // keeps the set position AT would otherwise lose ("3 of 64"), and leaves
    // nothing in the tree that can be named by concatenation. The visual rows
    // stay, as presentational layout, and the arrow keys still move in 2D.
    <div
      className="fortune-toolbar-color-picker"
      ref={containerRef}
      role="listbox"
      aria-label={info.colorPalette}
    >
      {palette.map((rows, i) => (
        // presentational: the row is a flexbox for layout only, and must not
        // reach the accessibility tree, where it would be named by its own
        // contents. role="presentation" also keeps the options owned by the
        // listbox, which axe's aria-required-children checks for.
        <div
          key={i}
          className="fortune-toolbar-color-picker-row"
          role="presentation"
        >
          {rows.map((c, j) => {
            const index = i * palette[0].length + j;
            return (
              <div
                key={c}
                className="fortune-toolbar-color-picker-item"
                onClick={() => onPick(c)}
                onKeyDown={activateOnEnterOrSpace}
                // useRovingFocus focuses items directly, so a tabIndex of -1
                // leaves arrow navigation unchanged
                tabIndex={index === activeIndex ? 0 : -1}
                onFocus={() => setActiveIndex(index)}
                role="option"
                // aria-selected is a required state of role="option", and
                // ColorPicker is not told which colour is currently applied.
                // false throughout is the honest answer, and both VoiceOver
                // and NVDA speak a selected state only when it is true, so it
                // adds no words to the announcement.
                aria-selected={false}
                // a bare hex is read out character by character ("pound, e,
                // zero, six, six, six, six"), so every swatch is named. All six
                // locales cover the whole palette; the hex fallback is only for
                // a colour added here without a matching locale entry.
                aria-label={colorNames?.[c] ?? c}
                style={{ backgroundColor: c }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default ColorPicker;
