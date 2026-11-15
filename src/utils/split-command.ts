/**
 * Split a command string into argv the way a user expects from a shell —
 * whitespace separates, '…' and "…" group, backslash escapes — without ever
 * invoking a shell: no variables, globs, pipes or `;` are interpreted.
 */
export function splitCommand(input: string): string[] {
  const out: string[] = [];
  let cur = "";
  let has = false;
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (quote) {
      if (ch === quote) quote = null;
      // POSIX: inside "…" a backslash only escapes \ " $ ` — so quoted
      // Windows paths like "C:\tools\x.js" survive intact.
      else if (ch === "\\" && quote === '"' && /[\\"$`]/.test(input[i + 1] ?? ""))
        cur += input[++i];
      else cur += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      has = true;
    } else if (ch === "\\" && i + 1 < input.length) {
      cur += input[++i];
      has = true;
    } else if (/\s/.test(ch)) {
      if (has) out.push(cur);
      cur = "";
      has = false;
    } else {
      cur += ch;
      has = true;
    }
  }
  if (has) out.push(cur);
  return out;
}
