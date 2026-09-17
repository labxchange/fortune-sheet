import React, { useCallback, useEffect, useRef } from "react";
import _ from "lodash";

type ContentEditableProps = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "onChange"
> & {
  initialContent?: string;
  innerRef?: (e: HTMLDivElement | null) => void;
  onChange?: (html: string, isBlur?: boolean) => void;
  // `onBlur` and `onFocus` are already supplied by `HTMLAttributes`; they are
  // restated here because both are hand-forwarded rather than spread onto the
  // element -- see the `_.omit` list below -- and a reader otherwise has to
  // diff that list against this type to find out.
  onBlur?: (e: React.FocusEvent<HTMLDivElement, Element>) => void;
  onFocus?: (e: React.FocusEvent<HTMLDivElement, Element>) => void;
  autoFocus?: boolean;
  allowEdit?: boolean;
};

const ContentEditable: React.FC<ContentEditableProps> = ({ ...props }) => {
  // Whether the user has typed since focus arrived. Set by `input`, cleared on
  // every focus and blur -- see fnEmitChange for why this rather than a
  // remembered copy of the markup.
  const dirty = useRef(false);
  const root = useRef<HTMLDivElement | null>(null);
  const { autoFocus, initialContent, onChange } = props;

  useEffect(() => {
    if (autoFocus) {
      root.current?.focus();
    }
  }, [autoFocus]);

  // UNSAFE_componentWillUpdate
  useEffect(() => {
    if (initialContent && root.current != null) {
      root.current.innerHTML = initialContent;
    }
  }, [initialContent]);

  const fnEmitChange = useCallback(
    (__: any, isBlur?: boolean) => {
      let html;

      if (root.current != null) {
        html = root.current.innerHTML;
      }
      // The "did the user actually do anything?" test applies to the blur path
      // only. Blur fires whether or not anything was typed, and `onChange`
      // treats an `isBlur` change as a commit-shaped event -- for the formula
      // bar, one that opens an edit session on the selected cell. The `input`
      // path needs no such test: it fires for user edits exclusively, and
      // suppressing anything there drops real keystrokes.
      //
      // The test is a flag raised by `input` rather than a comparison against
      // the last markup seen, because this element is rewritten
      // programmatically behind the component's back -- the formula bar mirrors
      // whatever cell is selected, `InputBox` clears itself -- and assigning
      // `innerHTML` raises no `input`. Any remembered markup goes stale the
      // moment one of those writes lands, including a write that lands *while*
      // the field is focused: `FxEditor`'s mirror effect fires on every
      // `luckysheet_select_save` change and does not check for focus. A blur
      // then compares unequal and reports a change nobody made, which is the
      // one thing this test exists to suppress. A write the component never saw
      // cannot forge the flag.
      if (onChange && (!isBlur || dirty.current)) {
        onChange(html || "", isBlur);
      }
      if (!isBlur) dirty.current = true;
    },
    [root, onChange]
  );

  const { innerRef, onBlur, onFocus } = props;
  let { allowEdit } = props;
  if (_.isNil(allowEdit)) allowEdit = true;

  return (
    <div
      onDoubleClick={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      {..._.omit(
        props,
        "innerRef",
        "onChange",
        "html",
        "onBlur",
        "onFocus",
        "autoFocus",
        "allowEdit",
        "initialContent"
      )}
      ref={(e) => {
        root.current = e;
        innerRef?.(e);
      }}
      // Defaulted here rather than hardcoded, because this literal sits
      // *after* the prop spread above and therefore silently beat any
      // `tabIndex` a caller passed -- the attribute went in and was overwritten
      // one line later. Every existing call site passes none and still gets 0,
      // so this changes nothing for them; `InputBox` needs -1 while no edit is
      // open, which was unreachable before.
      tabIndex={props.tabIndex ?? 0}
      onInput={fnEmitChange}
      // Arriving starts a fresh visit, so "nothing was typed" is measured per
      // visit rather than once at mount.
      onFocus={(e) => {
        dirty.current = false;
        onFocus?.(e);
      }}
      onBlur={(e) => {
        fnEmitChange(null, true);
        dirty.current = false;
        onBlur?.(e);
      }}
      contentEditable={allowEdit}
    />
  );
};

export default ContentEditable;
