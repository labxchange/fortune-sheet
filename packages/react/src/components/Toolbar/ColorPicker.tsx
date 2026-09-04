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
  /**
   * The colour currently applied, so the listbox can say which of its options
   * is the selected one — the single piece of state the role exists to carry.
   * Optional because a caller that genuinely does not know is better off
   * exposing no selection than a wrong one.
   */
  selectedColor?: string;
};

/** Matching is case-insensitive: the palette is lowercase, but a colour can
 *  reach here from `<input type="color">`, a saved sheet or an import. */
const sameColor = (a: string | undefined, b: string | undefined) =>
  a != null && b != null && a.toLowerCase() === b.toLowerCase();

const flatPalette = palette.flat();

const ColorPicker: React.FC<Props> = ({ onPick, selectedColor }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { context } = useContext(WorkbookContext);
  const { info } = locale(context);
  // the locale objects infer exact literal keys, so a hex from `palette`
  // can't index them without widening
  const colorNames = info.colorNames as Record<string, string> | undefined;
  // Roving tabindex: the listbox pattern exists so the palette costs one tab
  // stop with arrows moving inside it. Every swatch being tabbable made Tab
  // step through all 64, contradicting the role announced below.
  //
  // Seeded from the applied colour so the first Tab lands on it rather than on
  // black — the option a listbox is expected to open on. Only the seed: after
  // that it follows focus, which leaves the tab stop where the user last was
  // instead of yanking it back on every pick.
  const [activeIndex, setActiveIndex] = useState(() => {
    const found = flatPalette.findIndex((c) => sameColor(c, selectedColor));
    return found === -1 ? 0 : found;
  });
  // Linear, to match the role. While this was a grid the arrows wrapped within
  // the visual row — ArrowRight from swatch 8 went back to swatch 1 — which is
  // coherent only while row and column are in the accessibility tree to
  // explain it. They are not, by the deliberate choice below: AT reads "White,
  // 8 of 64", and the next key must therefore reach 9. Role and interaction
  // model have to agree (WCAG 4.1.2), and it is the role that is right here.
  useRovingFocus({
    containerRef,
    orientation: "linear",
    // No wrap, which the hook does by default: the APG listbox pattern stops
    // at the ends, and it is the stop that tells a keyboard user they have
    // reached the last of the 64 rather than silently returning them to the
    // first — the same information the "n of 64" position carries.
    loop: false,
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
    // stay, but as presentational layout only — which is why the arrow keys
    // walk the flat order rather than the rows (see `useRovingFocus` above).
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
                // Which colour is in force. This was `false` on all 64, on the
                // reasoning that aria-selected is a "required state" of
                // role="option" — it is not: it is a *supported* state, and a
                // constant false told a screen reader that the listbox has no
                // selection at all, discarding the one thing the role is there
                // to convey. Both callers do know the answer.
                aria-selected={sameColor(c, selectedColor)}
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
