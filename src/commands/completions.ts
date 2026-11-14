/** `branchit completions zsh|bash|fish` — shell completion scripts. */

export const SUBCOMMANDS = [
  "status",
  "sweep",
  "branches",
  "pr",
  "switch",
  "undo",
  "worktrees",
  "demo",
  "doctor",
  "config",
  "completions",
  "shell-init",
  "version",
  "help",
] as const;

export const FLAGS = [
  "--json",
  "--plain",
  "--yes",
  "--dry-run",
  "--all",
  "--list",
  "--no-color",
  "--ascii",
  "--debug",
  "--help",
  "--version",
] as const;

export type Shell = "zsh" | "bash" | "fish";

const DESCRIPTIONS: Record<(typeof SUBCOMMANDS)[number], string> = {
  status: "Print repository status",
  sweep: "Find and delete merged branches",
  branches: "List branches",
  pr: "Pull-request readiness",
  switch: "Switch to a branch",
  undo: "Undo the last operation",
  worktrees: "List worktrees",
  "shell-init": "Print the shell wrapper for cd-on-exit",
  demo: "Open a sandbox demo repository",
  doctor: "Diagnose the environment",
  config: "Show resolved configuration",
  completions: "Print shell completions",
  version: "Print the version",
  help: "Show help",
};

function bash(): string {
  return `# branchit bash completion — add to ~/.bashrc:  eval "$(branchit completions bash)"
_branchit() {
  local cur prev
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  if [[ "$prev" == "switch" ]]; then
    COMPREPLY=( $(compgen -W "$(git for-each-ref --format='%(refname:short)' refs/heads 2>/dev/null)" -- "$cur") )
    return
  fi
  if [[ "$prev" == "completions" || "$prev" == "shell-init" ]]; then
    COMPREPLY=( $(compgen -W "zsh bash fish" -- "$cur") )
    return
  fi
  if [[ "$cur" == -* ]]; then
    COMPREPLY=( $(compgen -W "${FLAGS.join(" ")}" -- "$cur") )
  elif [[ $COMP_CWORD -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "${SUBCOMMANDS.join(" ")}" -- "$cur") )
  fi
}
complete -F _branchit branchit
`;
}

function zsh(): string {
  const cmds = SUBCOMMANDS.map((c) => `    '${c}:${DESCRIPTIONS[c]}'`).join("\n");
  return `#compdef branchit
# branchit zsh completion — add to ~/.zshrc:  eval "$(branchit completions zsh)"
_branchit() {
  local -a commands
  commands=(
${cmds}
  )
  if (( CURRENT == 2 )); then
    _describe 'command' commands
    _values 'flag' ${FLAGS.map((f) => `'${f}'`).join(" ")}
    return
  fi
  case "\${words[2]}" in
    switch) compadd -- \${(f)"$(git for-each-ref --format='%(refname:short)' refs/heads 2>/dev/null)"} ;;
    completions|shell-init) compadd zsh bash fish ;;
    *) compadd -- ${FLAGS.join(" ")} ;;
  esac
}
compdef _branchit branchit
`;
}

function fish(): string {
  const lines = [
    "# branchit fish completion — run:  branchit completions fish > ~/.config/fish/completions/branchit.fish",
    "complete -c branchit -f",
  ];
  for (const c of SUBCOMMANDS) {
    lines.push(`complete -c branchit -n __fish_use_subcommand -a ${c} -d '${DESCRIPTIONS[c]}'`);
  }
  lines.push(
    "complete -c branchit -n '__fish_seen_subcommand_from switch' -a '(git for-each-ref --format=\"%(refname:short)\" refs/heads 2>/dev/null)'",
    "complete -c branchit -n '__fish_seen_subcommand_from completions shell-init' -a 'zsh bash fish'",
  );
  for (const f of FLAGS) lines.push(`complete -c branchit -l ${f.slice(2)}`);
  return `${lines.join("\n")}\n`;
}

export function completionScript(shell: Shell): string | null {
  switch (shell) {
    case "bash":
      return bash();
    case "zsh":
      return zsh();
    case "fish":
      return fish();
    default:
      return null;
  }
}
