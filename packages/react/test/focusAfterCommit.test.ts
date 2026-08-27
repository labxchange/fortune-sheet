import { focusAfterCommit } from "../src/utils/keyboardActivation";

// The helper every filter action routes its focus through. Exercised indirectly
// by the filter suites, but its three deliberate properties — deferral, target
// resolved late, detached target left alone — are cheaper to pin down here, and
// the third is the one that silently reintroduces the <body> bug if it goes.

const tick = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

describe("focusAfterCommit", () => {
  let target: HTMLButtonElement;

  beforeEach(() => {
    target = document.createElement("button");
    document.body.appendChild(target);
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("focuses the target, but not before the current task ends", async () => {
    focusAfterCommit(() => target);
    // Deferred on purpose: useEscapeToClose's cleanup restore and the extra
    // commit FilterOption's effect schedules both run first and would win.
    expect(document.activeElement).not.toBe(target);

    await tick();
    expect(document.activeElement).toBe(target);
  });

  it("resolves the target inside the timeout, not at call time", async () => {
    const getTarget = jest.fn(() => target);
    focusAfterCommit(getTarget);
    expect(getTarget).not.toHaveBeenCalled();

    await tick();
    expect(getTarget).toHaveBeenCalledTimes(1);
  });

  it("lets a caller decide the target against the settled DOM", async () => {
    // What the `funnel ?? cellInput` fallbacks rely on: the callback sees the
    // DOM as it is after the commit, so a funnel that has just been unmounted
    // is not chosen.
    const fallback = document.createElement("button");
    document.body.appendChild(fallback);
    focusAfterCommit(() => (target.isConnected ? target : fallback));
    target.remove();

    await tick();
    expect(document.activeElement).toBe(fallback);
  });

  it("leaves focus alone for a detached target", async () => {
    // Focusing a detached node moves focus to <body>, which is the failure this
    // helper exists to prevent — so it declines rather than trying.
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);
    anchor.focus();

    target.remove();
    focusAfterCommit(() => target);

    await tick();
    expect(document.activeElement).toBe(anchor);
  });

  it("leaves focus alone for a null target", async () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);
    anchor.focus();

    focusAfterCommit(() => null);

    await tick();
    expect(document.activeElement).toBe(anchor);
  });
});
