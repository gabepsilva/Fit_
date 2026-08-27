import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import { containerImages } from './config';
import { assertDocker, cacheRoot, captureStatus, ensureDirectory, run } from './shared';

type ImageName = keyof typeof containerImages;

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const cacheDirectory = process.env.SCANNER_IMAGE_CACHE ?? path.join(cacheRoot, 'images');

function isImageName(value: string): value is ImageName {
	return Object.hasOwn(containerImages, value);
}

const requested = process.argv.slice(2);
for (const name of requested) {
	if (!isImageName(name)) {
		throw new Error(`Unknown image "${name}". Known: ${Object.keys(containerImages).join(', ')}.`);
	}
}
const selected: ImageName[] =
	requested.length > 0 ? (requested as ImageName[]) : (Object.keys(containerImages) as ImageName[]);

await assertDocker();
await ensureDirectory(cacheDirectory);

for (const name of selected) {
	const image = containerImages[name];
	const archive = path.join(cacheDirectory, `${name}.tar`);

	const present = await captureStatus('docker', ['image', 'inspect', image]);
	if (present.exitCode === 0) {
		console.log(`${name}: already present.`);
		continue;
	}

	const loaded = await captureStatus('docker', ['load', '--input', archive]);
	if (loaded.exitCode === 0) {
		console.log(`${name}: restored from ${path.relative(projectRoot, archive)}.`);
		continue;
	}

	console.log(`${name}: pulling ${image}.`);
	await run('docker', ['pull', '--quiet', image]);
	await run('docker', ['save', '--output', archive, image]);
	console.log(`${name}: cached at ${path.relative(projectRoot, archive)}.`);
}
