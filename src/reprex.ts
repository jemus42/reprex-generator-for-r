import { randomBytes } from 'crypto';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

export const VENUES = [
	{ id: 'gh', label: 'GitHub', detail: 'GitHub-Flavored Markdown', language: 'markdown' },
	{ id: 'slack', label: 'Slack', detail: 'Slack message', language: 'markdown' },
	{ id: 'so', label: 'Stack Overflow', detail: 'Alias for gh', language: 'markdown' },
	{ id: 'ds', label: 'Discourse', detail: 'Alias for gh', language: 'markdown' },
	{ id: 'r', label: 'R script', detail: 'Runnable R script with commented output', language: 'r' },
	{ id: 'html', label: 'HTML', detail: 'HTML fragment', language: 'html' }
] as const;

export type VenueId = typeof VENUES[number]['id'];

export function isVenue(value: string): value is VenueId {
	return VENUES.some(v => v.id === value);
}

// Values arrive via commandArgs(), so nothing is interpolated into R code or a shell.
const R_SCRIPT = `
args <- commandArgs(trailingOnly = TRUE)
wd <- if (nzchar(args[3])) args[3] else NULL
run_dir <- args[5]
# reprex ignores \`wd\` for file input; a trailing "" keeps the lines from being read as a path.
lines <- c(readLines(args[1], warn = FALSE), "")
# reprex has no switch for its imgur upload; a hidden spin chunk replaces the upload hook.
if (identical(args[6], "false")) {
  lines <- c("#+ include=FALSE", "knitr::opts_knit$set(upload.fun = identity)", "#'", lines)
}
before <- if (!is.null(wd)) list.files(wd, all.files = TRUE)

# With \`wd\` set, reprex leaves *_reprex* files (and *_files/ figure dirs) there.
# Figures move to run_dir; the rest is removed.
tidy <- function() {
  if (is.null(wd)) return()
  new <- setdiff(list.files(wd, all.files = TRUE), before)
  new <- file.path(wd, new[grepl("_reprex", new, fixed = TRUE)])
  figs <- new[dir.exists(new)]
  if (length(figs)) {
    dir.create(run_dir, recursive = TRUE, showWarnings = FALSE)
    base <- dirname(run_dir)
    ignore <- file.path(base, ".gitignore")
    if (basename(base) == ".reprex" && !file.exists(ignore)) writeLines("*", ignore)
    file.copy(figs, run_dir, recursive = TRUE)
  }
  unlink(new, recursive = TRUE)
}

out <- tryCatch(
  reprex::reprex(input = lines, venue = args[2], wd = wd, html_preview = FALSE),
  finally = tidy()
)
writeLines(out, args[4])
`;

export type OutputLocation = 'user' | 'project' | 'custom';

export interface OutputBaseOptions {
	location: OutputLocation;
	customPath?: string;
	workspaceFolder?: string;
	platform?: NodeJS.Platform;
	env?: NodeJS.ProcessEnv;
	home?: string;
}

// Base directory for figures; each run gets its own unique subdirectory.
export function resolveOutputBase(o: OutputBaseOptions): string {
	const platform = o.platform ?? process.platform;
	const env = o.env ?? process.env;
	const home = o.home ?? os.homedir();
	const p = platform === 'win32' ? path.win32 : path.posix;

	const user = () => {
		if (platform === 'win32') {
			return p.join(env.LOCALAPPDATA || p.join(home, 'AppData', 'Local'), 'reprex', 'Cache');
		}
		if (platform === 'darwin') {
			return p.join(home, 'Library', 'Caches', 'reprex');
		}
		const xdg = env.XDG_CACHE_HOME;
		return p.join(xdg && p.isAbsolute(xdg) ? xdg : p.join(home, '.cache'), 'reprex');
	};

	if (o.location === 'project' && o.workspaceFolder) {
		return p.join(o.workspaceFolder, '.reprex');
	}
	if (o.location === 'custom' && o.customPath?.trim()) {
		let custom = o.customPath.trim().replace(/\$\{workspaceFolder\}/g, o.workspaceFolder ?? '');
		if (custom === '~' || custom.startsWith('~/') || custom.startsWith('~\\')) {
			custom = p.join(home, custom.slice(1));
		}
		if (p.isAbsolute(custom)) {
			return custom;
		}
		if (o.workspaceFolder) {
			return p.join(o.workspaceFolder, custom);
		}
	}
	return user();
}

function uniqueRunName(): string {
	const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
	return `${stamp}-${randomBytes(3).toString('hex')}`;
}

export interface RenderResult {
	output: string;
	// Set when the run produced figures that were kept on disk.
	figuresDir?: string;
}

export interface RenderOptions {
	venue: VenueId;
	rscript?: string;
	wd?: string;
	outputBase?: string;
	// reprex uploads plots to imgur for every venue except 'r'; false keeps them local.
	uploadPlots?: boolean;
	signal?: AbortSignal;
	onProgress?: (message: string) => void;
	onLog?: (chunk: string) => void;
}

const ANSI = /\u001b\[[0-9;]*m/g;

function cleanLines(chunk: string): string[] {
	return chunk.replace(ANSI, '').split(/\r?\n/).map(l => l.replace(/^[\s•ℹ✔✖!→*]+/, '').trim()).filter(Boolean);
}

// Skips file-path and clipr noise reprex prints between its stage messages.
export function lastStatusLine(chunk: string): string | undefined {
	return cleanLines(chunk).filter(l => !/^['"\/]|clipr/.test(l)).pop();
}

export function failureMessage(stderr: string, code: number | null): string {
	const lines = cleanLines(stderr).filter(l => l !== 'Execution halted');
	return lines.slice(-2).join(' ') || `Rscript exited with code ${code}`;
}

export async function renderReprex(text: string, opts: RenderOptions): Promise<RenderResult> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reprex-'));
	const input = path.join(dir, 'input.R');
	const output = path.join(dir, 'output.txt');
	const runDir = path.join(opts.outputBase ?? path.join(dir, 'figures'), uniqueRunName());

	try {
		await fs.writeFile(input, text, 'utf8');

		await new Promise<void>((resolve, reject) => {
			const child = spawn(
				opts.rscript || 'Rscript',
				['-e', R_SCRIPT, input, opts.venue, opts.wd ?? '', output, runDir, String(opts.uploadPlots ?? true)],
				{ cwd: opts.wd, signal: opts.signal }
			);
			let err = '';
			child.stdout.on('data', d => opts.onLog?.(String(d)));
			child.stderr.on('data', d => {
				const chunk = String(d);
				err += chunk;
				opts.onLog?.(chunk);
				const status = lastStatusLine(chunk);
				if (status) {
					opts.onProgress?.(status);
				}
			});
			child.on('error', reject);
			child.on('close', code => {
				if (code === 0) {
					resolve();
				} else {
					reject(new Error(failureMessage(err, code)));
				}
			});
		});

		const content = await fs.readFile(output, 'utf8');
		const hasFigures = await fs.access(runDir).then(() => true, () => false);
		return { output: content, figuresDir: hasFigures && opts.outputBase ? runDir : undefined };
	} finally {
		await fs.rm(dir, { recursive: true, force: true });
	}
}
