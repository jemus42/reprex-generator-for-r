import * as vscode from 'vscode';
import * as path from 'path';
import { renderReprex, resolveOutputBase, OutputLocation, VENUES, VenueId, isVenue } from './reprex';

const LAST_VENUE_KEY = 'lastVenue';

export function activate(context: vscode.ExtensionContext) {
	const log = vscode.window.createOutputChannel('Reprex', { log: true });
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

	const register = (name: string, source: 'file' | 'selection', pickVenue: boolean) =>
		vscode.commands.registerCommand(`reprex-generator-for-r.${name}`, async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showErrorMessage('No active editor');
				return;
			}

			const text = source === 'file'
				? editor.document.getText()
				: editor.document.getText(editor.selection);
			if (!text.trim()) {
				vscode.window.showErrorMessage(source === 'file' ? 'Active file is empty' : 'No text selected');
				return;
			}

			const venue = pickVenue ? await promptVenue(context) : configuredVenue();
			if (venue) {
				await runReprex(text, venue, editor.document, log);
			}
		});

	context.subscriptions.push(
		log,
		reprexAddin,
		register('reprexFile', 'file', false),
		register('reprexSelection', 'selection', false),
		register('reprexFileVenue', 'file', true),
		register('reprexSelectionVenue', 'selection', true)
	);
}

function configuredVenue(): VenueId {
	const venue = vscode.workspace.getConfiguration('reprex').get<string>('venue', 'gh');
	return isVenue(venue) ? venue : 'gh';
}

async function promptVenue(context: vscode.ExtensionContext): Promise<VenueId | undefined> {
	const last = context.workspaceState.get<string>(LAST_VENUE_KEY) ?? configuredVenue();
	const items = [...VENUES]
		.sort((a, b) => Number(b.id === last) - Number(a.id === last))
		.map(v => ({ label: v.label, description: v.id, detail: v.detail, id: v.id }));

	const picked = await vscode.window.showQuickPick(items, { title: 'Reprex venue', placeHolder: 'Where will this reprex be posted?' });
	if (picked) {
		await context.workspaceState.update(LAST_VENUE_KEY, picked.id);
	}
	return picked?.id;
}

function outputBase(document: vscode.TextDocument): string {
	const config = vscode.workspace.getConfiguration('reprex');
	return resolveOutputBase({
		location: config.get<OutputLocation>('outputLocation', 'user'),
		customPath: config.get<string>('outputPath'),
		workspaceFolder: (vscode.workspace.getWorkspaceFolder(document.uri) ?? vscode.workspace.workspaceFolders?.[0])?.uri.fsPath
	});
}

function workingDirectory(document: vscode.TextDocument): string | undefined {
	if (document.uri.scheme === 'file') {
		return path.dirname(document.uri.fsPath);
	}
	return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

async function runReprex(text: string, venue: VenueId, document: vscode.TextDocument, log: vscode.LogOutputChannel) {
	const config = vscode.workspace.getConfiguration('reprex');

	try {
		const { output, figuresDir } = await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: `Reprex (${venue})`, cancellable: true },
			async (progress, token) => {
				progress.report({ message: 'Starting R...' });
				const abort = new AbortController();
				token.onCancellationRequested(() => abort.abort());

				return renderReprex(text, {
					venue,
					rscript: config.get<string>('rscriptPath'),
					wd: workingDirectory(document),
					outputBase: outputBase(document),
					uploadPlots: config.get<boolean>('uploadPlots', true),
					signal: abort.signal,
					onProgress: message => progress.report({ message }),
					onLog: chunk => log.append(chunk)
				});
			}
		);

		const language = VENUES.find(v => v.id === venue)?.language;
		const doc = await vscode.workspace.openTextDocument({ content: output, language });
		await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true });

		if (config.get<boolean>('copyToClipboard', true)) {
			await vscode.env.clipboard.writeText(output);
			vscode.window.setStatusBarMessage('Reprex copied to clipboard', 4000);
		}

		if (figuresDir) {
			const choice = await vscode.window.showInformationMessage(`Reprex figures saved to ${figuresDir}`, 'Reveal');
			if (choice === 'Reveal') {
				await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(figuresDir));
			}
		}
	} catch (error) {
		if ((error as Error).name === 'AbortError') {
			return;
		}
		const choice = await vscode.window.showErrorMessage(`Reprex failed: ${(error as Error).message}`, 'Show Log');
		if (choice === 'Show Log') {
			log.show();
		}
	}
}

export function deactivate() {}
