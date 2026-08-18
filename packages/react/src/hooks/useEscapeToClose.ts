import React, { useEffect, useRef } from "react";

const DEFAULT_FOCUSABLE_SELECTOR =
  '[role="button"]:not([aria-disabled="true"]), [tabindex="0"]:not([aria-disabled="true"])';

// Shared across every useEscapeToClose instance: when popups are nested
// (e.g. a color submenu open inside a toolbar combo), each has its own
// document-level listener, and stopPropagation() on one does not stop a
// sibling listener already attached to the same document target from also
// firing. Tracking open instances in a stack lets each one check whether
// it's the innermost (topmost) before reacting, so Escape only closes one
// popup layer at a time instead of unwinding all of them at once.
const openInstanceStack: symbol[] = [];

export type UseEscapeToCloseOptions = {
  /** Set to false to skip attaching listeners (e.g. while a popup is closed). Default true. */
  open?: boolean;
  onClose: () => void;
  containerRef: React.RefObject<HTMLElement | null>;
  /** Focus the first focusable item inside containerRef when it opens. Default true. */
  autoFocus?: boolean;
  autoFocusSelector?: string;
  /** Restore focus to whatever was focused before opening. Default true. */
  restoreFocus?: boolean;
};

export function useEscapeToClose({
  open = true,
  onClose,
  containerRef,
  autoFocus = true,
  autoFocusSelector = DEFAULT_FOCUSABLE_SELECTOR,
  restoreFocus = true,
}: UseEscapeToCloseOptions): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const instanceIdRef = useRef<symbol | undefined>(undefined);
  if (!instanceIdRef.current) instanceIdRef.current = Symbol("escapeToClose");

  useEffect(() => {
    if (!open) return undefined;
    const instanceId = instanceIdRef.current!;
    openInstanceStack.push(instanceId);
    const previousActiveElement = document.activeElement as HTMLElement | null;

    if (autoFocus) {
      const first =
        containerRef.current?.querySelector<HTMLElement>(autoFocusSelector);
      first?.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // only the innermost open instance (topmost of the stack) should
      // close on Escape; an outer popup's listener no-ops instead
      if (openInstanceStack[openInstanceStack.length - 1] !== instanceId) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      onCloseRef.current();
    };
    // capture phase: fires regardless of which nested element (a native
    // input, a submenu item, ...) currently has focus
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      const index = openInstanceStack.indexOf(instanceId);
      if (index !== -1) openInstanceStack.splice(index, 1);
      if (restoreFocus && previousActiveElement?.isConnected) {
        previousActiveElement.focus();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
