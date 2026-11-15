# "Worktrees for the parallel-agent era."
Output docs/gifs/worktrees.gif
Source docs/tapes/_setup.tape

# The real shell integration, exactly as a user installs it.
Type 'eval "$(branchit shell-init bash)"' Sleep 300ms Enter
Sleep 1s

Type "branchit" Sleep 300ms Enter
Sleep 2.5s
Type "t"
Sleep 2.5s
# Add a worktree for an existing branch.
Type "a"
Sleep 1.5s
Type "retry"
Sleep 1.5s
Enter
Sleep 2.5s
Enter
Sleep 3s
# And one for a brand-new branch.
Type "n"
Sleep 1.5s
Enter
Sleep 1s
Type "agent two"
Sleep 1.5s
Enter
Sleep 2.5s
Enter
Sleep 3s
# Open one: Branchit exits and your shell is already there.
Type "j"
Sleep 1s
Enter
Sleep 2s
Type "pwd && git branch --show-current" Sleep 300ms Enter
Sleep 3.5s
