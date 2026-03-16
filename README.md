# Reprex Generator for R

A [Positron](https://positron.posit.co/) / VS Code extension that brings the
[`{reprex}`](https://reprex.tidyverse.org/) package to your editor. If you're an
R user who relies on `reprex::reprex()` or the RStudio addin to create
reproducible examples for GitHub issues, Stack Overflow, or Slack, this extension
lets you do the same thing without leaving Positron or VS Code.

## Features

All commands are available via the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
under the **Reprex** category:

| Command | Description |
|---------|-------------|
| **Reprex: Start Addin** | Launch the interactive `reprex_addin()` in your R console |
| **Reprex: Active File** | Create a reprex from the entire active file |
| **Reprex: Selected Code** | Create a reprex from the current selection |

The rendered reprex output is:

- Displayed in a side panel with a copy button
- Automatically copied to your clipboard (when possible)

## Requirements

- **R** must be installed and `Rscript` must be available on your `PATH`
- The **[reprex](https://reprex.tidyverse.org/)** package must be installed:
  ```r
  install.packages("reprex")
  # or
  pak::pak("reprex")
  ```

## Installation

### From Open VSX / Extension Marketplace

Search for "Reprex Generator" in the extensions panel, or install from the
command line:

```sh
# Positron
positron --install-extension jemus42.reprex-generator-for-r

# VS Code
code --install-extension jemus42.reprex-generator-for-r
```

### From .vsix file

Download the `.vsix` from the
[releases](https://codeberg.org/lksbrk/reprex-generator-for-r/releases) and
install it:

```sh
positron --install-extension reprex-generator-for-r-0.1.0.vsix
```

## Known Issues

- The extension prioritizes Positron's console API. On plain VS Code it falls
  back to the [vscode-R](https://github.com/REditorSupport/vscode-R) extension
  or clipboard-based workarounds.
- The "Start Addin" command runs `reprex_addin()` which blocks the R console
  until the addin is closed.

## Development

Prerequisites: [Node.js](https://nodejs.org/), [pnpm](https://pnpm.io/),
[just](https://github.com/casey/just).

```sh
# Install dependencies
just install

# Compile (webpack)
just compile

# Watch mode for development
just watch

# Bundle into .vsix and install locally (Positron + VS Code)
just install-extension

# Lint
just lint

# Run tests
just test
```

See the `Justfile` for all available tasks.

## License

[MIT](LICENSE.md)
