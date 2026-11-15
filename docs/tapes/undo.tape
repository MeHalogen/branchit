# "Git with an undo button."
Output docs/gifs/undo.gif
Source docs/tapes/_setup.tape

Type "branchit" Sleep 300ms Enter
Sleep 2.5s
# Discard a file's changes from the working tree screen...
Type "w"
Sleep 2s
Type "x"
Sleep 2s
Enter
Sleep 1.5s
Escape
Sleep 1s
# ...then take it back.
Type "u"
Sleep 3s
Enter
Sleep 2s
# Sweep merged branches, then undo that too.
Type "s"
Sleep 2.5s
Type "d"
Sleep 2s
Enter
Sleep 2s
Enter
Sleep 1s
Type "u"
Sleep 3s
Enter
Sleep 2.5s
Type "q"
Sleep 1s
