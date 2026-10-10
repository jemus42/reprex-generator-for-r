# Changelog

## [0.5.1] - 2026-10-10

### Fixed

- A missing pandoc now gives a clear message instead of reprex's misleading "This reprex appears to crash R".
- Error notifications show R's actual error message instead of the last lines of the backtrace.


## [0.5.0] - 2026-10-10

### Added

- In Positron, reprexes run with the R interpreter you have selected instead of whatever `Rscript` is first on `PATH`.
  `reprex.rscriptPath` still takes precedence.
- A missing `{reprex}` package now gives a clear message with an "Install reprex" button in Positron, or a copy-to-clipboard command elsewhere.
- Settings `reprex.sessionInfo`, `reprex.advertise`, `reprex.style` and `reprex.comment` for the matching `reprex()` options.
- Setting `reprex.timeoutSeconds` (default 600) stops runaway reprexes.
- Setting `reprex.keepFiguresDays` (default 30) removes old figure runs from the output location.
- **Reprex: Clipboard** command.

### Security

- Each run re-checks workspace trust.
- `reprex.rscriptPath` and `reprex.outputPath` are machine-scoped, so workspace settings cannot set them.
- **Reprex: Clipboard** asks for confirmation and shows the code first.
- R runs from a script file in a private temporary directory rather than `Rscript -e`, which also avoids Windows quoting problems.

### Changed

- `reprex.rscriptPath` now defaults to empty (auto-detect) instead of `Rscript`.


## [0.4.0] - 2026-10-10

### Added

- **Choose Venue** commands for the active file and the selection, with a quick pick that remembers the last choice.
  Also available in the R editor context menu.
- Progress notification with live reprex stages and a cancel button.
  Full R output goes to the "Reprex" output channel, and errors offer "Show Log".
- Settings `reprex.rscriptPath` and `reprex.copyToClipboard`.
- Settings `reprex.outputLocation` (`user`, `project`, `custom`) and `reprex.outputPath` control where figures from a reprex are kept.
  Each run gets its own subdirectory.
  `user` (default) is the platform cache directory (`$XDG_CACHE_HOME/reprex` or `~/.cache/reprex` on Linux, `~/Library/Caches/reprex` on macOS, `%LOCALAPPDATA%\reprex\Cache` on Windows).
  `project` is `.reprex/` in the workspace, which ignores itself in git.
- A "Reveal" notification when a run produced figures.
- Setting `reprex.uploadPlots` to stop `{reprex}` from uploading plots to imgur (its default for every venue except `r`).

### Changed

- Output opens in a regular editor beside the code (markdown, R or HTML depending on venue) instead of a webview.
- Reprexes run in the file's directory (or the workspace root) so relative paths work.
- `Rscript` is spawned without a shell, fixing quoting problems with unusual paths and Windows.
- The extension now runs on the workspace side in remote sessions and requires a trusted workspace.

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
