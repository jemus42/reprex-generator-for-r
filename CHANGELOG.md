# Changelog

## [0.1.0] - 2025-03-16

Initial public release.

### Features

- **Reprex: Start Addin** - Launch the interactive `reprex::reprex_addin()` in
  the active R console. Tries Positron's console first, falls back to the
  vscode-R extension, and finally offers clipboard-based alternatives.
- **Reprex: Active File** - Run reprex on the entire contents of the active
  editor file.
- **Reprex: Selected Code** - Run reprex on the current text selection.
- Reprex output is displayed in a themed webview panel with a copy-to-clipboard
  button.
- Output is automatically copied to the clipboard when possible (via both
  `{clipr}` and the VS Code clipboard API).
- Commands are grouped under the "Reprex" category in the command palette.
- Editor-dependent commands are disabled when no editor or selection is active.
- Test suite with R integration tests (guarded by Rscript availability).
