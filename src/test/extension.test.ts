import * as assert from 'assert';
import * as vscode from 'vscode';
import { execSync } from 'child_process';
import { renderReprex, lastStatusLine, failureMessage, isVenue } from '../reprex';

function rscriptAvailable(): boolean {
	try {
		execSync('Rscript --version', { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

function reprexInstalled(): boolean {
	try {
		execSync('Rscript -e "library(reprex)"', { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

const hasR = rscriptAvailable();
const hasReprex = hasR && reprexInstalled();

suite('Extension Lifecycle', () => {
	test('extension is present', () => {
		assert.ok(vscode.extensions.getExtension('jemus42.reprex-generator-for-r'));
	});

	test('extension activates', async () => {
		const ext = vscode.extensions.getExtension('jemus42.reprex-generator-for-r');
		assert.ok(ext, 'Extension should be found');
		if (!ext!.isActive) {
			await ext!.activate();
		}
		assert.ok(ext!.isActive, 'Extension should be active');
	});
});

suite('Command Registration', () => {
	suiteSetup(async () => {
		// Ensure the extension is activated before checking commands
		const ext = vscode.extensions.getExtension('jemus42.reprex-generator-for-r');
		if (ext && !ext.isActive) {
			await ext.activate();
		}
	});

	test('all reprex commands are registered', async () => {
		const commands = await vscode.commands.getCommands();

		assert.ok(commands.includes('reprex-generator-for-r.reprexAddin'));
		assert.ok(commands.includes('reprex-generator-for-r.reprexFile'));
		assert.ok(commands.includes('reprex-generator-for-r.reprexSelection'));
	});

	test('venue commands are registered', async () => {
		const commands = await vscode.commands.getCommands();

		assert.ok(commands.includes('reprex-generator-for-r.reprexFileVenue'));
		assert.ok(commands.includes('reprex-generator-for-r.reprexSelectionVenue'));
	});
});

suite('Error Handling', () => {
	test('reprexFile handles empty file gracefully', async () => {
		const doc = await vscode.workspace.openTextDocument({
			content: '',
			language: 'r'
		});
		await vscode.window.showTextDocument(doc);

		// Should not throw
		await vscode.commands.executeCommand('reprex-generator-for-r.reprexFile');
	});

	test('reprexSelection handles empty selection gracefully', async () => {
		const doc = await vscode.workspace.openTextDocument({
			content: 'x <- 1',
			language: 'r'
		});
		const editor = await vscode.window.showTextDocument(doc);
		// Collapse selection to a cursor (empty selection)
		editor.selection = new vscode.Selection(0, 0, 0, 0);

		// Should not throw
		await vscode.commands.executeCommand('reprex-generator-for-r.reprexSelection');
	});
});

suite('R Integration', () => {
	(hasR ? test : test.skip)('Rscript is available', () => {
		const result = execSync('Rscript -e "cat(R.version.string)"', { encoding: 'utf8' });
		assert.ok(result.includes('R version'), `Expected R version string, got: ${result}`);
	});

	(hasReprex ? test : test.skip)('reprex package is installed', () => {
		const result = execSync(
			'Rscript -e "cat(as.character(packageVersion(\'reprex\')))"',
			{ encoding: 'utf8' }
		);
		assert.ok(result.match(/^\d+\.\d+\.\d+/), `Expected version string, got: ${result}`);
	});

	(hasReprex ? test : test.skip)('renders GitHub-flavored markdown', async function () {
		this.timeout(30_000);
		const output = await renderReprex('x <- 1:5\nmean(x)\n', { venue: 'gh' });
		assert.ok(output.includes('``` r'), `Expected R code fence, got:\n${output}`);
		assert.ok(output.includes('mean(x)'));
		assert.ok(output.includes('3'));
	});

	(hasReprex ? test : test.skip)('renders slack venue', async function () {
		this.timeout(30_000);
		const output = await renderReprex('1 + 1\n', { venue: 'slack' });
		assert.ok(output.includes('1 + 1'));
	});

	(hasReprex ? test : test.skip)('captures errors in the code under test', async function () {
		this.timeout(30_000);
		const output = await renderReprex('stop("test error")\n', { venue: 'gh' });
		assert.ok(/error/i.test(output), `Expected error in output, got:\n${output}`);
	});

	(hasReprex ? test : test.skip)('rejects when cancelled', async function () {
		this.timeout(30_000);
		const abort = new AbortController();
		const pending = renderReprex('Sys.sleep(20)\n', { venue: 'gh', signal: abort.signal });
		setTimeout(() => abort.abort(), 1500);
		await assert.rejects(pending, { name: 'AbortError' });
	});

	(hasReprex ? test : test.skip)('uses wd for relative paths', async function () {
		this.timeout(30_000);
		const output = await renderReprex('file.exists("package.json")\n', { venue: 'r', wd: process.cwd() });
		assert.ok(output.includes('#> [1] TRUE'), `Got:\n${output}`);
	});

	(hasR ? test : test.skip)('rejects with a message when Rscript is missing', async () => {
		await assert.rejects(renderReprex('1', { venue: 'gh', rscript: 'definitely-not-rscript' }), /ENOENT/);
	});
});

suite('Helpers', () => {
	test('lastStatusLine strips ANSI and bullets', () => {
		assert.strictEqual(lastStatusLine('\u001b[36mℹ\u001b[39m Rendering reprex...\n'), 'Rendering reprex...');
	});

	test('lastStatusLine returns undefined for blank input', () => {
		assert.strictEqual(lastStatusLine('\n  \n'), undefined);
	});

	test('lastStatusLine skips paths and clipr noise', () => {
		assert.strictEqual(lastStatusLine("Rendering reprex...\n'/tmp/x.md'\nCLIPR_ALLOW has not been set\n"), 'Rendering reprex...');
	});

	test('failureMessage drops Execution halted', () => {
		assert.strictEqual(failureMessage('Error: bad venue\nExecution halted\n', 1), 'Error: bad venue');
	});

	test('isVenue accepts known and rejects unknown venues', () => {
		assert.ok(isVenue('slack'));
		assert.ok(!isVenue("gh'; rm -rf /"));
	});
});
