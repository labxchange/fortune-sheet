import React, { useCallback, useEffect, useRef } from "react";
import _ from "lodash";

type ContentEditableProps = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "onChange"
> & {
  initialContent?: string;
  innerRef?: (e: HTMLDivElement | null) => void;
  onChange?: (html: string, isBlur?: boolean) => void;
  onBlur?: (e: React.FocusEvent<HTMLDivElement, Element>) => void;
  autoFocus?: boolean;
  allowEdit?: boolean;
};

const ContentEditable: React.FC<ContentEditableProps> = ({ ...props }) => {
  const lastHtml = useRef("");
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
      if (onChange && html !== lastHtml.current) {
        onChange(html || "", isBlur);
      }
      lastHtml.current = html || "";
    },
    [root, onChange]
  );

  const { innerRef, onBlur } = props;
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
      onBlur={(e) => {
        fnEmitChange(null, true);
        onBlur?.(e);
      }}
      contentEditable={allowEdit}
    />
  );
};

export default ContentEditable;
