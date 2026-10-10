# Reprex Generator for R

[![Open VSX version](https://img.shields.io/open-vsx/v/jemus42/reprex-generator-for-r)](https://open-vsx.org/extension/jemus42/reprex-generator-for-r)
[![Open VSX downloads](https://img.shields.io/open-vsx/dt/jemus42/reprex-generator-for-r)](https://open-vsx.org/extension/jemus42/reprex-generator-for-r)
[![License: MIT](https://img.shields.io/github/license/jemus42/reprex-generator-for-r)](LICENSE.md)

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
| **Reprex: Active File (Choose Venue)...** | Like above, but pick the venue (GitHub, Slack, ...) for this run |
| **Reprex: Selected Code (Choose Venue)...** | Like above, but pick the venue (GitHub, Slack, ...) for this run |

The venue used by the plain commands is set via `reprex.venue`.

The rendered reprex output is:

- Opened in an editor beside your code
- Automatically copied to your clipboard (when possible)

## Requirements

- **R** must be installed and `Rscript` must be on your `PATH` (or set `reprex.rscriptPath`)
- The **[reprex](https://reprex.tidyverse.org/)** package must be installed:
  ```r
  install.packages("reprex")
  # or
  pak::pak("reprex")
  ```

## Installation

Install from [Open VSX](https://open-vsx.org/extension/jemus42/reprex-generator-for-r)
by searching for "Reprex Generator" in the extensions panel, or from the command
line:

```sh
# Positron
positron --install-extension jemus42.reprex-generator-for-r

# VS Code
code --install-extension jemus42.reprex-generator-for-r
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

# Compile (esbuild)
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
