import Parser from "../../../src/parser";

describe(".parse() custom function", () => {
  let parser;

  beforeEach(() => {
    parser = new Parser();
  });
  afterEach(() => {
    parser = null;
  });

  it("should evaluate custom functions", () => {
    expect(parser.parse("foo()")).toMatchObject({
      error: "#NAME?",
      result: null,
    });

    parser.setFunction("ADD_5", (params) => params[0] + 5);
    parser.setFunction("GET_LETTER", (params) => {
      const string = params[0];
      const index = params[1] - 1;

      return string.charAt(index);
    });

    expect(parser.parse("SUM(4, ADD_5(1))")).toMatchObject({
      error: null,
      result: 10,
    });
    expect(parser.parse('GET_LETTER("Some string", 3)')).toMatchObject({
      error: null,
      result: "m",
    });
  });

  it("should evaluate function with arguments passed as an stringified array", () => {
    expect(parser.parse("SUM([])")).toMatchObject({ error: null, result: 0 });
    expect(parser.parse("SUM([1])")).toMatchObject({ error: null, result: 1 });
    expect(parser.parse("SUM([1,2,3])")).toMatchObject({
      error: null,
      result: 6,
    });
  });

  it("should tolerate whitespace between a function name and its '('", () => {
    parser.setFunction("ADD_5", (params) => params[0] + 5);

    // A space before the parenthesis must not turn the function name into an
    // unresolved variable — standard spreadsheets accept this variation.
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
  });
});
