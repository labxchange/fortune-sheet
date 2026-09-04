import { locale } from "@fortune-sheet/core";
import React, { useContext, useEffect, useRef, useState } from "react";
import WorkbookContext from "../../context";
import { markAsRepeat } from "../../utils/liveRegion";

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
 * `AABBCC`) and quiet about what it rejects *mid-entry*: it commits on a valid
 * colour and otherwise leaves the applied colour standing, so a half-typed
 * value is never treated as a colour nor announced as an error keystroke by
 * keystroke.
 *
 * An explicit commit is different, and used to be silent too. Typing something
 * that is not a colour and pressing Enter reverted the text and said nothing —
 * no outcome, no reason — which is exactly the defect this work exists to
 * remove, in the one control it adds. Failing that way is now reported
 * (WCAG 3.3.1) from Enter and from a blur that carried an edit, never from
 * typing, and **in text on the screen as well as to a screen reader** — the
 * first fix for this put the reason in an `sr-only` alert, which left a
 * sighted keyboard user watching the same silent reversion the defect was
 * about.
 *
 * **A refusal keeps the text it refused.** Reverting to the applied colour in
 * the same breath as marking the field invalid made the two disagree: the field
 * showed a valid `#rrggbb` while carrying `aria-invalid`, so a reader
 * re-reading it reported an error about a value nobody had judged, and the
 * visible message described text that was no longer there. Keeping it is also
 * what any other form field does with a value it could not accept — the user
 * gets to correct it rather than retype it — and it is what makes the mark and
 * the message true for as long as they are shown. They are dropped by the next
 * keystroke, by a commit that succeeds, by Escape, and when the applied colour
 * changes underneath (a swatch or palette pick), which are the four ways the
 * refused text stops being what the field holds.
 *
 * Escape cancels, in both popups. That took saying out loud: the two hosts
 * close differently, and only one of them happened to produce the right
 * result — see `escapedRef` below.
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
  // The message itself rather than a flag, so the region below holds "" while
  // there is nothing wrong and a screen reader is told only on the change.
  const [errorMessage, setErrorMessage] = useState("");

  // Ending is not the same as blurring: removing a focused node fires no blur
  // event. `useEscapeToClose` is capture-phase, so one Escape typed in here
  // unmounted `ChangeColor` while this field still held focus, `onBlur` never
  // ran, and `SheetTab`'s `isShowInputColor` stayed true for the workbook's
  // lifetime — after which the colour row's `onMouseLeave` guard never closed
  // that submenu again. Held in a ref so the cleanup does not re-run whenever
  // the caller passes a fresh closure.
  const onEditingChangeRef = useRef(onEditingChange);
  onEditingChangeRef.current = onEditingChange;
  useEffect(() => () => onEditingChangeRef.current?.(false), []);

  // Escape is the cancel gesture, and it must not reach `commit` on the way
  // out. `useEscapeToClose` restores focus to whatever opened the popup, which
  // *blurs* this field — and a blur carrying an edit commits it. `ChangeColor`
  // escaped that only by accident: Escape unmounts it, and a removed node
  // fires no blur. `CustomBorder`'s popup is display-toggled instead, so the
  // blur does fire, and Escape there applied the typed colour — the opposite
  // of what the same key does one popup over. Recorded here so cancelling is a
  // decision this field makes rather than a side effect of how its host
  // happens to close.
  const escapedRef = useRef(false);
  const refusalCount = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // On `document` in the capture phase, because the popup's own Escape
  // handler is there and calls `stopPropagation()` — so nothing bound to the
  // input itself, React handler or otherwise, ever sees the key. Two capture
  // listeners on the same node both run whatever the order: only
  // `stopImmediatePropagation` would suppress a sibling, and that is not what
  // is called. The close itself is a setState from a native listener, which
  // React 18 flushes in a microtask, so the focus restore and its blur land
  // strictly after this has run.
  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (e.target !== inputRef.current) return;
      escapedRef.current = true;
    };
    document.addEventListener("keydown", onEscape, true);
    return () => document.removeEventListener("keydown", onEscape, true);
  }, []);

  // Follow the swatch and the palette while the user is not typing here; while
  // they are, their own text is the truth and must not be overwritten mid-entry.
  // A refused value counts as the user's text for this purpose even after the
  // blur that refused it: it is still on screen, still marked invalid, and
  // still the thing the message is about. A *new* applied colour does clear it,
  // which is the one event that makes the refusal stale.
  useEffect(() => {
    if (!editing && !errorMessage) setDraft(value ?? "");
  }, [value, editing, errorMessage]);
  const appliedRef = useRef(value);
  useEffect(() => {
    if (appliedRef.current === value) return;
    appliedRef.current = value;
    setErrorMessage("");
    setDraft(value ?? "");
  }, [value]);

  const commit = (raw: string) => {
    const hex = normalizeHex(raw);
    if (hex) {
      setErrorMessage("");
      onCommit(hex);
      return;
    }
    // Marked and said, and the text left exactly as typed — see the note above
    // this component about why the two have to describe the same thing.
    //
    // The same refusal can now follow itself, which it could not while a
    // failure reverted the text: pressing Enter twice on `reddish` asks twice
    // and must be answered twice, and a live region written the identical
    // string is silent. Same modulo-2 marker as the other regions in this
    // package.
    refusalCount.current += 1;
    setErrorMessage(
      refusalCount.current % 2 === 0
        ? markAsRepeat(info.hexColorInvalid)
        : info.hexColorInvalid
    );
  };

  return (
    <>
      <input
        type="text"
        ref={inputRef}
        className="fortune-color-hex-input"
        aria-label={info.hexColorInput}
        aria-invalid={errorMessage ? true : undefined}
        placeholder="#000000"
        // No `maxLength`. It was 7, which is the length of `#rrggbb` — but the
        // cap applies to a paste as well as to typing, so `#12345678` was
        // silently truncated to `#123456` and *accepted* as a different valid
        // colour rather than refused. An over-long value is a mistake and has
        // to be answerable as one; `normalizeHex` is the only judge of what is
        // a colour.
        value={draft}
        // Typing clears the refusal: it was about text that is no longer what
        // the field holds, and leaving `aria-invalid` set would mark a value
        // nobody has judged yet.
        onChange={(e) => {
          setErrorMessage("");
          setDraft(e.target.value);
        }}
        onFocus={() => {
          setEditing(true);
          onEditingChange?.(true);
          escapedRef.current = false;
          // Deliberately not clearing the refusal here. It used to be cleared,
          // because a refusal used to outlive the text it judged — the field
          // reverted to the applied colour and kept the mark, so re-entering
          // found a valid value wearing an `aria-invalid` nobody had earned.
          // The refusal now keeps its text, so on the way back in the mark, the
          // message and the value on screen are still the same three facts
          // about the same entry, and clearing them would hide an error the
          // user has not fixed yet. The border popup, which is display-toggled
          // rather than unmounted, therefore reopens showing the entry it could
          // not accept — which is the honest state of it.
        }}
        onBlur={(e) => {
          setEditing(false);
          onEditingChange?.(false);
          // Escape asked for this edit to be dropped, and the blur it caused
          // is the closing, not a decision — so nothing is applied and nothing
          // is said.
          if (escapedRef.current) {
            escapedRef.current = false;
            setErrorMessage("");
            setDraft(value ?? "");
            return;
          }
          // Only a value the user actually changed is a request to apply one,
          // so that passing through the field is inert. `draft` is seeded from
          // `value`, which makes a pristine field already hold a valid colour;
          // committing on every blur therefore applied one — and announced it —
          // to a keyboard user who did nothing but Tab past this control on the
          // way to Confirm. Enter stays unconditional: that one is an explicit
          // ask, and reapplying the colour already in force is harmless.
          if (normalizeHex(e.target.value) !== normalizeHex(value ?? "")) {
            // Includes text that is not a colour at all: `normalizeHex`
            // answers null for it, which is never equal to the applied
            // colour, so an abandoned bad entry is refused out loud rather
            // than reverting without a word. `commit` leaves the text in
            // place; the field is then showing an unfinished edit, not a
            // claim about the colour in force.
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
      {/* On screen *and* assertive, from one element: an error has to be
          identified in text (WCAG 3.3.1), and the first version of this put the
          reason in an `sr-only` region — correct for a screen reader, and a
          silent reversion for everyone else. Rendering it visibly also keeps
          the two channels from being able to disagree.

          Assertive, and carried here rather than in the toolbar's own region:
          the refusal belongs to this field, and Enter leaves focus inside it,
          so there is no cell announcement for it to talk over. Always mounted,
          empty, so the region exists in the accessibility tree before anything
          is written to it. Not wired to `aria-describedby` as well — a
          described-by string is read with the field's name, which would say it
          twice. */}
      <span className="fortune-color-hex-error" role="alert">
        {errorMessage}
      </span>
    </>
  );
};

export default ColorHexInput;
