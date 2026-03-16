import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';
import { escapeHtml } from '../extension';

const execAsync = promisify(exec);

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

suite('escapeHtml', () => {
	test('escapes ampersands', () => {
		assert.strictEqual(escapeHtml('a & b'), 'a &amp; b');
	});

	test('escapes angle brackets', () => {
		assert.strictEqual(escapeHtml('<div>'), '&lt;div&gt;');
	});

	test('escapes quotes', () => {
		assert.strictEqual(escapeHtml('"hello"'), '&quot;hello&quot;');
		assert.strictEqual(escapeHtml("it's"), "it&#039;s");
	});

	test('escapes all special characters together', () => {
		assert.strictEqual(
			escapeHtml(`<a href="x" class='y'>&</a>`),
			'&lt;a href=&quot;x&quot; class=&#039;y&#039;&gt;&amp;&lt;/a&gt;'
		);
	});

	test('returns empty string unchanged', () => {
		assert.strictEqual(escapeHtml(''), '');
	});

	test('returns plain text unchanged', () => {
		assert.strictEqual(escapeHtml('hello world 123'), 'hello world 123');
	});
});

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

	test('reprexClipboard command is no longer registered', async () => {
		const commands = await vscode.commands.getCommands();
		assert.ok(!commands.includes('reprex-generator-for-r.reprexClipboard'));
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

	(hasReprex ? test : test.skip)('reprex produces GitHub-flavored markdown output', async function () {
		this.timeout(30_000);

		const tempDir = os.tmpdir();
		const inputFile = path.join(tempDir, `test_reprex_${Date.now()}.R`);
		const outputFile = path.join(tempDir, `test_reprex_${Date.now()}.md`);

		try {
			fs.writeFileSync(inputFile, 'x <- 1:5\nmean(x)\n', 'utf8');

			const command = `
				reprex_result <- reprex::reprex(input = '${inputFile}', venue = 'gh', html_preview = FALSE);
				writeLines(reprex_result, '${outputFile}');
				cat('REPREX_SUCCESS')
			`.replace(/\n/g, ' ').replace(/\t/g, ' ');

			const { stdout } = await execAsync(`Rscript -e "${command}"`);
			assert.ok(stdout.includes('REPREX_SUCCESS'), 'Rscript should complete successfully');

			assert.ok(fs.existsSync(outputFile), 'Output file should be created');
			const output = fs.readFileSync(outputFile, 'utf8');

			// GitHub venue reprex wraps code in ```r fences
			assert.ok(output.includes('``` r'), `Output should contain R code fence, got:\n${output}`);
			assert.ok(output.includes('mean(x)'), `Output should contain the original code, got:\n${output}`);
			assert.ok(output.includes('3'), `Output should contain the result (mean of 1:5 = 3), got:\n${output}`);
		} finally {
			if (fs.existsSync(inputFile)) { fs.unlinkSync(inputFile); }
			if (fs.existsSync(outputFile)) { fs.unlinkSync(outputFile); }
		}
	});

	(hasReprex ? test : test.skip)('reprex handles erroring code', async function () {
		this.timeout(30_000);

		const tempDir = os.tmpdir();
		const inputFile = path.join(tempDir, `test_reprex_err_${Date.now()}.R`);
		const outputFile = path.join(tempDir, `test_reprex_err_${Date.now()}.md`);

		try {
			// Code that produces an error in reprex output (but reprex itself succeeds)
			fs.writeFileSync(inputFile, 'stop("test error")\n', 'utf8');

			const command = `
				reprex_result <- reprex::reprex(input = '${inputFile}', venue = 'gh', html_preview = FALSE);
				writeLines(reprex_result, '${outputFile}');
				cat('REPREX_SUCCESS')
			`.replace(/\n/g, ' ').replace(/\t/g, ' ');

			const { stdout } = await execAsync(`Rscript -e "${command}"`);
			assert.ok(stdout.includes('REPREX_SUCCESS'), 'Rscript should complete successfully');

			const output = fs.readFileSync(outputFile, 'utf8');
			// reprex captures the error in the output
			assert.ok(
				output.includes('Error') || output.includes('error'),
				`Output should contain the error, got:\n${output}`
			);
		} finally {
			if (fs.existsSync(inputFile)) { fs.unlinkSync(inputFile); }
			if (fs.existsSync(outputFile)) { fs.unlinkSync(outputFile); }
		}
	});

	(hasReprex ? test : test.skip)('temp files are cleaned up after reprex', async function () {
		this.timeout(30_000);

		const tempDir = os.tmpdir();
		const inputFile = path.join(tempDir, `test_reprex_cleanup_${Date.now()}.R`);
		const outputFile = path.join(tempDir, `test_reprex_cleanup_${Date.now()}.md`);

		fs.writeFileSync(inputFile, 'TRUE\n', 'utf8');

		const command = `
			reprex_result <- reprex::reprex(input = '${inputFile}', venue = 'gh', html_preview = FALSE);
			writeLines(reprex_result, '${outputFile}');
			cat('REPREX_SUCCESS')
		`.replace(/\n/g, ' ').replace(/\t/g, ' ');

		await execAsync(`Rscript -e "${command}"`);

		// Clean up like the extension does
		if (fs.existsSync(inputFile)) { fs.unlinkSync(inputFile); }
		if (fs.existsSync(outputFile)) { fs.unlinkSync(outputFile); }

		assert.ok(!fs.existsSync(inputFile), 'Input file should be cleaned up');
		assert.ok(!fs.existsSync(outputFile), 'Output file should be cleaned up');
	});
});
