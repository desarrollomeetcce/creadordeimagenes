/** Bounded arithmetic only. Never eval, Function, user JavaScript or remote code. */
export function calculate(expression: string): number {
  const compact = expression.replace(/\s/g, "");
  if (!compact || compact.length > 120 || !/^[\d.+*/()^\-]+$/.test(compact))
    throw Error("Usa números, paréntesis y operaciones + − × ÷ ^.");
  const tokens = compact.match(/(?:\d+(?:\.\d*)?|\.\d+)|[+*/()^\-]/g)!;
  let position = 0,
    depth = 0;
  function primary(): number {
    if (++depth > 24) throw Error("La expresión es demasiado compleja.");
    let value: number;
    const token = tokens[position++];
    if (token === "(") {
      value = sum();
      if (tokens[position++] !== ")")
        throw Error("Falta cerrar un paréntesis.");
    } else if (token && /^(?:\d|\.)/.test(token)) value = Number(token);
    else throw Error("Expresión incompleta.");
    depth--;
    return value;
  }
  function power(): number {
    let n = primary();
    if (tokens[position] === "^") {
      position++;
      const e = unary();
      if (Math.abs(e) > 1000) throw Error("Exponente demasiado grande.");
      n = Math.pow(n, e);
    }
    return n;
  }
  function unary(): number {
    if (tokens[position] === "+" || tokens[position] === "-") {
      const sign = tokens[position++];
      return (sign === "-" ? -1 : 1) * unaryBounded();
    }
    return power();
  }
  function unaryBounded(): number {
    if (++depth > 24) throw Error("Expresión demasiado compleja.");
    const n = unary();
    depth--;
    return n;
  }
  function product(): number {
    let n = unary();
    while (tokens[position] === "*" || tokens[position] === "/") {
      const op = tokens[position++],
        v = unary();
      if (op === "/" && v === 0) throw Error("No se puede dividir entre cero.");
      n = op === "*" ? n * v : n / v;
    }
    return n;
  }
  function sum(): number {
    let n = product();
    while (tokens[position] === "+" || tokens[position] === "-") {
      const op = tokens[position++],
        v = product();
      n = op === "+" ? n + v : n - v;
    }
    return n;
  }
  const result = sum();
  if (
    position !== tokens.length ||
    !Number.isFinite(result) ||
    Math.abs(result) > 1e15
  )
    throw Error("Resultado fuera del rango permitido.");
  return result;
}
export function numericCell(value: string): number | null {
  const text = value.trim();
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}
export function dataSummary(rows: string[][], column: number) {
  const values = rows
    .map((r) => numericCell(r[column] ?? ""))
    .filter((v): v is number => v !== null);
  return {
    count: values.length,
    sum: values.reduce((a, b) => a + b, 0),
    average: values.length
      ? values.reduce((a, b) => a + b, 0) / values.length
      : null,
  };
}
