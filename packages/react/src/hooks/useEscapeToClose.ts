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

    // Tracked continuously (rather than queried from containerRef at
    // cleanup time) because several call sites conditionally unmount their
    // container on close: React nulls that ref during the mutation phase,
    // which runs before this passive effect's cleanup does.
    let focusInsideContainer = !!containerRef.current?.contains(
      document.activeElement
    );
    const handleFocusIn = (e: FocusEvent) => {
      focusInsideContainer = !!containerRef.current?.contains(e.target as Node);
    };
    document.addEventListener("focusin", handleFocusIn);

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
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("keydown", handleKeyDown, true);
      const index = openInstanceStack.indexOf(instanceId);
      if (index !== -1) openInstanceStack.splice(index, 1);
      // Only rescue focus if the user hasn't already deliberately moved it
      // elsewhere (e.g. clicking a grid cell, which closes the popup via
      // useOutsideClick). Restoring unconditionally would drag focus back
      // to the trigger even after such a deliberate click.
      if (
        restoreFocus &&
        focusInsideContainer &&
        previousActiveElement?.isConnected
      ) {
        previousActiveElement.focus();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
