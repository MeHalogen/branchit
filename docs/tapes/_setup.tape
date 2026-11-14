# Shared hidden setup for the focused GIFs. Run tapes from the repo root after
# `npm run build`; see `npm run demo:gifs`.
Set Shell bash
Set FontSize 20
Set Width 1200
Set Height 900
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 45ms

Hide
Type 'export BRANCHIT_SRC="$PWD" BRANCHIT_CONFIG_DIR="$(mktemp -d)"' Enter
Type 'printf "{\"onboarded\":true}" > "$BRANCHIT_CONFIG_DIR/state.json"' Enter
Type 'mkdir -p "$BRANCHIT_CONFIG_DIR/bin" && printf "#!/bin/sh\nexec node \"%s/dist/cli.js\" \"\$@\"\n" "$BRANCHIT_SRC" > "$BRANCHIT_CONFIG_DIR/bin/branchit" && chmod +x "$BRANCHIT_CONFIG_DIR/bin/branchit" && export PATH="$BRANCHIT_CONFIG_DIR/bin:$PATH"' Enter
Type 'cd "$(branchit demo 2>/dev/null </dev/null)" && clear' Enter
Show
