import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

const execAsync = promisify(exec);

let reprexPanel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
	const reprexAddin = vscode.commands.registerCommand('reprex-generator-for-r.reprexAddin', async () => {
		vscode.window.showInformationMessage('Starting reprex addin...');

		try {
			// Try Positron's workbench command to execute R code in console
			await vscode.commands.executeCommand('workbench.action.executeCode.console', {
				langId: 'r',
				code: 'reprex::reprex_addin()',
				focus: true
			});
		} catch {
			try {
				// Fallback: try R extension command if available
				await vscode.commands.executeCommand('r.runSelection', 'reprex::reprex_addin()');
			} catch {
				// Final fallback: copy to clipboard and ask user to run manually
				await vscode.env.clipboard.writeText('reprex::reprex_addin()');
				const selection = await vscode.window.showInformationMessage(
					'Could not send command to R console automatically. The command has been copied to clipboard.',
					'Paste in R Console',
					'Use Alternative'
				);

				if (selection === 'Use Alternative') {
					await vscode.commands.executeCommand('reprex-generator-for-r.reprexSelection');
				}
			}
		}
	});

	const reprexFile = vscode.commands.registerCommand('reprex-generator-for-r.reprexFile', async () => {
		const activeEditor = vscode.window.activeTextEditor;
		if (!activeEditor) {
			vscode.window.showErrorMessage('No active file to reprex');
			return;
		}

		const text = activeEditor.document.getText();

		if (!text.trim()) {
			vscode.window.showErrorMessage('Active file is empty');
			return;
		}

		await runReprexOnText(text);
	});

	const reprexSelection = vscode.commands.registerCommand('reprex-generator-for-r.reprexSelection', async () => {
		const activeEditor = vscode.window.activeTextEditor;
		if (!activeEditor) {
			vscode.window.showErrorMessage('No active editor');
			return;
		}

		const selectedText = activeEditor.document.getText(activeEditor.selection);

		if (!selectedText.trim()) {
			vscode.window.showErrorMessage('No text selected');
			return;
		}

		await runReprexOnText(selectedText);
	});

	context.subscriptions.push(reprexAddin, reprexFile, reprexSelection);
}

async function runReprexOnText(text: string) {
	const tempDir = os.tmpdir();
	const tempInputFile = path.join(tempDir, `reprex_input_${Date.now()}.R`);
	const tempOutputFile = path.join(tempDir, `reprex_output_${Date.now()}.md`);

	try {
		await fs.writeFile(tempInputFile, text, 'utf8');

		// Run reprex with the temp file as input
		// Try to copy to clipboard via clipr, but it may fail in non-interactive mode
		const venue = vscode.workspace.getConfiguration('reprex').get<string>('venue', 'gh');
		const escapedInput = tempInputFile.replace(/'/g, "\\'");
		const escapedOutput = tempOutputFile.replace(/'/g, "\\'");
		const command = `
			reprex_result <- reprex::reprex(input = '${escapedInput}', venue = '${venue}', html_preview = FALSE);
			tryCatch({
				clipr::write_clip(reprex_result, allow_non_interactive = TRUE)
			}, error = function(e) {
				message('Clipboard copy skipped: ', e$message)
			});
			writeLines(reprex_result, '${escapedOutput}');
			cat('REPREX_SUCCESS')
		`.replace(/\n/g, ' ').replace(/\t/g, ' ');

		vscode.window.showInformationMessage('Running reprex...');

		const { stdout, stderr } = await execAsync(`CLIPR_ALLOW=TRUE Rscript -e "${command}"`);

		if (stdout.includes('REPREX_SUCCESS')) {
			let reprexOutput = '';
			try {
				reprexOutput = await fs.readFile(tempOutputFile, 'utf8');
			} catch {
				// Output file may not exist if reprex produced no output
			}

			showReprexOutput(reprexOutput);

			try {
				await vscode.env.clipboard.writeText(reprexOutput);
				vscode.window.showInformationMessage('Reprex completed! Output shown in viewer and copied to clipboard.');
			} catch {
				vscode.window.showInformationMessage('Reprex completed! Output shown in viewer. Use copy button to copy to clipboard.');
			}
		} else if (stderr && !stderr.includes('Rendering reprex')) {
			vscode.window.showErrorMessage(`Reprex Error: ${stderr}`);
		}
	} catch (error) {
		vscode.window.showErrorMessage(`Failed to run reprex: ${error}`);
	} finally {
		// Clean up temp files
		await fs.unlink(tempInputFile).catch(() => {});
		await fs.unlink(tempOutputFile).catch(() => {});
	}
}

function showReprexOutput(reprexOutput: string) {
	if (reprexPanel) {
		reprexPanel.reveal(vscode.ViewColumn.Two);
	} else {
		reprexPanel = vscode.window.createWebviewPanel(
			'reprexOutput',
			'Reprex Output',
			vscode.ViewColumn.Two,
			{ enableScripts: true }
		);

		reprexPanel.onDidDispose(() => {
			reprexPanel = undefined;
		});
	}

	reprexPanel.webview.html = `<!DOCTYPE html>
	<html lang="en">
	<head>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<title>Reprex Output</title>
		<style>
			body {
				font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
				padding: 20px;
				line-height: 1.6;
				color: var(--vscode-editor-foreground);
				background-color: var(--vscode-editor-background);
			}
			h2 {
				color: var(--vscode-editor-foreground);
				border-bottom: 2px solid var(--vscode-panel-border);
				padding-bottom: 10px;
				margin-bottom: 20px;
			}
			pre {
				background-color: var(--vscode-textBlockQuote-background);
				border: 1px solid var(--vscode-panel-border);
				border-radius: 4px;
				padding: 15px;
				overflow-x: auto;
				font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace;
				font-size: 13px;
			}
			code {
				background-color: var(--vscode-textBlockQuote-background);
				padding: 2px 4px;
				border-radius: 3px;
				font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace;
			}
			.button-container {
				margin: 20px 0;
			}
			button {
				background-color: var(--vscode-button-background);
				color: var(--vscode-button-foreground);
				border: none;
				padding: 8px 16px;
				border-radius: 4px;
				cursor: pointer;
				font-size: 14px;
				margin-right: 10px;
			}
			button:hover {
				background-color: var(--vscode-button-hoverBackground);
			}
			.success-message {
				color: var(--vscode-terminal-ansiGreen);
				margin-top: 10px;
				display: none;
			}
		</style>
	</head>
	<body>
		<h2>Reprex Output</h2>

		<div class="button-container">
			<button onclick="copyToClipboard()">Copy to Clipboard</button>
			<span class="success-message" id="copyMessage">Copied!</span>
		</div>

		<div>
			<h3>Rendered Reprex (Markdown)</h3>
			<pre id="reprexOutput">${escapeHtml(reprexOutput)}</pre>
		</div>

		<script>
			const vscode = acquireVsCodeApi();

			function copyToClipboard() {
				const text = document.getElementById('reprexOutput').textContent;
				navigator.clipboard.writeText(text).then(() => {
					showCopyMessage();
				});
			}

			function showCopyMessage() {
				const message = document.getElementById('copyMessage');
				message.style.display = 'inline';
				setTimeout(() => {
					message.style.display = 'none';
				}, 2000);
			}
		</script>
	</body>
	</html>`;
}

export function escapeHtml(text: string): string {
	const map: Record<string, string> = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#039;'
	};
	return text.replace(/[&<>"']/g, m => map[m]);
}

export function deactivate() {
	reprexPanel?.dispose();
}
