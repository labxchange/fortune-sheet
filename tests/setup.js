import "jest-canvas-mock";

import React from "react";

global.React = React;

jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useLayoutEffect: jest.requireActual("react").useEffect,
}));

jest.setTimeout(60000);

Object.defineProperty(window, "open", {
  value: jest.fn,
});

global.requestAnimationFrame =
  global.requestAnimationFrame ||
  function requestAnimationFrame(cb) {
    return setTimeout(cb, 0);
  };

global.cancelAnimationFrame =
  global.cancelAnimationFrame ||
  function cancelAnimationFrame() {
    return null;
  };

// browserMocks.js
export const localStorageMock = (() => {
  let store = {
    locale: "zh",
  };

  return {
    getItem(key) {
      return store[key] || null;
    },
    setItem(key, value) {
      store[key] = value.toString();
    },
    removeItem(key) {
      store[key] = null;
    },
    clear() {
      store = {};
    },
  };
})();

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
  writable: true,
});

Object.defineProperty(window, "cancelAnimationFrame", {
  value: () => null,
});

Math.random = () => 0.8404419276253765;

global.URL.createObjectURL = () => {};

// jsdom does not implement the global `CSS` object. Anything that resolves an
// idref — `aria-controls`, `aria-labelledby` — reaches for `CSS.escape` to
// build the selector and throws without it.
global.CSS = global.CSS || {
  escape: (value) => String(value).replace(/([^\w-])/g, "\\$1"),
};

// jsdom does not implement `innerText` either — it is defined in terms of
// rendered layout, which jsdom has none of. Without this, reading it yields
// `undefined` and writing it quietly creates an own property that the DOM
// never sees, so anything built on it (the sheet-tab rename field,
// `editSheetName`) cannot be tested at all: it neither works nor visibly
// fails. `textContent` is the standard approximation and is exact for the
// single-line, unstyled spans these components use.
Object.defineProperty(global.HTMLElement.prototype, "innerText", {
  configurable: true,
  get() {
    return this.textContent;
  },
  set(value) {
    this.textContent = value;
  },
});
