import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const execAsync = promisify(exec);

export function activate(context: vscode.ExtensionContext) {
	console.log('Reprex Generator for R extension is now active!');

	const reprexAddin = vscode.commands.registerCommand('reprex-generator-for-r.reprexAddin', async () => {
		// Note: The addin will open in default browser, not integrated
		// This is a limitation of how R Shiny apps work
		vscode.window.showInformationMessage('Starting reprex addin...');
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
	// Create a temporary file to store the R code
	const tempDir = os.tmpdir();
	const tempFile = path.join(tempDir, `reprex_input_${Date.now()}.R`);
	
	try {
		// Write the selected text to a temporary file
		fs.writeFileSync(tempFile, text, 'utf8');
		
		// Run reprex with the temp file as input
		// Using venue = "gh" for GitHub-flavored markdown (most common)
		// html_preview = FALSE to avoid opening browser
		const command = `reprex::reprex(input = '${tempFile}', venue = 'gh', html_preview = FALSE)`;
		
		vscode.window.showInformationMessage('Running reprex...');
		
		// Execute the R command
		const { stdout, stderr } = await execAsync(`Rscript -e "${command}"`);
		
		// Clean up temp file
		if (fs.existsSync(tempFile)) {
			fs.unlinkSync(tempFile);
		}
		
		if (stderr && !stderr.includes('Rendering reprex')) {
			vscode.window.showErrorMessage(`Reprex Error: ${stderr}`);
		}
		
		// Success message
		vscode.window.showInformationMessage('Reprex completed! Output copied to clipboard.');
		
		if (stdout) {
			console.log('Reprex output:', stdout);
		}
	} catch (error) {
		// Clean up temp file on error
		if (fs.existsSync(tempFile)) {
			fs.unlinkSync(tempFile);
		}
		vscode.window.showErrorMessage(`Failed to run reprex: ${error}`);
	}
}

export function deactivate() {}
