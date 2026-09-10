import { render } from "@testing-library/react";
import React from "react";
import Workbook from "../src/components/Workbook";

// Three spellings for "assertive live region" had accumulated across the
// `sr-only` regions -- bare `role="alert"`, `role="alert"` plus `aria-live` plus
// `aria-atomic`, and `role="status"` plus `aria-live="assertive"` -- and
// nothing misbehaved, because the redundant attributes compute to exactly what
// the role already implies. The cost is a reader deciding how to spell the
// next one finding three precedents and a comment in `Toolbar/index.tsx`
// saying one of them is wrong.
//
// So this asserts the rule rather than the two instances that broke it, which
// is the only version of the fix that a fourth variant cannot walk around:
//
//   - the role is `status` or `alert`;
//   - no `aria-atomic`, which both roles imply as `true`;
//   - `aria-live` only where it *changes* the implicit politeness, which is
//     `status` raised to `assertive` (`#sr-sheetColor`). Restating the role's
//     own value is the redundancy this is about.

/** Implicit `aria-live` for the two roles used here. */
const IMPLICIT_POLITENESS: Record<string, string> = {
  status: "polite",
  alert: "assertive",
};

describe("live region spelling", () => {
  const regions = () => {
    const { container } = render(
      <Workbook lang="en" data={[{ name: "Sheet1", id: "s1" }]} />
    );
    // `.sr-only[role]`, not an id prefix: the context-menu region's id is
    // `useId()`-prefixed so the fork can be embedded twice on a page, and it
    // would slip past `[id^="sr-"]`. The `[role]` half is the deliberate
    // exclusion -- the grid's `aria-describedby` target is `sr-only` with no
    // role and no `aria-live` on purpose, so that it is read as part of the
    // landmark's utterance rather than announced on mutation.
    return Array.from(
      container.querySelectorAll<HTMLElement>(".sr-only[role]")
    );
  };

  // Guards every case below: they iterate, so they would all pass vacuously
  // if the fixture rendered none. 13 are up at rest when this was written; the
  // floor is deliberately well under that, so adding or gating one behind a
  // menu does not fail this file, only losing most of them does.
  //
  // Only the ones a bare workbook renders. `FilterMenu.tsx:738` has a region
  // of its own -- `role="alert"` with an explicit `aria-atomic`, so a fourth
  // variant -- that is mounted with the filter menu and out of this PR's
  // scope; it is left for whoever next touches that file.
  it("renders the regions to check", () => {
    expect(regions().length).toBeGreaterThanOrEqual(8);
  });

  it("gives every region a status or alert role", () => {
    regions().forEach((el) => {
      expect([el.id, el.getAttribute("role")]).toEqual([
        el.id,
        expect.stringMatching(/^(status|alert)$/),
      ]);
    });
  });

  it("spells out aria-live only where it overrides the role", () => {
    regions().forEach((el) => {
      const live = el.getAttribute("aria-live");
      if (live == null) return;
      const role = el.getAttribute("role") ?? "";
      // Paired with the id so a failure names the region rather than just the
      // value that was wrong.
      expect([el.id, live]).not.toEqual([el.id, IMPLICIT_POLITENESS[role]]);
    });
  });

  it("leaves aria-atomic to the role on every region", () => {
    regions().forEach((el) => {
      expect([el.id, el.getAttribute("aria-atomic")]).toEqual([el.id, null]);
    });
  });
});
