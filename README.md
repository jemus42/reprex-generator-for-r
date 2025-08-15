# Positron Reprex Generator for R

A Positron (/ VS Code) extension that integrates the [`{reprex}`](https://reprex.tidyverse.org/) package to create reproducible examples directly from your editor.

## Features

The extension provides four commands accessible via the Command Palette:

- **Reprex: Start Addin** - Launches the reprex addin interface by running `reprex::reprex_addin()` in the active console
- **Reprex: Active File** - Creates a reprex from the entire active file and previews it
- **Reprex: Selected Code** - Creates a reprex from selected text and previews it
- **Reprex: From Clipboard** - Creates a reprex from the clipboard contents

Each command will try to put the rendered reprex in the clipboard via [`{clipr}`](https://matthewlincoln.net/clipr/).

## Requirements

- R must be installed and available in `$PATH`
- The `{reprex}` package must be installed (`install.packages("reprex")` / `pak::pak("reprex")`)

## Usage

1. Open the Command Palette (`Cmd+Shift+P` on macOS or `Ctrl+Shift+P` on Windows/Linux)
2. Type "Reprex" to see available commands
3. Select the command you want to run:
   - For selected code: First select the R code you want to create a reprex from
   - For active file: Make sure an R file is open and active
   - For the addin: This will open the reprex addin interface

The reprex output will be copied to your clipboard automatically.

## Installation

### From VSIX file

1. Download the `.vsix` file from the releases
2. For Positron, run `positron --install-extension reprex-generator-for-r-XYZ.vsix`
   1. (For VSCode, use `code` rather than `positron`)

### For Development

1. Clone this repository
2. Run `just install` to install stuff via `pnpm`
3. Run `just install-extension` to build and install locally for both Positron and VSCode

## Known Issues

- Positron is prioritized, so you might run into wonkyness on VSCode
- I'm not sure how reliable the active console detection is to paste the `reprex_addin()` command and it blocks a console
