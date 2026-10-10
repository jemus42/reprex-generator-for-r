import * as vscode from 'vscode';
import * as path from 'path';
import { renderReprex, resolveOutputBase, pruneOldRuns, OutputLocation, ReprexNotInstalledError, VENUES, VenueId, isVenue } from './reprex';
import { inPositron, installReprexInConsole, positronRscript } from './positron';

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
				await runReprex(text, venue, editor.document.uri, log);
			}
		});

	const reprexClipboard = vscode.commands.registerCommand('reprex-generator-for-r.reprexClipboard', async () => {
		const text = await vscode.env.clipboard.readText();
		if (!text.trim()) {
			vscode.window.showErrorMessage('Clipboard is empty');
			return;
		}
		// The clipboard is invisible, so show what is about to run as R code.
		const lines = text.trim().split('\n');
		const preview = lines.slice(0, 5).join('\n') + (lines.length > 5 ? `\n... (${lines.length - 5} more lines)` : '');
		const run = await vscode.window.showWarningMessage('Run the clipboard contents as R code?', { modal: true, detail: preview }, 'Run');
		if (run !== 'Run') {
			return;
		}
		await runReprex(text, configuredVenue(), undefined, log);
	});

	context.subscriptions.push(
		log,
		reprexAddin,
		reprexClipboard,
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

function outputBase(uri: vscode.Uri | undefined): string {
	const config = vscode.workspace.getConfiguration('reprex');
	return resolveOutputBase({
		location: config.get<OutputLocation>('outputLocation', 'user'),
		customPath: config.get<string>('outputPath'),
		workspaceFolder: ((uri && vscode.workspace.getWorkspaceFolder(uri)) ?? vscode.workspace.workspaceFolders?.[0])?.uri.fsPath
	});
}

function workingDirectory(uri: vscode.Uri | undefined): string | undefined {
	if (uri?.scheme === 'file') {
		return path.dirname(uri.fsPath);
	}
	return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

// Explicit setting wins, then Positron's selected R, then Rscript from PATH.
async function resolveRscript(config: vscode.WorkspaceConfiguration): Promise<string> {
	return config.get<string>('rscriptPath')?.trim() || await positronRscript() || 'Rscript';
}

// "default" leaves reprex's own default (and any option set in .Rprofile) untouched.
function triState(config: vscode.WorkspaceConfiguration, key: string): boolean | undefined {
	const value = config.get<string>(key, 'default');
	return value === 'default' ? undefined : value === 'on';
}

async function runReprex(text: string, venue: VenueId, uri: vscode.Uri | undefined, log: vscode.LogOutputChannel) {
	// Rscript sources .Rprofile files from the working directory, so never run in a workspace the user has not trusted.
	if (!vscode.workspace.isTrusted) {
		vscode.window.showErrorMessage('Reprex runs R code and is disabled in untrusted workspaces. Trust the workspace to continue.');
		return;
	}
	const config = vscode.workspace.getConfiguration('reprex');
	const base = outputBase(uri);
	const rscript = await resolveRscript(config);

	try {
		const { output, figuresDir } = await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: `Reprex (${venue})`, cancellable: true },
			async (progress, token) => {
				progress.report({ message: 'Starting R...' });
				const abort = new AbortController();
				token.onCancellationRequested(() => abort.abort());

				return renderReprex(text, {
					venue,
					rscript,
					wd: workingDirectory(uri),
					outputBase: base,
					uploadPlots: config.get<boolean>('uploadPlots', true),
					reprexOptions: {
						sessionInfo: triState(config, 'sessionInfo'),
						advertise: triState(config, 'advertise'),
						style: triState(config, 'style'),
						comment: config.get<string>('comment', '').trim() || undefined
					},
					timeoutMs: config.get<number>('timeoutSeconds', 0) * 1000,
					signal: abort.signal,
					onProgress: message => progress.report({ message }),
					onLog: chunk => log.append(chunk)
				});
			}
		);

		pruneOldRuns(base, config.get<number>('keepFiguresDays', 30)).catch(() => {});

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
		if (error instanceof ReprexNotInstalledError) {
			await offerReprexInstall();
			return;
		}
		const choice = await vscode.window.showErrorMessage(`Reprex failed: ${(error as Error).message}`, 'Show Log');
		if (choice === 'Show Log') {
			log.show();
		}
	}
}

async function offerReprexInstall() {
	const install = 'install.packages("reprex")';
	const action = inPositron() ? 'Install reprex' : 'Copy install command';
	const choice = await vscode.window.showErrorMessage('The R package {reprex} is not installed for the R used by this extension.', action);
	if (choice === 'Install reprex') {
		await installReprexInConsole();
	} else if (choice) {
		await vscode.env.clipboard.writeText(install);
	}
}

export function deactivate() {}
