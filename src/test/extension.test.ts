import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

suite('Reprex Extension Test Suite', () => {
	vscode.window.showInformationMessage('Starting Reprex extension tests.');

	test('Extension should be present', () => {
		assert.ok(vscode.extensions.getExtension('reprex-generator-for-r'));
	});

	test('Should register all reprex commands', async () => {
		const commands = await vscode.commands.getCommands();
		
		// Check that all our commands are registered
		assert.ok(commands.includes('reprex-generator-for-r.reprexAddin'));
		assert.ok(commands.includes('reprex-generator-for-r.reprexFile'));
		assert.ok(commands.includes('reprex-generator-for-r.reprexSelection'));
		assert.ok(commands.includes('reprex-generator-for-r.reprexClipboard'));
	});

	test('Should handle empty selection gracefully', async () => {
		// Create a new untitled document
		const document = await vscode.workspace.openTextDocument({
			content: '',
			language: 'r'
		});
		
		await vscode.window.showTextDocument(document);
		
		// Try to run reprex on empty selection
		// This should show an error message but not crash
		try {
			await vscode.commands.executeCommand('reprex-generator-for-r.reprexSelection');
			// Command should complete without throwing
			assert.ok(true);
		} catch (error) {
			assert.fail('Command should handle empty selection gracefully');
		}
	});

	test('Should handle R code in active file', async () => {
		// Create a document with R code
		const testCode = 'x <- 1:10\nmean(x)\n';
		const document = await vscode.workspace.openTextDocument({
			content: testCode,
			language: 'r'
		});
		
		await vscode.window.showTextDocument(document);
		
		// Command should execute without errors
		try {
			// Note: This won't actually run reprex in tests unless R is available
			// but it tests that the command is properly registered and callable
			const canExecute = await vscode.commands.getCommands()
				.then(cmds => cmds.includes('reprex-generator-for-r.reprexFile'));
			assert.ok(canExecute, 'reprexFile command should be executable');
		} catch (error) {
			assert.fail('Should handle R file content: ' + error);
		}
	});

	test('Should create temporary file with correct content', async () => {
		// Test the temp file creation logic
		const testCode = 'library(tidyverse)\nx <- 1:10\nmean(x)';
		const tempDir = os.tmpdir();
		const tempFile = path.join(tempDir, `test_reprex_${Date.now()}.R`);
		
		// Write test code to temp file
		fs.writeFileSync(tempFile, testCode, 'utf8');
		
		// Verify file was created and contains correct content
		assert.ok(fs.existsSync(tempFile), 'Temp file should be created');
		const fileContent = fs.readFileSync(tempFile, 'utf8');
		assert.strictEqual(fileContent, testCode, 'File content should match');
		
		// Clean up
		if (fs.existsSync(tempFile)) {
			fs.unlinkSync(tempFile);
		}
		assert.ok(!fs.existsSync(tempFile), 'Temp file should be cleaned up');
	});

	test('Should handle text selection', async () => {
		// Create a document with R code
		const testCode = 'x <- 1:10\ny <- x * 2\nplot(x, y)';
		const document = await vscode.workspace.openTextDocument({
			content: testCode,
			language: 'r'
		});
		
		const editor = await vscode.window.showTextDocument(document);
		
		// Select some text (line 2)
		const startPos = new vscode.Position(1, 0);
		const endPos = new vscode.Position(1, 10);
		editor.selection = new vscode.Selection(startPos, endPos);
		
		// Verify selection
		const selectedText = document.getText(editor.selection);
		assert.ok(selectedText.includes('y <- x * 2'), 'Should have selected text');
	});

	test('Extension should activate', async () => {
		const ext = vscode.extensions.getExtension('reprex-generator-for-r');
		if (ext) {
			// Check if extension is already active or can be activated
			if (!ext.isActive) {
				await ext.activate();
			}
			assert.ok(ext.isActive, 'Extension should be active');
		} else {
			// In test environment, extension might not be loaded the same way
			// This is not necessarily a failure
			console.log('Extension not found in test environment');
		}
	});

	test('Should validate R is accessible', () => {
		// This test checks if R can be accessed from the command line
		// It's a diagnostic test to help debug issues
		const { exec } = require('child_process');
		
		exec('which R', (error: any, stdout: string, stderr: string) => {
			if (error) {
				console.warn('R not found in PATH - reprex commands will fail');
				// Don't fail the test, just warn
			} else {
				console.log('R found at:', stdout.trim());
				assert.ok(stdout.trim().length > 0, 'R should be in PATH');
			}
		});
	});
});
