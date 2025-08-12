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
		// Launch the original reprex addin
		// Note: This will open in external browser as Shiny apps cannot run in VS Code webviews
		vscode.window.showInformationMessage('Starting reprex addin in browser...');
		await runRCommand('reprex::reprex_addin()');
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
		const { stdout, stderr } = await execAsync(`Rscript -e "${command}"`);
		
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

function showReprexAddinInterface() {
	// Create or reveal the addin panel
	if (addinPanel) {
		addinPanel.reveal(vscode.ViewColumn.Two);
	} else {
		addinPanel = vscode.window.createWebviewPanel(
			'reprexAddin',
			'Reprex Addin',
			vscode.ViewColumn.Two,
			{
				enableScripts: true,
				retainContextWhenHidden: true
			}
		);
		
		// Reset when the panel is closed
		addinPanel.onDidDispose(() => {
			addinPanel = undefined;
		});

		// Handle messages from the webview
		addinPanel.webview.onDidReceiveMessage(async (message) => {
			switch (message.command) {
				case 'runReprex':
					const { source, text, venue } = message;
					let codeToReprex = '';
					
					if (source === 'clipboard') {
						try {
							codeToReprex = await vscode.env.clipboard.readText();
						} catch (error) {
							vscode.window.showErrorMessage('Failed to read from clipboard');
							return;
						}
					} else if (source === 'selection') {
						const activeEditor = vscode.window.activeTextEditor;
						if (activeEditor && !activeEditor.selection.isEmpty) {
							codeToReprex = activeEditor.document.getText(activeEditor.selection);
						} else {
							vscode.window.showErrorMessage('No text selected');
							return;
						}
					} else if (source === 'file') {
						const activeEditor = vscode.window.activeTextEditor;
						if (activeEditor) {
							codeToReprex = activeEditor.document.getText();
						} else {
							vscode.window.showErrorMessage('No active file');
							return;
						}
					} else if (source === 'input') {
						codeToReprex = text;
					}
					
					if (codeToReprex.trim()) {
						await runReprexOnTextWithVenue(codeToReprex, venue);
					} else {
						vscode.window.showErrorMessage('No R code to reprex');
					}
					break;
			}
		});
	}
	
	// Create HTML content for the addin interface
	const html = `<!DOCTYPE html>
	<html lang="en">
	<head>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<title>Reprex Addin</title>
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
			.form-group {
				margin-bottom: 20px;
			}
			label {
				display: block;
				margin-bottom: 5px;
				font-weight: bold;
				color: var(--vscode-editor-foreground);
			}
			input, select, textarea {
				width: 100%;
				padding: 8px;
				border: 1px solid var(--vscode-panel-border);
				border-radius: 4px;
				background-color: var(--vscode-input-background);
				color: var(--vscode-input-foreground);
				font-family: inherit;
			}
			textarea {
				height: 100px;
				resize: vertical;
				font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace;
			}
			button {
				background-color: var(--vscode-button-background);
				color: var(--vscode-button-foreground);
				border: none;
				padding: 10px 20px;
				border-radius: 4px;
				cursor: pointer;
				font-size: 14px;
				margin-right: 10px;
			}
			button:hover {
				background-color: var(--vscode-button-hoverBackground);
			}
			.radio-group {
				display: flex;
				flex-direction: column;
				gap: 8px;
			}
			.radio-item {
				display: flex;
				align-items: center;
				gap: 8px;
			}
			input[type="radio"] {
				width: auto;
			}
			.description {
				font-size: 12px;
				color: var(--vscode-descriptionForeground);
				margin-top: 5px;
			}
		</style>
	</head>
	<body>
		<h2>Reprex Addin</h2>
		
		<div class="form-group">
			<label>Source of reprex code:</label>
			<div class="radio-group">
				<div class="radio-item">
					<input type="radio" id="clipboard" name="source" value="clipboard" checked>
					<label for="clipboard">Clipboard</label>
				</div>
				<div class="radio-item">
					<input type="radio" id="selection" name="source" value="selection">
					<label for="selection">Current selection</label>
				</div>
				<div class="radio-item">
					<input type="radio" id="file" name="source" value="file">
					<label for="file">Active file</label>
				</div>
				<div class="radio-item">
					<input type="radio" id="input" name="source" value="input">
					<label for="input">Text input below</label>
				</div>
			</div>
		</div>
		
		<div class="form-group">
			<label for="codeInput">R code (only used if "Text input below" is selected):</label>
			<textarea id="codeInput" placeholder="Enter your R code here..."></textarea>
		</div>
		
		<div class="form-group">
			<label for="venue">Output venue:</label>
			<select id="venue">
				<option value="gh">GitHub (gh) - Default</option>
				<option value="r">R script (r)</option>
				<option value="slack">Slack (slack)</option>
				<option value="so">Stack Overflow (so)</option>
				<option value="html">HTML fragment (html)</option>
				<option value="rtf">Rich Text Format (rtf)</option>
			</select>
			<div class="description">Choose the format for your reprex output</div>
		</div>
		
		<button onclick="runReprex()">Render reprex</button>
		
		<script>
			const vscode = acquireVsCodeApi();
			
			function runReprex() {
				const source = document.querySelector('input[name="source"]:checked').value;
				const text = document.getElementById('codeInput').value;
				const venue = document.getElementById('venue').value;
				
				vscode.postMessage({
					command: 'runReprex',
					source: source,
					text: text,
					venue: venue
				});
			}
		</script>
	</body>
	</html>`;
	
	addinPanel.webview.html = html;
}

async function runReprexOnTextWithVenue(text: string, venue: string = 'gh') {
	// Similar to runReprexOnText but with venue parameter
	const tempDir = os.tmpdir();
	const tempInputFile = path.join(tempDir, `reprex_input_${Date.now()}.R`);
	const tempOutputFile = path.join(tempDir, `reprex_output_${Date.now()}.md`);
	
	try {
		fs.writeFileSync(tempInputFile, text, 'utf8');
		
		const command = `
			output_file <- '${tempOutputFile}';
			reprex_result <- reprex::reprex(input = '${tempInputFile}', venue = '${venue}', html_preview = FALSE);
			tryCatch({
				clipr::write_clip(reprex_result, allow_non_interactive = TRUE)
			}, error = function(e) {
				message('Clipboard copy skipped: ', e$message)
			});
			writeLines(reprex_result, output_file);
			cat('REPREX_SUCCESS')
		`.replace(/\n/g, ' ').replace(/\t/g, ' ');
		
		vscode.window.showInformationMessage('Running reprex...');
		
		const { stdout, stderr } = await execAsync(`CLIPR_ALLOW=TRUE Rscript -e "${command}"`);
		
		if (stdout.includes('REPREX_SUCCESS')) {
			let reprexOutput = '';
			if (fs.existsSync(tempOutputFile)) {
				reprexOutput = fs.readFileSync(tempOutputFile, 'utf8');
			}
			
			showReprexOutput(reprexOutput, text);
			
			try {
				await vscode.env.clipboard.writeText(reprexOutput);
				vscode.window.showInformationMessage('Reprex completed! Output shown in viewer and copied to clipboard.');
			} catch (clipboardError) {
				vscode.window.showInformationMessage('Reprex completed! Output shown in viewer. Use copy button to copy to clipboard.');
			}
		} else if (stderr && !stderr.includes('Rendering reprex')) {
			vscode.window.showErrorMessage(`Reprex Error: ${stderr}`);
		}
		
		if (fs.existsSync(tempInputFile)) {
			fs.unlinkSync(tempInputFile);
		}
		if (fs.existsSync(tempOutputFile)) {
			fs.unlinkSync(tempOutputFile);
		}
		
	} catch (error) {
		if (fs.existsSync(tempInputFile)) {
			fs.unlinkSync(tempInputFile);
		}
		if (fs.existsSync(tempOutputFile)) {
			fs.unlinkSync(tempOutputFile);
		}
		vscode.window.showErrorMessage(`Failed to run reprex: ${error}`);
	}
}

export function deactivate() {}
