# VHS Tape Script for Branchit Demo
# Run from the repository root: npm run demo:gif

Set Shell bash
Set FontSize 20
Set Width 1200
Set Height 760
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 45ms

# Output to docs directory
Output docs/demo.gif

# Hidden setup commands to ensure a clean slate and correct config
Hide
Type 'export BRANCHIT_SRC="$PWD"' Enter
Type "export BRANCHIT_CONFIG_DIR=/tmp/branchit-config" Enter
Type "rm -rf /tmp/branchit-config" Enter
Type "mkdir -p /tmp/branchit-config" Enter
Type "node --import tsx scripts/demo-repo.ts /tmp/branchit-demo" Enter
Type "cd /tmp/branchit-demo" Enter
Type "clear" Enter
Show

# --- START TOUR ---
Sleep 2s

# Launch Branchit
Type 'node "$BRANCHIT_SRC/dist/cli.js"' Enter
Sleep 3s

# 1. Onboarding Screen
# Let the user read the onboarding welcome screen.
Sleep 4s
Enter
Sleep 3s

# 2. Fuzzy Branch Switching
# Press 'b' to open the branch switcher.
Type "b"
Sleep 1.5s
# Type 'payret' to filter to feat/payment-retry.
Type "payret"
Sleep 2.5s
# Press Tab to inspect the branch details (author, commit, upstream status).
Tab
Sleep 4.5s
# Press Enter to switch branch.
Enter
Sleep 3.5s

# 3. Pull Request Readiness Checklist
# Press 'p' on feat/payment-retry to check PR readiness (2 commits ahead, no upstream).
Type "p"
Sleep 4.5s
# Press 'p' to push to origin (sets upstream and updates checklist dynamically).
Type "p"
Sleep 6s
# Dismiss checklist and return to dashboard.
Escape
Sleep 2s

# 4. Switch back to main branch.
Type "b"
Sleep 1.5s
Type "main"
Sleep 1.5s
Enter
Sleep 3.5s

# 5. Stale-Branch Sweeper with Undo (Wow Moment!)
# Press 's' to open the sweeper (shows merged branches safe to delete).
Type "s"
Sleep 4s
# Press 'a' to select all safe branches.
Type "a"
Sleep 2.5s
# Press 'd' to open deletion confirmation.
Type "d"
Sleep 4.5s
# Press Enter to execute the deletion.
Enter
Sleep 4.5s
# Let's perform an Undo! Press 'u' to restore the deleted branches instantly.
Type "u"
Sleep 6s
# Close the sweeper result modal.
Escape
Sleep 2s

# 6. Conventional Commit & Security-Gated Pre-Commit Checks (Wow Moment!)
# Press 'c' to trigger the commit flow.
Type "c"
Sleep 3s
# Press 'a' to stage both modified files (src/payments/retry.ts, TODO.md).
Type "a"
Sleep 2.5s
# Press Enter to go to commit type selection.
Enter
Sleep 3s
# Press Enter on 'feat' type.
Enter
Sleep 3s
# Scope selection (suggests 'payments' automatically). Press Enter to accept.
Enter
Sleep 3s
# Type subject line.
Type "wire up exponential backoff for retries"
Sleep 3s
# Press Enter to go to body (leave empty).
Enter
Sleep 1.5s
# Press Enter to go to preview.
Enter
Sleep 3.5s
# Press Enter to proceed to checks.
Enter
Sleep 3.5s
# Prompt: Branchit detects repo-defined checks and requests explicit trust.
# Press 't' to trust and run them.
Type "t"
Sleep 8s
# The checks pass and the commit is created automatically.
# Press Enter on the final success screen to return to dashboard.
Enter
Sleep 3s

# 7. Command Palette
# Press ':' to open the fuzzy command palette.
Type ":"
Sleep 2.5s
Type "help"
Sleep 2.5s
Escape
Sleep 2s

# Exit Branchit
Type "q"
Sleep 3s
