import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const execAsync = promisify(exec);

let reprexPanel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
	console.log('Reprex Generator for R extension is now active!');

	const reprexAddin = vscode.commands.registerCommand('reprex-generator-for-r.reprexAddin', async () => {
		vscode.window.showInformationMessage('Starting reprex addin...');
		
		try {
			// Try Positron's workbench command to execute R code in console
			await vscode.commands.executeCommand('workbench.action.executeCode.console', {
				langId: 'r',
				code: 'reprex::reprex_addin()',
				focus: true
			});
		} catch (positronError) {
			try {
				// Fallback: try R extension command if available
				await vscode.commands.executeCommand('r.runSelection', 'reprex::reprex_addin()');
			} catch (rExtensionError) {
				// Final fallback: copy to clipboard and ask user to run manually
				await vscode.env.clipboard.writeText('reprex::reprex_addin()');
				const selection = await vscode.window.showInformationMessage(
					'Could not send command to R console automatically. The command has been copied to clipboard.',
					'Paste in R Console',
					'Use Alternative'
				);
				
				if (selection === 'Use Alternative') {
					const altSelection = await vscode.window.showQuickPick([
						'Use Selected Code',
						'Use Clipboard'
					], { placeHolder: 'Choose alternative reprex method' });
					
					if (altSelection === 'Use Selected Code') {
						await vscode.commands.executeCommand('reprex-generator-for-r.reprexSelection');
					} else if (altSelection === 'Use Clipboard') {
						await vscode.commands.executeCommand('reprex-generator-for-r.reprexClipboard');
					}
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

		const document = activeEditor.document;
		const text = document.getText();
		
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

		const selection = activeEditor.selection;
		const selectedText = activeEditor.document.getText(selection);
		
		if (!selectedText.trim()) {
			vscode.window.showErrorMessage('No text selected');
			return;
		}

		await runReprexOnText(selectedText);
	});

	// Alternative: reprex from clipboard (useful if selection method has issues)
	const reprexClipboard = vscode.commands.registerCommand('reprex-generator-for-r.reprexClipboard', async () => {
		try {
			// Copy current selection to clipboard first
			await vscode.commands.executeCommand('editor.action.clipboardCopyAction');
			
			// Small delay to ensure clipboard is updated
			await new Promise(resolve => setTimeout(resolve, 100));
			
			// Run reprex on clipboard content
			const command = `reprex::reprex(venue = 'gh', html_preview = FALSE)`;
			vscode.window.showInformationMessage('Running reprex on clipboard content...');
			
			const { stdout, stderr } = await execAsync(`Rscript -e "${command}"`);
			
			if (stderr && !stderr.includes('Rendering reprex')) {
				vscode.window.showErrorMessage(`Reprex Error: ${stderr}`);
			} else {
				vscode.window.showInformationMessage('Reprex completed! Output copied to clipboard.');
			}
			
			if (stdout) {
				console.log('Reprex output:', stdout);
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to run reprex: ${error}`);
		}
	});

	context.subscriptions.push(reprexAddin, reprexFile, reprexSelection, reprexClipboard);
}

async function runRCommand(command: string) {
	try {
		vscode.window.showInformationMessage(`Running: ${command}`);
		// Set CLIPR_ALLOW to allow clipboard operations in non-interactive mode
		const { stdout, stderr } = await execAsync(`CLIPR_ALLOW=TRUE Rscript -e "${command}"`);
		
		if (stderr) {
			vscode.window.showErrorMessage(`R Error: ${stderr}`);
		}
		if (stdout) {
			console.log(stdout);
		}
	} catch (error) {
		vscode.window.showErrorMessage(`Failed to run R command: ${error}`);
	}
}

async function runReprexOnText(text: string) {
	// Create temporary files for input and output
	const tempDir = os.tmpdir();
	const tempInputFile = path.join(tempDir, `reprex_input_${Date.now()}.R`);
	const tempOutputFile = path.join(tempDir, `reprex_output_${Date.now()}.md`);
	
	try {
		// Write the selected text to a temporary file
		fs.writeFileSync(tempInputFile, text, 'utf8');
		
		// Run reprex with the temp file as input
		// We try to copy to clipboard if possible, but it may fail in non-interactive mode
		const command = `
			output_file <- '${tempOutputFile}';
			reprex_result <- reprex::reprex(input = '${tempInputFile}', venue = 'gh', html_preview = FALSE);
			tryCatch({
				clipr::write_clip(reprex_result, allow_non_interactive = TRUE)
			}, error = function(e) {
				message('Clipboard copy skipped: ', e$message)
			});
			writeLines(reprex_result, output_file);
			cat('REPREX_SUCCESS')
		`.replace(/\n/g, ' ').replace(/\t/g, ' ');
		
		vscode.window.showInformationMessage('Running reprex...');
		
		// Execute the R command with environment variable to allow clipboard access
		const { stdout, stderr } = await execAsync(`CLIPR_ALLOW=TRUE Rscript -e "${command}"`);
		
		// Check if reprex was successful
		if (stdout.includes('REPREX_SUCCESS')) {
			// Read the output file
			let reprexOutput = '';
			if (fs.existsSync(tempOutputFile)) {
				reprexOutput = fs.readFileSync(tempOutputFile, 'utf8');
			}
			
			// Show the output in a webview
			showReprexOutput(reprexOutput, text);
			
			// Try to copy to clipboard using VS Code API as fallback
			try {
				await vscode.env.clipboard.writeText(reprexOutput);
				vscode.window.showInformationMessage('Reprex completed! Output shown in viewer and copied to clipboard.');
			} catch (clipboardError) {
				vscode.window.showInformationMessage('Reprex completed! Output shown in viewer. Use copy button to copy to clipboard.');
			}
		} else if (stderr && !stderr.includes('Rendering reprex')) {
			vscode.window.showErrorMessage(`Reprex Error: ${stderr}`);
		}
		
		// Clean up temp files
		if (fs.existsSync(tempInputFile)) {
			fs.unlinkSync(tempInputFile);
		}
		if (fs.existsSync(tempOutputFile)) {
			fs.unlinkSync(tempOutputFile);
		}
		
		if (stdout && !stdout.includes('REPREX_SUCCESS')) {
			console.log('Reprex output:', stdout);
		}
	} catch (error) {
		// Clean up temp files on error
		if (fs.existsSync(tempInputFile)) {
			fs.unlinkSync(tempInputFile);
		}
		if (fs.existsSync(tempOutputFile)) {
			fs.unlinkSync(tempOutputFile);
		}
		vscode.window.showErrorMessage(`Failed to run reprex: ${error}`);
	}
}

function showReprexOutput(reprexOutput: string, originalCode: string) {
	// Create or reveal the webview panel
	if (reprexPanel) {
		reprexPanel.reveal(vscode.ViewColumn.Two);
	} else {
		reprexPanel = vscode.window.createWebviewPanel(
			'reprexOutput',
			'Reprex Output',
			vscode.ViewColumn.Two,
			{
				enableScripts: true,
				retainContextWhenHidden: true
			}
		);
		
		// Reset when the panel is closed
		reprexPanel.onDidDispose(() => {
			reprexPanel = undefined;
		});
	}
	
	// Create HTML content with the reprex output
	const html = `<!DOCTYPE html>
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
			.section {
				margin-bottom: 30px;
			}
		</style>
	</head>
	<body>
		<h2>Reprex Output</h2>
		
		<div class="button-container">
			<button onclick="copyToClipboard()">Copy to Clipboard</button>
			<button onclick="copyOriginal()">Copy Original Code</button>
			<span class="success-message" id="copyMessage">Copied!</span>
		</div>
		
		<div class="section">
			<h3>Rendered Reprex (Markdown)</h3>
			<pre id="reprexOutput">${escapeHtml(reprexOutput)}</pre>
		</div>
		
		<div class="section">
			<h3>Original Code</h3>
			<pre id="originalCode">${escapeHtml(originalCode)}</pre>
		</div>
		
		<script>
			const vscode = acquireVsCodeApi();
			
			function copyToClipboard() {
				const text = document.getElementById('reprexOutput').textContent;
				navigator.clipboard.writeText(text).then(() => {
					showCopyMessage();
				});
			}
			
			function copyOriginal() {
				const text = document.getElementById('originalCode').textContent;
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
	
	reprexPanel.webview.html = html;
}

function escapeHtml(text: string): string {
	const map: { [key: string]: string } = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#039;'
	};
	return text.replace(/[&<>"']/g, m => map[m]);
}


export function deactivate() {}
