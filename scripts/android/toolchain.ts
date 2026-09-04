import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { projectRoot } from '../security/shared';
import { resolveAndroidSdk } from './release-plan';

/**
 * Where the SDK is and where `adb` inside it is, resolved the same way for
 * every script here.
 *
 * `android/local.properties` is not committed — Android Studio writes it per
 * machine — so its absence is normal and only means the environment has to
 * carry the path instead.
 */
export interface AndroidToolchain {
	sdk: string;
	adb: string;
}

export async function androidToolchain(): Promise<AndroidToolchain> {
	const localProperties = await readFile(
		path.join(projectRoot, 'android', 'local.properties'),
		'utf8'
	).catch(() => null);
	const sdk = resolveAndroidSdk(process.env, localProperties);
	return { sdk, adb: path.join(sdk, 'platform-tools', 'adb') };
}
