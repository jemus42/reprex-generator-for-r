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
# reprex ignores \`wd\` for file input; a trailing "" keeps the lines from being read as a path.
# With \`wd\` set it leaves *_reprex* files behind, so new ones are removed afterwards.
lines <- c(readLines(args[1], warn = FALSE), "")
before <- if (!is.null(wd)) list.files(wd, all.files = TRUE)
out <- reprex::reprex(input = lines, venue = args[2], wd = wd, html_preview = FALSE)
if (!is.null(wd)) {
  new <- setdiff(list.files(wd, all.files = TRUE), before)
  unlink(file.path(wd, new[grepl("_reprex", new, fixed = TRUE)]))
}
writeLines(out, args[4])
`;

export interface RenderOptions {
	venue: VenueId;
	rscript?: string;
	wd?: string;
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

export async function renderReprex(text: string, opts: RenderOptions): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reprex-'));
	const input = path.join(dir, 'input.R');
	const output = path.join(dir, 'output.txt');

	try {
		await fs.writeFile(input, text, 'utf8');

		await new Promise<void>((resolve, reject) => {
			const child = spawn(
				opts.rscript || 'Rscript',
				['-e', R_SCRIPT, input, opts.venue, opts.wd ?? '', output],
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

		return await fs.readFile(output, 'utf8');
	} finally {
		await fs.rm(dir, { recursive: true, force: true });
	}
}
