/**
 * Unified-diff parsing and hunk-level patch construction.
 *
 * `parseDiff` turns `git diff` output into files → hunks → typed lines for the
 * diff viewer. `hunkPatch` rebuilds a minimal patch for a single hunk that
 * `git apply --cached` (or `--cached --reverse`) accepts, which is how
 * hunk-level staging works without an interactive `git add -p`.
 */

export type DiffLineKind = "context" | "add" | "del" | "meta";

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
}

export interface Hunk {
  header: string;
  lines: DiffLine[];
}

export interface FileDiff {
  /** Path on the "b" side (new path for renames). */
  path: string;
  /** Lines from `diff --git` up to (not including) the first hunk. */
  header: string[];
  hunks: Hunk[];
  binary: boolean;
}

function pathFromDiffGit(line: string): string {
  // "diff --git a/<p> b/<p>": take the b/ side. Quoted paths keep their quotes.
  const m = line.match(/ b\/(.+)$/);
  return m?.[1] ?? line.slice("diff --git ".length);
}

export function parseDiff(text: string): FileDiff[] {
  const files: FileDiff[] = [];
  let file: FileDiff | null = null;
  let hunk: Hunk | null = null;
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      file = { path: pathFromDiffGit(line), header: [line], hunks: [], binary: false };
      hunk = null;
      files.push(file);
      continue;
    }
    if (!file) continue;
    if (line.startsWith("@@")) {
      hunk = { header: line, lines: [] };
      file.hunks.push(hunk);
      continue;
    }
    if (!hunk) {
      file.header.push(line);
      if (line.startsWith("Binary files ") || line === "GIT binary patch") file.binary = true;
      continue;
    }
    const sign = line[0];
    const body = line.slice(1);
    if (sign === "+") hunk.lines.push({ kind: "add", text: body });
    else if (sign === "-") hunk.lines.push({ kind: "del", text: body });
    else if (sign === "\\") hunk.lines.push({ kind: "meta", text: line });
    else hunk.lines.push({ kind: "context", text: body });
  }
  return files;
}

function renderLine(l: DiffLine): string {
  if (l.kind === "meta") return l.text;
  return `${l.kind === "add" ? "+" : l.kind === "del" ? "-" : " "}${l.text}`;
}

/** A patch for exactly one hunk of `file`, ready for `git apply --cached`. */
export function hunkPatch(file: FileDiff, index: number): string {
  const hunk = file.hunks[index];
  if (!hunk) throw new Error(`No hunk ${index} in ${file.path}`);
  return `${[...file.header, hunk.header, ...hunk.lines.map(renderLine)].join("\n")}\n`;
}

/** Added/removed line counts, for compact summaries. */
export function diffStat(file: FileDiff): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const h of file.hunks) {
    for (const l of h.lines) {
      if (l.kind === "add") added++;
      else if (l.kind === "del") removed++;
    }
  }
  return { added, removed };
}
