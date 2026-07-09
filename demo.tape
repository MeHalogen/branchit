# VHS Tape Script for Branchy Demo
# Run: vhs demo.tape

Set Shell bash
Set FontSize 20
Set FontFamily "JetBrains Mono"
Set Width 1200
Set Height 760
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 45ms

# Output to docs directory
Output docs/demo.gif

# Hidden setup commands to ensure a clean slate and correct config
Hide
Type "export BRANCHY_CONFIG_DIR=/tmp/branchy-config" Enter
Type "rm -rf /tmp/branchy-config" Enter
Type "mkdir -p /tmp/branchy-config" Enter
Type "node /Users/mehalsrivastava/GitHub/Branchy/scripts/demo-repo.ts /tmp/branchy-demo" Enter
Type "cd /tmp/branchy-demo" Enter
Type "clear" Enter
Show

# --- START TOUR ---
Sleep 1.5s

# Launch Branchy
Type "node /Users/mehalsrivastava/GitHub/Branchy/dist/cli.js" Enter
Sleep 2s

# 1. Onboarding Screen
# Welcome screen is visible, explaining the layout. Press Enter to start.
Enter
Sleep 2s

# 2. Fuzzy Branch Switching
# Press 'b' to open the branch switcher, type 'payret' to filter to feat/payment-retry
Type "b"
Sleep 1.2s
Type "payret"
Sleep 1.5s
# Press Tab to inspect the branch details (author, commit SHA, upstream status)
Tab
Sleep 2.5s
# Press Enter to switch to it
Enter
Sleep 2.5s

# 3. Pull Request Readiness Checklist
# Press 'p' on feat/payment-retry to check PR readiness (2 commits ahead, no upstream)
Type "p"
Sleep 2.5s
# Press 'p' to push to origin (which sets upstream and updates checklist dynamically)
Type "p"
Sleep 4.5s
# Dismiss checklist and return to dashboard
Escape
Sleep 1.5s

# 4. Switch back to main branch
Type "b"
Sleep 1.2s
Type "main"
Sleep 1.5s
Enter
Sleep 2.5s

# 5. Stale-Branch Sweeper with Undo
# Press 's' to open the sweeper (shows merged branches safe to delete)
Type "s"
Sleep 2s
# Press 'a' to select all safe branches
Type "a"
Sleep 1.5s
# Press 'd' to delete them
Type "d"
Sleep 3.5s
# Let's perform an Undo! Press 'u' to restore the deleted branches instantly
Type "u"
Sleep 4s
# Close the sweeper result modal
Escape
Sleep 1.5s

# 6. Conventional Commit & Security-Gated Pre-Commit Checks
# Press 'c' to trigger the commit flow
Type "c"
Sleep 2s
# Press 'a' to stage both modified files (src/payments/retry.ts, TODO.md)
Type "a"
Sleep 1.5s
# Press Enter to go to commit type selection
Enter
Sleep 2s
# Press Enter on 'feat' type
Enter
Sleep 2s
# Scope selection (suggests 'payments' automatically). Press Enter to accept.
Enter
Sleep 2s
# Type subject line
Type "wire up exponential backoff for retries"
Sleep 2.5s
# Press Enter to go to body (leave empty)
Enter
Sleep 1.5s
# Press Enter to go to preview
Enter
Sleep 2s
# Press Enter to proceed to checks
Enter
Sleep 2s
# Prompt: Branchy detects repo-defined checks and requests explicit trust.
# Press 't' to trust and run them.
Type "t"
Sleep 6s
# The checks pass and the commit is created automatically.
# Press Enter on the final success screen to return to dashboard.
Enter
Sleep 2s

# 7. Command Palette
# Press ':' to open the fuzzy command palette
Type ":"
Sleep 1.5s
Type "help"
Sleep 2s
Escape
Sleep 1.5s

# Exit Branchy
Type "q"
Sleep 2s
