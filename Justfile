# Reprex Generator for R Extension - Common Tasks

# Extension version (should match package.json)
VERSION := "0.0.1"

# Install dependencies
install:
	pnpm install

# Compile the extension
compile:
	pnpm run compile

# Watch for changes during development
watch:
	pnpm run watch

# Package the extension for distribution
package:
	pnpm run package

# Bundle the extension into .vsix file
bundle:
	vsce package

# Install the extension locally from .vsix file
install-local: bundle
	code --install-extension reprex-generator-for-r-{{VERSION}}.vsix
	positron --install-extension reprex-generator-for-r-{{VERSION}}.vsix

# Clean old .vsix files only
clean-vsix:
	rm -f *.vsix

# Clean build artifacts (keeps node_modules)
clean:
	rm -rf dist out *.vsix

# Clean everything including dependencies
clean-all:
	rm -rf dist out node_modules *.vsix

# Lint the code
lint:
	pnpm run lint

# Run tests
test:
	pnpm run test

# Full development cycle: install deps, compile, and bundle
dev: install compile bundle

# Uninstall the extension
uninstall:
	code --uninstall-extension reprex-generator-for-r
