import { describe, it, expect } from "bun:test";
import { splitSqlStatements } from "../../src/scripts/splitSqlStatements.js";

// ============================================================
// splitSqlStatements Unit Tests
// ============================================================

describe("splitSqlStatements", () => {
  it("splits on semicolons and trims", () => {
    expect(splitSqlStatements("SELECT 1;\n  SELECT 2 ;\nSELECT 3")).toEqual([
      "SELECT 1",
      "SELECT 2",
      "SELECT 3",
    ]);
  });

  it("keeps semicolons inside strings and quoted identifiers", () => {
    expect(
      splitSqlStatements(`INSERT INTO t VALUES ('a;b', 'it''s; fine'); SELECT "odd;name" FROM t;`),
    ).toEqual([`INSERT INTO t VALUES ('a;b', 'it''s; fine')`, `SELECT "odd;name" FROM t`]);
  });

  it("handles backslash escapes only in E strings", () => {
    expect(splitSqlStatements(`SELECT E'a\\';b'; SELECT 'c\\'; SELECT 1;`)).toEqual([
      `SELECT E'a\\';b'`,
      `SELECT 'c\\'`,
      "SELECT 1",
    ]);
  });

  it("keeps dollar-quoted function bodies together", () => {
    const fn = `CREATE FUNCTION f() RETURNS int AS $$
BEGIN
  PERFORM 1;
  RETURN 2;
END $$ LANGUAGE plpgsql`;
    const tagged = `CREATE FUNCTION g(int) RETURNS int AS $_$ SELECT $1; $_$ LANGUAGE sql`;
    expect(splitSqlStatements(`${fn};\n${tagged};`)).toEqual([fn, tagged]);
  });

  it("ignores semicolons in comments and drops comment-only statements", () => {
    expect(
      splitSqlStatements(`-- header; comment
/* block; /* nested; */ still comment */
SELECT 1; -- trailing;
;
-- only a comment;
`),
    ).toEqual(["SELECT 1"]);
  });
});
