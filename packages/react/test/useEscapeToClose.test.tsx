import { render, fireEvent, act } from "@testing-library/react";
import React, { useRef, useState } from "react";
import { useEscapeToClose } from "../src/hooks/useEscapeToClose";
import { useOutsideClick } from "../src/hooks/useOutsideClick";

const Harness: React.FC = () => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useEscapeToClose({
    open,
    onClose: () => setOpen(false),
    containerRef,
  });
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Trigger
      </button>
      {open && (
        <div ref={containerRef}>
          <div role="button" tabIndex={0}>
            First
          </div>
          <div role="button" tabIndex={0}>
            Second
          </div>
        </div>
      )}
    </div>
  );
};

const NestedHarness: React.FC = () => {
  const [outerOpen, setOuterOpen] = useState(false);
  const [innerOpen, setInnerOpen] = useState(false);
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useEscapeToClose({
    open: outerOpen,
    onClose: () => setOuterOpen(false),
    containerRef: outerRef,
  });
  useEscapeToClose({
    open: innerOpen,
    onClose: () => setInnerOpen(false),
    containerRef: innerRef,
  });

  return (
    <div>
      <button type="button" onClick={() => setOuterOpen(true)}>
        Open Outer
      </button>
      {outerOpen && (
        <div ref={outerRef}>
          <div role="button" tabIndex={0}>
            Outer Item
          </div>
          <button type="button" onClick={() => setInnerOpen(true)}>
            Open Inner
          </button>
          {innerOpen && (
            <div ref={innerRef}>
              <div role="button" tabIndex={0}>
                Inner Item
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Mirrors how every real call site wires the two hooks together: opening a
// popup, then clicking outside it (e.g. a grid cell) closes it via
// useOutsideClick, entirely independent of this hook's own Escape handling.
const HarnessWithOutsideClick: React.FC = () => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useOutsideClick(containerRef, () => setOpen(false), []);
  useEscapeToClose({
    open,
    onClose: () => setOpen(false),
    containerRef,
  });
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Trigger
      </button>
      {/* Stands in for a grid cell: a real click there both takes focus and,
          via the mousedown continuing to bubble to document, triggers
          useOutsideClick's close. */}
      <button type="button" onMouseDown={(e) => e.currentTarget.focus()}>
        Elsewhere
      </button>
      {open && (
        <div ref={containerRef}>
          <div role="button" tabIndex={0}>
            First
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * A popup whose submenu renders as a *sibling* of the container rather than a
 * child — the shape `FilterMenu` uses, and the reason `withinRefs` exists. The
 * satellite is deliberately outside `containerRef` so `contains()` alone gets
 * it wrong.
 */
const FocusOutHarness: React.FC<{
  withSatellite?: boolean;
  closeOnFocusOut?: boolean;
  /** Opts into the `focusOutTarget` override, aimed at the "Anchor" button. */
  withAnchor?: boolean;
}> = ({
  withSatellite = false,
  closeOnFocusOut = true,
  withAnchor = false,
}) => {
  const [open, setOpen] = useState(false);
  const [rowVisible, setRowVisible] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const satelliteRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  useEscapeToClose({
    open,
    onClose: () => setOpen(false),
    containerRef,
    autoFocus: false,
    closeOnFocusOut,
    focusOutTarget: withAnchor ? () => anchorRef.current : undefined,
    withinRefs: withSatellite ? [satelliteRef] : undefined,
  });
  return (
    <div>
      {/* aria-controls as every real trigger here has it: that is how the hook
          recognises the trigger as part of the widget rather than as outside. */}
      <button
        type="button"
        aria-controls={open ? "focusout-harness-popup" : undefined}
        onClick={() => setOpen(true)}
      >
        Trigger
      </button>
      <button type="button">Outside</button>
      {/* Stands in for the grid's cell input: where a cell-anchored popup wants
          focus after a Tab, rather than wherever the Tab was heading. */}
      <button type="button" ref={anchorRef}>
        Anchor
      </button>
      {open && (
        <>
          <div id="focusout-harness-popup" ref={containerRef}>
            <div role="button" tabIndex={0}>
              First
            </div>
            {rowVisible && (
              <div role="button" tabIndex={0}>
                Doomed
              </div>
            )}
            <button type="button" onClick={() => setRowVisible(false)}>
              Drop row
            </button>
          </div>
          {withSatellite && (
            <div ref={satelliteRef}>
              <div role="button" tabIndex={0}>
                Satellite
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

/**
 * Move focus the way a Tab press does: the source really holds focus first
 * (which is what tells the hook focus was ever inside), then one focusout
 * naming its destination.
 */
const moveFocus = (from: HTMLElement, to: HTMLElement) => {
  from.focus();
  to.focus();
  fireEvent.focusOut(from, { relatedTarget: to });
};

describe("useEscapeToClose", () => {
  it("autofocuses the first item on open, and Escape closes and restores focus", () => {
    const { getByText, queryByText } = render(<Harness />);
    const trigger = getByText("Trigger");
    trigger.focus();
    fireEvent.click(trigger);

    const first = getByText("First");
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(first, { key: "Escape" });

    expect(queryByText("First")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("does nothing when closed", () => {
    const { getByText, queryByText } = render(<Harness />);
    const trigger = getByText("Trigger");
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(queryByText("First")).toBeNull();
  });

  it("Escape closes only the innermost open popup, not an outer one it's nested in", () => {
    const { getByText, queryByText } = render(<NestedHarness />);
    fireEvent.click(getByText("Open Outer"));
    expect(queryByText("Outer Item")).toBeTruthy();

    fireEvent.click(getByText("Open Inner"));
    expect(queryByText("Inner Item")).toBeTruthy();

    fireEvent.keyDown(getByText("Inner Item"), { key: "Escape" });
    expect(queryByText("Inner Item")).toBeNull();
    // the outer popup must still be open after only one Escape press
    expect(queryByText("Outer Item")).toBeTruthy();

    fireEvent.keyDown(getByText("Outer Item"), { key: "Escape" });
    expect(queryByText("Outer Item")).toBeNull();
  });

  it("does not drag focus back to the trigger when an outside click closes the popup after focus already moved elsewhere", () => {
    const { getByText, queryByText } = render(<HarnessWithOutsideClick />);
    const trigger = getByText("Trigger");
    const elsewhere = getByText("Elsewhere");

    trigger.focus();
    fireEvent.click(trigger);
    expect(document.activeElement).toBe(getByText("First"));

    fireEvent.mouseDown(elsewhere);

    expect(queryByText("First")).toBeNull();
    expect(document.activeElement).toBe(elsewhere);
  });

  // WCAG 2.4.11: these popups are absolutely-positioned overlays, so one left
  // open behind the newly focused element obscures it. APG says the same thing
  // for Tab: "closes the menu and moves focus to the next element".
  describe("closeOnFocusOut", () => {
    it("closes when focus moves to an element outside the popup", () => {
      const { getByText, queryByText } = render(<FocusOutHarness />);
      fireEvent.click(getByText("Trigger"));

      moveFocus(getByText("First"), getByText("Outside"));

      expect(queryByText("First")).toBeNull();
      // Focus stays where the user sent it rather than snapping back to the
      // trigger — useEscapeToClose's restore skips a deliberate move out.
      expect(document.activeElement).toBe(getByText("Outside"));
    });

    it("keeps focus where the Tab sent it even if focusin has not fired yet", () => {
      // Ordering hardening, and worth being precise about what it models.
      //
      // The concern raised in review: browsers fire `focusout` and `focusin` as
      // separate dispatches, React batches a `setState` made from a native
      // listener onto a microtask, and if the checkpoint *between* the two
      // dispatches flushed that batch, this effect's cleanup would run while
      // `focusInsideContainer` was still true — restoring focus to the trigger
      // and swallowing the Tab.
      //
      // Chrome does not do that. Measured directly: `focusout` and `focusin`
      // dispatch within one task and the first microtask checkpoint comes after
      // *both*, so the flag is already false by the time React flushes. jsdom
      // agrees, which is why `moveFocus` above cannot express this case at all.
      //
      // So the suppression below forces the ordering rather than reproducing a
      // real browser's. What it guards is the handler's own invariant: reaching
      // the close means focus has left, so the flag must say so without waiting
      // to be told a second time. That makes the outcome the same on a browser
      // that does interleave them.
      const { getByText, queryByText } = render(<FocusOutHarness />);
      // Focused *before* opening, which is what makes this case able to fail.
      // `fireEvent.click` does not focus, so every other case in this describe
      // opens the popup with `previousActiveElement` set to `<body>` — and
      // jsdom's `body.focus()` is a no-op, so the restore they are asserting
      // about cannot be observed either way. The trigger is a real focusable
      // element, so a restore here actually moves focus.
      const trigger = getByText("Trigger");
      trigger.focus();
      fireEvent.click(trigger);
      const first = getByText("First");
      const outside = getByText("Outside");

      // Focus really enters the popup, so `focusHasBeenInside` arms.
      first.focus();
      const swallowFocusIn = (e: Event) => e.stopImmediatePropagation();
      document.addEventListener("focusin", swallowFocusIn, true);
      try {
        outside.focus();
        fireEvent.focusOut(first, { relatedTarget: outside });
      } finally {
        document.removeEventListener("focusin", swallowFocusIn, true);
      }

      expect(queryByText("First")).toBeNull();
      expect(document.activeElement).toBe(outside);
      // Named explicitly: the trigger is where a restore would have sent it.
      expect(document.activeElement).not.toBe(trigger);
    });

    it("stays open while focus moves within the popup", () => {
      const { getByText, queryByText } = render(<FocusOutHarness />);
      fireEvent.click(getByText("Trigger"));

      moveFocus(getByText("First"), getByText("Doomed"));

      expect(queryByText("First")).toBeTruthy();
    });

    it("stays open when focus enters a submenu rendered outside the container", () => {
      const { getByText, queryByText } = render(
        <FocusOutHarness withSatellite />
      );
      fireEvent.click(getByText("Trigger"));

      // The whole point of withinRefs: contains() says this is outside.
      moveFocus(getByText("First"), getByText("Satellite"));

      expect(queryByText("First")).toBeTruthy();
    });

    it("stays open when focus returns from that submenu to the popup", () => {
      const { getByText, queryByText } = render(
        <FocusOutHarness withSatellite />
      );
      fireEvent.click(getByText("Trigger"));
      moveFocus(getByText("First"), getByText("Satellite"));

      moveFocus(getByText("Satellite"), getByText("First"));

      expect(queryByText("First")).toBeTruthy();
    });

    it("closes when focus leaves both the popup and its submenu", () => {
      const { getByText, queryByText } = render(
        <FocusOutHarness withSatellite />
      );
      fireEvent.click(getByText("Trigger"));
      moveFocus(getByText("First"), getByText("Satellite"));

      moveFocus(getByText("Satellite"), getByText("Outside"));

      expect(queryByText("First")).toBeNull();
      expect(queryByText("Satellite")).toBeNull();
    });

    // The regression this whole approach is most likely to introduce. A popup
    // that closes mid-interaction is worse than one that lingers.
    it("stays open when a focused row unmounts and focus falls to the body", () => {
      const { getByText, queryByText } = render(<FocusOutHarness />);
      fireEvent.click(getByText("Trigger"));
      const doomed = getByText("Doomed");
      doomed.focus();

      fireEvent.click(getByText("Drop row"));
      // A re-render that unmounts the focused element produces exactly this:
      // focus gone, no destination.
      fireEvent.focusOut(doomed, { relatedTarget: null });

      expect(queryByText("Doomed")).toBeNull();
      expect(queryByText("First")).toBeTruthy();
    });

    it("stays open when focus leaves the document entirely", () => {
      const { getByText, queryByText } = render(<FocusOutHarness />);
      fireEvent.click(getByText("Trigger"));

      // An OS colour picker opening, or the window losing focus. Both report a
      // null relatedTarget, and neither means the user left the popup.
      fireEvent.focusOut(getByText("First"), { relatedTarget: null });

      expect(queryByText("First")).toBeTruthy();
    });

    it("ignores focus moving between elements that were never inside it", () => {
      const { getByText, queryByText } = render(<FocusOutHarness />);
      fireEvent.click(getByText("Trigger"));

      moveFocus(getByText("Trigger"), getByText("Outside"));

      expect(queryByText("First")).toBeTruthy();
    });

    /**
     * The regression this guard exists for, found on VoiceOver in the real sim.
     *
     * A pointer-opened menu leaves focus on its trigger. The sheet-tab menu
     * renders *after* the whole tab strip in DOM order, so the user's first
     * forward move lands on the tab scroll buttons, not on the menu — and
     * dismissing there meant a screen-reader user could never reach Rename at
     * all. Focus was never inside the menu, so it was never left.
     */
    it("does not close when focus was never inside it", () => {
      const { getByText, queryByText } = render(<FocusOutHarness />);
      const trigger = getByText("Trigger");
      trigger.focus();
      fireEvent.click(trigger);

      // Straight from the trigger to something else, never entering the popup.
      moveFocus(trigger, getByText("Outside"));

      expect(queryByText("First")).toBeTruthy();
    });

    it("closes once focus has been inside and then leaves, via the trigger", () => {
      const { getByText, queryByText } = render(<FocusOutHarness />);
      fireEvent.click(getByText("Trigger"));

      // Enter the popup, step back out onto its own trigger (still "inside",
      // so the trigger can still toggle it), then genuinely leave.
      moveFocus(getByText("First"), getByText("Trigger"));
      expect(queryByText("First")).toBeTruthy();

      moveFocus(getByText("Trigger"), getByText("Outside"));
      expect(queryByText("First")).toBeNull();
    });

    // The guard on the whole change: every popup in the app mounts this hook,
    // so a call site that did not opt in must behave exactly as before.
    it("does nothing when the caller has not opted in", () => {
      const { getByText, queryByText } = render(
        <FocusOutHarness closeOnFocusOut={false} />
      );
      fireEvent.click(getByText("Trigger"));

      moveFocus(getByText("First"), getByText("Outside"));

      expect(queryByText("First")).toBeTruthy();
    });
  });

  /**
   * The override a cell-anchored popup uses so Tab does not carry the user out
   * of the grid. Its destination is deferred a task, so every assertion here
   * flushes first — otherwise it reads pre-timeout state and cannot fail.
   */
  describe("focusOutTarget", () => {
    const flush = async () => {
      await act(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      });
    };

    it("sends focus to the target instead of where the Tab was heading", async () => {
      const { getByText } = render(<FocusOutHarness withAnchor />);
      fireEvent.click(getByText("Trigger"));

      moveFocus(getByText("First"), getByText("Outside"));
      await flush();

      expect(document.activeElement).toBe(getByText("Anchor"));
    });

    it("leaves the Tab alone when no target is given", async () => {
      const { getByText } = render(<FocusOutHarness />);
      fireEvent.click(getByText("Trigger"));

      moveFocus(getByText("First"), getByText("Outside"));
      await flush();

      expect(document.activeElement).toBe(getByText("Outside"));
    });

    /**
     * The case that makes this an override rather than an unconditional pull.
     *
     * `ContextMenu`'s Sort, Insert image and Link rows focus the grid
     * *synchronously* and then open a dialog — so the focusout that reaches
     * this hook is the app's own handoff, already landing on the target. Aiming
     * at it again a task later would fire after the dialog had claimed focus
     * and yank the user straight back out of it.
     */
    it("stands down when focus has already reached the target", async () => {
      const { getByText } = render(<FocusOutHarness withAnchor />);
      fireEvent.click(getByText("Trigger"));

      moveFocus(getByText("First"), getByText("Anchor"));
      // Whatever the handoff opens next claims focus before the deferred
      // re-aim would have run.
      getByText("Outside").focus();
      await flush();

      expect(document.activeElement).toBe(getByText("Outside"));
    });
  });
});
