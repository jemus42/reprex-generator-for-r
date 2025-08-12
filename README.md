# Reprex Generator for R

A VS Code/Positron extension that integrates the R `reprex` package to create reproducible examples directly from your editor.

## Features

This extension provides three commands accessible via the Command Palette:

- **Reprex: Start Addin** - Launches the reprex addin interface (`reprex::reprex_addin()`)
- **Reprex: Active File** - Creates a reproducible example from the entire active file
- **Reprex: Selected Code** - Creates a reproducible example from selected text

## Requirements

- R must be installed and available in your system PATH
- The `reprex` R package must be installed (`install.packages("reprex")`)

## Usage

1. Open the Command Palette (`Cmd+Shift+P` on macOS or `Ctrl+Shift+P` on Windows/Linux)
2. Type "Reprex" to see available commands
3. Select the command you want to run:
   - For selected code: First select the R code you want to create a reprex from
   - For active file: Make sure an R file is open and active
   - For the addin: This will open the reprex addin interface

The reprex output will be copied to your clipboard automatically (default reprex behavior).

## Installation

### From VSIX file

1. Download the `.vsix` file from the releases
2. Run `code --install-extension reprex-generator-for-r-0.0.1.vsix`

### For Development

1. Clone this repository
2. Run `pnpm install` to install dependencies
3. Run `just install-local` to build and install locally

## Known Issues

- The extension requires R to be available in the system PATH
- Error messages from R are displayed in VS Code notifications

## Release Notes

### 0.0.1

Initial release with basic reprex functionality:
- Start reprex addin
- Create reprex from active file
- Create reprex from selected code