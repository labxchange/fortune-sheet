import { normalizeHex } from "../src/components/Toolbar/ColorHexInput";

// The whole of what the typed-colour field will accept, and the reason the
// field itself can stay simple: everything it does with a value it cannot read
// hangs off this returning null.

describe("normalizeHex", () => {
  it.each([
    ["#1a73e8", "#1a73e8"],
    ["1a73e8", "#1a73e8"],
    ["#ABC", "#aabbcc"],
    ["abc", "#aabbcc"],
    ["  #fff  ", "#ffffff"],
    ["#FFFFFF", "#ffffff"],
  ])("reads %p as %p", (raw, expected) => {
    expect(normalizeHex(raw)).toBe(expected);
  });

  it.each([
    [""],
    ["#"],
    ["#12"],
    ["#abcd"],
    ["reddish"],
    ["rgb(0,0,0)"],
    // Eight digits is a colour with an alpha channel elsewhere, and this is not
    // that. It matters because the field used to cap its input at seven
    // characters, so a pasted "#12345678" arrived as "#123456" and was accepted
    // as a different colour rather than refused.
    ["#12345678"],
    ["#ff ffff"],
  ])("refuses %p", (raw) => {
    expect(normalizeHex(raw)).toBeNull();
  });
});
