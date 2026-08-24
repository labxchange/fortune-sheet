import { contextFactory, selectionFactory } from "../factories/context";
import { pastedHtmlFactory } from "../factories/pasted-html";
import { handlePaste } from "../../src/events/paste";
import { selectionCache } from "../../src";

describe("paste", () => {
  const getContext = () =>
    contextFactory({
      luckysheet_select_save: selectionFactory([0, 0], [0, 0], 0, 0),
    });

  test("handlePaste", async () => {
    const contents = new Array(10);
    const ctx = getContext();
    ctx.luckysheetfile[0].data = [
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ];

    document.execCommand = jest.fn();
    const newEvent = new Event("paste");
    const clipboardData = {};
    clipboardData.getData = jest.fn().mockImplementation(() => "abcd");
    clipboardData.files = [];
    newEvent.clipboardData = clipboardData;
    handlePaste(ctx, newEvent);
    expect(document.execCommand).toHaveBeenCalledWith(
      "insertText",
      false,
      "abcd"
    );
    expect(newEvent.clipboardData.getData).toHaveBeenCalledWith("text/plain");

    ctx.luckysheet_copy_save = { copyRange: [] };
    selectionCache.isPasteAction = true;
    clipboardData.getData = jest.fn().mockImplementation((p) => {
      contents.push(p);
      return pastedHtmlFactory("WPS");
    });
    handlePaste(ctx, newEvent);
    expect(newEvent.clipboardData.getData).toHaveBeenCalledWith("text/html");
    expect(ctx.luckysheetfile[0].data[0][0].v).toBe(1);
    expect(ctx.luckysheetfile[0].data[3][0].v).toBe(6);
    expect(ctx.luckysheetfile[0].data[0][2]).toEqual({
      bg: undefined,
      bl: 1,
      ct: {
        fa: "General",
        t: "n",
      },
      fc: "rgb(237, 125, 49)",
      ff: 0,
      fs: 9,
      ht: 1,
      it: 0,
      m: "3",
      v: 3,
      vt: 0,
    });
    expect(ctx.luckysheetfile[0].data[1][0]).toEqual({
      bg: "rgb(237, 125, 49)",
      bl: 0,
      ct: {
        fa: "General",
        t: "n",
      },
      fc: "rgb(0, 0, 0)",
      ff: 0,
      fs: 9,
      ht: 1,
      it: 0,
      m: "4",
      v: 4,
      vt: 0,
    });
  });

  // The values-only half of Ctrl+Shift+V. The key handler's own test asserts
  // the two flags are set and that the browser's paste event is allowed
  // through; these cover what the flag actually buys, which nothing exercised.
  describe("paste values only", () => {
    const blankSheet = () => [
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ];

    const pasteWith = (ctx, flavours) => {
      document.execCommand = jest.fn();
      const event = new Event("paste");
      event.clipboardData = {
        files: [],
        getData: jest.fn().mockImplementation((type) => flavours[type] ?? ""),
      };
      handlePaste(ctx, event);
      return event;
    };

    afterEach(() => {
      selectionCache.isPasteAction = false;
      selectionCache.pasteValuesOnly = false;
    });

    test("reads the plain-text flavour in preference to the styled HTML", () => {
      const ctx = getContext();
      ctx.luckysheetfile[0].data = blankSheet();
      ctx.luckysheet_copy_save = { copyRange: [] };
      selectionCache.isPasteAction = true;
      selectionCache.pasteValuesOnly = true;

      const event = pasteWith(ctx, {
        "text/html": pastedHtmlFactory("WPS"),
        "text/plain": "7",
      });

      // Never asked for the HTML: that is what drops the styles, borders and
      // merges the styled routes would have carried across.
      expect(event.clipboardData.getData).not.toHaveBeenCalledWith("text/html");
      expect(ctx.luckysheetfile[0].data[0][0].v).toBe(7);
      expect(ctx.luckysheetfile[0].data[0][0].bl).toBeUndefined();
    });

    test("leaves a leading = as literal text rather than reviving a formula", () => {
      const ctx = getContext();
      ctx.luckysheetfile[0].data = blankSheet();
      ctx.luckysheet_copy_save = { copyRange: [] };
      selectionCache.isPasteAction = true;
      selectionCache.pasteValuesOnly = true;

      pasteWith(ctx, { "text/plain": "=SUM(A1:A2)" });

      const cell = ctx.luckysheetfile[0].data[0][0];
      expect(cell.f).toBeUndefined();
      expect(cell.v).toBe("=SUM(A1:A2)");
    });

    test("clears the flag so the next ordinary paste keeps its formatting", () => {
      const ctx = getContext();
      ctx.luckysheetfile[0].data = blankSheet();
      ctx.luckysheet_copy_save = { copyRange: [] };
      selectionCache.isPasteAction = true;
      selectionCache.pasteValuesOnly = true;

      pasteWith(ctx, { "text/plain": "1" });

      expect(selectionCache.pasteValuesOnly).toBe(false);
    });
  });
});
