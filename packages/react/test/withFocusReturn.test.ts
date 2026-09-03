import { withFocusReturn } from "../src/utils/keyboardActivation";

// The rule every built-in toolbar command routes its focus through: a command
// that changed the sheet sends focus back to the cells it acted on (WCAG
// 2.4.3), and one that declined leaves focus where the user put it.
//
// Pinned here rather than through the Toolbar, because the commands themselves
// cannot commit under jsdom -- the formatting handlers need canvas geometry it
// does not provide, so every one of them looks like "changed nothing" and the
// positive branch is unreachable from that direction. The Toolbar's own suite
// covers the negative branch end-to-end; this covers both halves of the rule.

const tick = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

describe("withFocusReturn", () => {
  let cellInput: HTMLDivElement;
  let toolbarButton: HTMLButtonElement;

  beforeEach(() => {
    cellInput = document.createElement("div");
    cellInput.tabIndex = -1;
    toolbarButton = document.createElement("button");
    document.body.append(cellInput, toolbarButton);
    toolbarButton.focus();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("returns focus to the target when the command changed something", async () => {
    let sheet = { cells: 1 };
    const bold = withFocusReturn(
      () => {
        // What immer does for a command that writes: a fresh reference.
        sheet = { cells: 2 };
      },
      () => sheet,
      () => cellInput
    );

    bold();
    await tick();

    expect(document.activeElement).toBe(cellInput);
  });

  it("leaves focus alone when the command changed nothing", async () => {
    const sheet = { cells: 1 };
    const declined = withFocusReturn(
      () => {},
      () => sheet,
      () => cellInput
    );

    declined();
    await tick();

    // Relocating the user for a command that did not run is a surprise, not a
    // fix -- the rule filterUnchanged states for the two filter items.
    expect(document.activeElement).toBe(toolbarButton);
  });

  it("runs the command before deciding, and decides only afterwards", async () => {
    let sheet = { cells: 1 };
    const order: string[] = [];
    const wrapped = withFocusReturn(
      () => {
        order.push("command");
        sheet = { cells: 2 };
      },
      () => {
        order.push("stamp");
        return sheet;
      },
      () => {
        order.push("target");
        return cellInput;
      }
    );

    wrapped();
    // Deferred: useEscapeToClose's restore and any follow-up commit run first.
    expect(order).toEqual(["stamp", "command"]);
    expect(document.activeElement).toBe(toolbarButton);

    await tick();
    expect(order).toEqual(["stamp", "command", "stamp", "target"]);
  });

  it("passes the command its arguments", async () => {
    const sheet = { cells: 1 };
    const run = jest.fn();
    const pick = withFocusReturn(
      run,
      () => sheet,
      () => cellInput
    );

    pick("#ff0000", 2);

    expect(run).toHaveBeenCalledWith("#ff0000", 2);
  });

  it("never strands focus on the body when the target is gone", async () => {
    let sheet = { cells: 1 };
    const wrapped = withFocusReturn(
      () => {
        sheet = { cells: 2 };
        cellInput.remove();
      },
      () => sheet,
      () => cellInput
    );

    wrapped();
    await tick();

    // focusAfterCommit declines a detached node; focusing one silently moves
    // focus to <body>, which is the failure this whole path exists to avoid.
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(toolbarButton);
  });

  // `onReturn` is what a caller hooks an announcement onto: for a formatting
  // command the move is otherwise silent to a screen reader (WCAG 2.4.3's
  // return is not a navigation, so it does not touch whatever the caller's
  // own selection-based region reads from), and this is the one place that
  // knows a return is actually about to happen rather than having been
  // declined. `readAnnounceStamp`, below, is what keeps it silent for a
  // command that *did* touch that region instead of duplicating it.
  describe("onReturn", () => {
    it("fires once, only when focus actually returns", async () => {
      let sheet = { cells: 1 };
      const onReturn = jest.fn();
      const wrapped = withFocusReturn(
        () => {
          sheet = { cells: 2 };
        },
        () => sheet,
        () => cellInput,
        onReturn
      );

      wrapped();
      await tick();

      expect(onReturn).toHaveBeenCalledTimes(1);
    });

    it("does not fire when the command declined", async () => {
      const sheet = { cells: 1 };
      const onReturn = jest.fn();
      const declined = withFocusReturn(
        () => {},
        () => sheet,
        () => cellInput,
        onReturn
      );

      declined();
      await tick();

      expect(onReturn).not.toHaveBeenCalled();
    });

    it("fires before getTarget, both after the commit", async () => {
      let sheet = { cells: 1 };
      const order: string[] = [];
      const wrapped = withFocusReturn(
        () => {
          order.push("command");
          sheet = { cells: 2 };
        },
        () => sheet,
        () => {
          order.push("target");
          return cellInput;
        },
        () => order.push("return")
      );

      wrapped();
      expect(order).toEqual(["command"]);

      await tick();
      expect(order).toEqual(["command", "return", "target"]);
    });

    it("is optional -- omitting it changes nothing", async () => {
      let sheet = { cells: 1 };
      const wrapped = withFocusReturn(
        () => {
          sheet = { cells: 2 };
        },
        () => sheet,
        () => cellInput
      );

      wrapped();
      await tick();

      expect(document.activeElement).toBe(cellInput);
    });
  });

  // A command that moved the selection or the cell value already made the
  // caller's own selection-based region re-announce on its own -- gating
  // onReturn on this second stamp is what stops the return from repeating it.
  describe("readAnnounceStamp", () => {
    it("fires onReturn when the announce stamp is unchanged", async () => {
      let sheet = { cells: 1 };
      const selection = "B5";
      const onReturn = jest.fn();
      const wrapped = withFocusReturn(
        () => {
          sheet = { cells: 2 };
        },
        () => sheet,
        () => cellInput,
        onReturn,
        () => selection
      );

      wrapped();
      await tick();

      expect(onReturn).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(cellInput);
    });

    it("suppresses onReturn when the announce stamp changed, but still returns focus", async () => {
      let sheet = { cells: 1 };
      let selection = "B5";
      const onReturn = jest.fn();
      const wrapped = withFocusReturn(
        () => {
          sheet = { cells: 2 };
          // A merge (or any command that moves the selection) changes this --
          // #sr-selection has already spoken it by the time onReturn would run.
          selection = "A1:B2";
        },
        () => sheet,
        () => cellInput,
        onReturn,
        () => selection
      );

      wrapped();
      await tick();

      expect(onReturn).not.toHaveBeenCalled();
      // The command still ran and focus still returns -- only the duplicate
      // announcement is what gets skipped.
      expect(document.activeElement).toBe(cellInput);
    });

    it("is optional -- omitting it fires onReturn unconditionally, as before", async () => {
      let sheet = { cells: 1 };
      const onReturn = jest.fn();
      const wrapped = withFocusReturn(
        () => {
          sheet = { cells: 2 };
        },
        () => sheet,
        () => cellInput,
        onReturn
      );

      wrapped();
      await tick();

      expect(onReturn).toHaveBeenCalledTimes(1);
    });
  });
});
