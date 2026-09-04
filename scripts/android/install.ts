import { access } from 'node:fs/promises';
import path from 'node:path';
import { capture, projectRoot, run } from '../security/shared';
import { APP_ID, connectedDevices, RELEASE_APK_PATH } from './release-plan';
import { androidToolchain } from './toolchain';

/**
 * The signed APK onto the phone on the other end of the cable.
 *
 * `-r` reinstalls over the existing app and keeps its data, which is the only
 * acceptable update path: uninstalling drops the `localStorage` the app keeps
 * its journal in until sync exists, so it is never done here.
 */

async function main(): Promise<void> {
	const { adb } = await androidToolchain();
	const apk = path.join(projectRoot, RELEASE_APK_PATH);
	await access(apk).catch(() => {
		throw new Error(`No APK at ${apk}; run \`bun run android:release\` first.`);
	});

	const devices = connectedDevices(await capture(adb, ['devices']));
	if (devices.length === 0) {
		throw new Error(
			'No device is connected: plug the phone in over USB and accept the debugging prompt on it. `adb devices` lists an unauthorized device until you do.'
		);
	}

	await run(adb, ['install', '-r', apk]);
	console.log(`\nInstalled ${apk} on ${devices.join(', ')}.`);
	console.log(
		`Launch it with: ${adb} shell monkey -p ${APP_ID} -c android.intent.category.LAUNCHER 1`
	);
}

await main();
