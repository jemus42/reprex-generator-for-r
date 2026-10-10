import * as fs from 'fs/promises';
import type { PositronApi } from '@posit-dev/positron';
import { siblingRscript } from './reprex';

// Positron injects this global; it is undefined in VS Code.
const acquire = (): PositronApi | undefined =>
	(globalThis as { acquirePositronApi?: () => PositronApi | undefined }).acquirePositronApi?.();

export const inPositron = () => acquire() !== undefined;

// Rscript belonging to the R interpreter Positron currently uses; undefined outside Positron.
export async function positronRscript(): Promise<string | undefined> {
	const api = acquire();
	if (!api) {
		return undefined;
	}
	try {
		const session = await api.runtime.getForegroundSession();
		const active = session?.runtimeMetadata.languageId === 'r' ? session.runtimeMetadata : undefined;
		const runtime = active ?? await api.runtime.getPreferredRuntime('r');
		if (!runtime) {
			return undefined;
		}
		const rscript = siblingRscript(runtime.runtimePath);
		return await fs.access(rscript).then(() => rscript, () => undefined);
	} catch {
		return undefined;
	}
}

export async function installReprexInConsole(): Promise<void> {
	await acquire()?.runtime.executeCode('r', 'install.packages("reprex")', true);
}
