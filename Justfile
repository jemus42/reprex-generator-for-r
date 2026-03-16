set dotenv-load

# Reprex Generator for R Extension - Common Tasks

# Extension version extracted from package.json
VERSION := `jq -r < package.json .version`

# Base URL for resolving relative links in README (vsce only auto-detects GitHub/GitLab)
REPO_URL := "https://codeberg.org/lksbrk/reprex-generator-for-r/raw/branch/main/"

# Install dependencies
install:
	pnpm install

# Compile the extension
compile:
	pnpm run compile

# Watch for changes during development
watch:
	pnpm run watch

# Bundle the extension into .vsix file
bundle:
	vsce package --baseContentUrl {{REPO_URL}} --baseImagesUrl {{REPO_URL}}

# Install the extension locally from .vsix file
install-extension: bundle
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

# Uninstall the extension
uninstall:
	code --uninstall-extension reprex-generator-for-r
	positron --uninstall-extension reprex-generator-for-r

# Publish to OpenVSX (requires OVSX_TOKEN environment variable)
publish-ovsx: bundle
	ovsx publish reprex-generator-for-r-{{VERSION}}.vsix -p $OVSX_TOKEN

# Publish to VS Code Marketplace (requires vsce login)
publish-vscode: bundle
	vsce publish

# Dry run to check what would be published
publish-check:
	vsce ls
