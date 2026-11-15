/**
 * `branchit shell-init zsh|bash|fish` — a tiny wrapper function that lets the
 * TUI change your shell's directory (a child process never can on its own).
 * Branchit writes the target to $BRANCHIT_CD_FILE; the wrapper `cd`s there
 * after it exits. Used by "open worktree here".
 */
import type { Shell } from "./completions.js";

function posix(): string {
  return `# branchit shell integration — add to your shell rc:
#   eval "$(branchit shell-init ${"$"}{SHELL##*/})"
branchit() {
  local __branchit_cd __branchit_status
  __branchit_cd="$(mktemp "\${TMPDIR:-/tmp}/branchit-cd.XXXXXX")" || { command branchit "$@"; return; }
  BRANCHIT_CD_FILE="$__branchit_cd" command branchit "$@"
  __branchit_status=$?
  if [ -s "$__branchit_cd" ]; then
    cd -- "$(cat "$__branchit_cd")" || __branchit_status=$?
  fi
  rm -f "$__branchit_cd"
  return $__branchit_status
}
`;
}

function fish(): string {
  return `# branchit shell integration — add to ~/.config/fish/config.fish:
#   branchit shell-init fish | source
function branchit
    set -l __branchit_cd (mktemp (string join / (set -q TMPDIR; and echo $TMPDIR; or echo /tmp) branchit-cd.XXXXXX))
    BRANCHIT_CD_FILE=$__branchit_cd command branchit $argv
    set -l __branchit_status $status
    if test -s $__branchit_cd
        cd (cat $__branchit_cd)
    end
    rm -f $__branchit_cd
    return $__branchit_status
end
`;
}

export function shellInitScript(shell: Shell): string | null {
  if (shell === "zsh" || shell === "bash") return posix();
  if (shell === "fish") return fish();
  return null;
}
