// ============================================================
// SQL Script Splitter
// ============================================================

/**
 * Splits a PostgreSQL script into individual statements.
 *
 * The Effect 4 Postgres driver only speaks the extended query protocol, which
 * accepts one statement per query, so migration files have to be split
 * before they are executed. Semicolons inside quoted strings, quoted
 * identifiers, dollar-quoted bodies and comments do not end a statement.
 * Statements that contain only whitespace and comments are dropped.
 */
export const splitSqlStatements = (script: string): Array<string> => {
  const statements: Array<string> = [];
  // Index of the first non-comment character of the current statement
  let codeStart = -1;
  let i = 0;

  const markCode = (at: number) => {
    if (codeStart === -1) codeStart = at;
  };

  const push = (end: number) => {
    if (codeStart !== -1) statements.push(script.slice(codeStart, end).trim());
    codeStart = -1;
  };

  while (i < script.length) {
    const ch = script[i]!;
    const next = script[i + 1];

    // -- line comment
    if (ch === "-" && next === "-") {
      const end = script.indexOf("\n", i);
      i = end === -1 ? script.length : end + 1;
      continue;
    }

    // /* block comment */ (nestable in PostgreSQL)
    if (ch === "/" && next === "*") {
      let depth = 1;
      i += 2;
      while (i < script.length && depth > 0) {
        if (script[i] === "/" && script[i + 1] === "*") {
          depth++;
          i += 2;
        } else if (script[i] === "*" && script[i + 1] === "/") {
          depth--;
          i += 2;
        } else {
          i++;
        }
      }
      continue;
    }

    // 'string' ('' escapes a quote; E'...' also allows backslash escapes)
    if (ch === "'") {
      const prev = script[i - 1];
      const beforePrev = script[i - 2];
      const backslashEscapes =
        (prev === "E" || prev === "e") && (beforePrev === undefined || !/[\w$]/.test(beforePrev));
      markCode(backslashEscapes ? i - 1 : i);
      i++;
      while (i < script.length) {
        if (backslashEscapes && script[i] === "\\") {
          i += 2;
        } else if (script[i] === "'" && script[i + 1] === "'") {
          i += 2;
        } else if (script[i] === "'") {
          i++;
          break;
        } else {
          i++;
        }
      }
      continue;
    }

    // "quoted identifier"
    if (ch === '"') {
      markCode(i);
      const end = script.indexOf('"', i + 1);
      i = end === -1 ? script.length : end + 1;
      continue;
    }

    // $tag$ dollar-quoted body $tag$ (not $1 parameters)
    if (ch === "$") {
      const tag = /^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/.exec(script.slice(i, i + 64))?.[0];
      if (tag !== undefined) {
        markCode(i);
        const end = script.indexOf(tag, i + tag.length);
        i = end === -1 ? script.length : end + tag.length;
        continue;
      }
    }

    if (ch === ";") {
      push(i);
      i++;
      continue;
    }

    if (!/\s/.test(ch)) markCode(i);
    i++;
  }

  push(script.length);
  return statements;
};
