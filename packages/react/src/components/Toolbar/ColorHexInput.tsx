import { locale } from "@fortune-sheet/core";
import React, { useContext, useEffect, useState } from "react";
import WorkbookContext from "../../context";

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#abc` and `abc123` alike become `#aabbcc`; anything else is not a colour. */
export function normalizeHex(raw: string): string | null {
  const match = raw.trim().match(HEX);
  if (!match) return null;
  const digits = match[1].toLowerCase();
  const full =
    digits.length === 3
      ? digits
          .split("")
          .map((c) => c + c)
          .join("")
      : digits;
  return `#${full}`;
}

type Props = {
  /** The colour currently chosen, mirrored into the field while it is idle. */
  value: string | undefined;
  /** A valid colour was entered. Never called for text that is not one. */
  onCommit: (color: string) => void;
  /**
   * Entry here started or finished. A popup that closes itself when the
   * pointer wanders off — `ChangeColor`'s row does — needs this to stay open
   * while the field is being typed into, the same signal the native swatch
   * beside it already sends.
   */
  onEditingChange?: (editing: boolean) => void;
};

/**
 * Type a colour, for the people who cannot point at one.
 *
 * The native `<input type="color">` beside this one opens the browser's own
 * picker, and that picker is browser chrome: in Chrome its saturation handle
 * responds to the mouse and not to the keyboard, so choosing an arbitrary
 * colour was a pointer-only capability (WCAG 2.1.1). Nothing in this repo can
 * reach inside that popup to fix it — the only honest remedy is a second route
 * to the same outcome that does not go through it. The palette grid is already
 * keyboard-operable, but it is 64 fixed colours; this is what makes the *custom*
 * colour reachable.
 *
 * The field is deliberately forgiving about what it accepts (`abc`, `#abc`,
 * `AABBCC`) and silent about what it rejects: it commits on a valid colour and
 * otherwise leaves the last good one standing, so a half-typed value is never
 * treated as a colour and never announced as an error mid-keystroke.
 */
const ColorHexInput: React.FC<Props> = ({
  value,
  onCommit,
  onEditingChange,
}) => {
  const { context } = useContext(WorkbookContext);
  const { info } = locale(context);
  const [draft, setDraft] = useState(value ?? "");
  const [editing, setEditing] = useState(false);

  // Follow the swatch and the palette while the user is not typing here; while
  // they are, their own text is the truth and must not be overwritten mid-entry.
  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  const commit = (raw: string) => {
    const hex = normalizeHex(raw);
    if (hex) onCommit(hex);
    else setDraft(value ?? "");
  };

  return (
    <input
      type="text"
      className="fortune-color-hex-input"
      aria-label={info.hexColorInput}
      placeholder="#000000"
      maxLength={7}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => {
        setEditing(true);
        onEditingChange?.(true);
      }}
      onBlur={(e) => {
        setEditing(false);
        onEditingChange?.(false);
        // Only a value the user actually changed is a request to apply one, so
        // that passing through the field is inert. `draft` is seeded from
        // `value`, which makes a pristine field already hold a valid colour;
        // committing on every blur therefore applied one — and announced it —
        // to a keyboard user who did nothing but Tab past this control on the
        // way to Confirm. Enter stays unconditional: that one is an explicit
        // ask, and reapplying the colour already in force is harmless.
        if (normalizeHex(e.target.value) !== normalizeHex(value ?? "")) {
          commit(e.target.value);
        } else {
          setDraft(value ?? "");
        }
      }}
      onKeyDown={(e) => {
        // Enter applies without waiting for blur. Stopped here so it does not
        // reach the popup's own controls, whose activation handlers would
        // otherwise treat it as pressing whatever contains this field.
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          commit(e.currentTarget.value);
        }
      }}
    />
  );
};

export default ColorHexInput;
