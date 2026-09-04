import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { readBuildVersion } from '../build/app-version';
import { capture, captureStatus, projectRoot, run } from '../security/shared';
import {
	androidVersion,
	assertJavaVersion,
	connectedDevices,
	newestBuildTools,
	parseReleaseArguments,
	RELEASE_APK_PATH,
	resolveSigningProperties,
	SIGNING_PROPERTIES_VARIABLE
} from './release-plan';
import { androidToolchain } from './toolchain';

/**
 * A signed, production-pointed APK, from a checkout to a file that can be
 * sideloaded.
 *
 * The shell it produces is nearly empty on purpose. `capacitor.config.ts` sets
 * `server.url` when `FIT_CAPACITOR_SERVER_URL` is present, and that makes the
 * WebView navigate to the origin instead of loading the bundle in `webDir`, so
 * every asset and every API call comes from production on each launch. What the
 * APK contributes is the native shell, the offline page, and a signature — which
 * is why it needs rebuilding only when one of those three changes.
 *
 * Everything decided here rather than run here is in `release-plan.ts`.
 */

const GRADLE_WRAPPER = './gradlew';

/**
 * What `apksigner` says about the finished file, so the run that produced it is
 * also the run that proves it installable. Gradle emitting `app-release.apk`
 * rather than `app-release-unsigned.apk` is the only other evidence, and it is
 * a filename.
 */
async function printSigner(sdk: string, apk: string): Promise<void> {
	const buildTools = path.join(sdk, 'build-tools');
	const newest = newestBuildTools(await readdir(buildTools).catch(() => []));
	if (newest === null) {
		console.log(`No build-tools under ${buildTools}; skipping the signature check.`);
		return;
	}
	const verified = await captureStatus(path.join(buildTools, newest, 'apksigner'), [
		'verify',
		'--print-certs',
		apk
	]);
	if (verified.exitCode !== 0) {
		throw new Error(`apksigner refused the APK it just built:\n${verified.output}`);
	}
	process.stdout.write(verified.output);
}

async function sha256(file: string): Promise<string> {
	return createHash('sha256')
		.update(await readFile(file))
		.digest('hex');
}

async function main(): Promise<void> {
	const options = parseReleaseArguments(process.argv.slice(2));
	const signingProperties = resolveSigningProperties(options, process.env);

	const java = await captureStatus('java', ['-version']);
	assertJavaVersion(java.output);
	const { sdk, adb } = await androidToolchain();

	const { versionName, versionCode } = androidVersion(readBuildVersion().version);
	console.log(`Building ${versionName} (versionCode ${versionCode}) against ${options.serverUrl}`);
	console.log(
		signingProperties === null
			? 'Unsigned build: the APK will not install on a device.'
			: `Signing with the keystore named by ${SIGNING_PROPERTIES_VARIABLE}.`
	);

	// One environment for both children: `cap sync` re-evaluates
	// `capacitor.config.ts`, so the server URL has to be present for the sync as
	// well as for the Vite build, or the shell would ship pointed at nothing.
	const buildEnvironment: NodeJS.ProcessEnv = {
		...process.env,
		FIT_CAPACITOR_SERVER_URL: options.serverUrl,
		ANDROID_HOME: sdk
	};
	await run('bun', ['run', 'android:sync'], { env: buildEnvironment });

	await run(
		GRADLE_WRAPPER,
		[
			'--quiet',
			'assembleRelease',
			'--project-prop',
			`fitVersionName=${versionName}`,
			'--project-prop',
			`fitVersionCode=${versionCode}`
		],
		{ cwd: path.join(projectRoot, 'android'), env: buildEnvironment }
	);

	const apk = path.join(projectRoot, RELEASE_APK_PATH);
	console.log(`\nAPK: ${apk}`);
	console.log(`SHA-256: ${await sha256(apk)}`);
	if (signingProperties !== null) await printSigner(sdk, apk);

	const devices = connectedDevices(await capture(adb, ['devices']));
	console.log(
		devices.length === 0
			? 'No device is connected; run `bun run android:install` once one is.'
			: `Install it with: bun run android:install (${devices.length} device(s) connected)`
	);
}

await main();
