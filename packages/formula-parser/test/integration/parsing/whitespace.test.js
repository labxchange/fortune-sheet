import Parser from "../../../src/parser";

// Named `*.test.js` on purpose: the repo-root `yarn test` (the only test step in
// CI) uses jest's default testMatch, which picks up `*.test.js` but not the plain
// `test/**/*.js` files the rest of this package uses. Keeping this regression here
// means the lexer change it guards actually runs in CI.
describe(".parse() whitespace before a function's '('", () => {
  let parser;

  beforeEach(() => {
    parser = new Parser();
  });
  afterEach(() => {
    parser = null;
  });

  it("tolerates whitespace between a function name and its '('", () => {
    parser.setFunction("ADD_5", (params) => params[0] + 5);

    // A space before the parenthesis must not cause the function name to be
    // mis-lexed — either as a variable (e.g. `IF`) or as a cell reference
    // (e.g. `LOG10`). Standard spreadsheets accept this variation.
    expect(parser.parse("SUM (4, ADD_5(1))")).toMatchObject({
      error: null,
      result: 10,
    });
    expect(parser.parse("SUM  (1, 2, 3)")).toMatchObject({
      error: null,
      result: 6,
    });
    expect(parser.parse("IF ( 1 , SUM(1, 2) , 9 )")).toMatchObject({
      error: null,
      result: 3,
    });
    // LOG10 is also a valid cell address (column LOG, row 10); the FUNCTION
    // rule must still win the tie against RELATIVE_CELL for the spaced form.
    expect(parser.parse("LOG10 (100)")).toMatchObject({
      error: null,
      result: 2,
    });
  });
});
