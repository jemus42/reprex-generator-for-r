# Changelog

## [0.4.0] - 2026-10-10

### Added

- **Choose Venue** commands for the active file and the selection, with a quick
  pick that remembers the last choice. Also available in the R editor context
  menu.
- Progress notification with live reprex stages and a cancel button; full R
  output goes to the "Reprex" output channel, and errors offer "Show Log".
- Settings `reprex.rscriptPath` and `reprex.copyToClipboard`.

### Changed

- Output opens in a regular editor beside the code (markdown, R or HTML
  depending on venue) instead of a webview.
- Reprexes run in the file's directory (or the workspace root) so relative
  paths work.
- `Rscript` is spawned without a shell, fixing quoting problems with unusual
  paths and Windows.
- The extension now runs on the workspace side in remote sessions and requires
  a trusted workspace.

### Fixed

- Failed renders were silently ignored; the R error is now shown.

## [0.3.0] - 2025-03-16

### Added

- Configurable output venue via the `reprex.venue` setting. Supports `gh`
  (default), `slack`, `r`, `html`, `so`, and `ds`. Set it in Settings under
  "Reprex".

## [0.2.0] - 2025-03-16

### Fixed

- All commands are now always visible in the command palette. Previously,
  `enablement` clauses caused Positron to hide commands like "Selected Code"
  when no selection was active. Validation is handled in the command handlers
  instead.

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
