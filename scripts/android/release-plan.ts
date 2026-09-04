/**
 * What a release build decides before it runs anything: which server the shell
 * points at, what the APK calls itself, whether it will be signed, and which
 * toolchain answers.
 *
 * All of it is pure, because none of it is provable once it is entangled with
 * a fifteen-minute Gradle run. `build-release.ts` is the part that spawns
 * processes; everything a wrong answer would ruin lives here, with a spec.
 */

/** The origin a release build points its WebView at. */
export const PRODUCTION_SERVER_URL = 'https://fit.psilva.org';

/** Where `assembleRelease` leaves its output, relative to the project root. */
export const RELEASE_APK_PATH = 'android/app/build/outputs/apk/release/app-release.apk';

/** The Android application id, as `capacitor.config.ts` and `android/app/build.gradle` both spell it. */
export const APP_ID = 'email.psilva.fit';

/** The only JDK this project builds Android with; see README. */
export const REQUIRED_JDK_MAJOR = 21;

/**
 * `versionCode` is one integer and Android only ever compares it, so the three
 * numbers of a tag are packed into it positionally: `major * 1e6 + minor * 1e3
 * + patch`. `v0.0.1` is 1, `v0.1.0` is 1000, `v1.0.0` is 1000000, and the order
 * of the tags is the order of the codes.
 *
 * The cost of a positional packing is that a component may not reach its
 * stride, or it would collide with the one above it — `v0.0.1000` and `v0.1.0`
 * would both be 1000, and the store would treat the older tag as the newer
 * build. That is refused rather than wrapped.
 */
export const VERSION_CODE_MINOR_STRIDE = 1_000;
export const VERSION_CODE_MAJOR_STRIDE = 1_000_000;

/** Three numbers as one, so a comparison is arithmetic rather than a loop with its own bugs. */
function packVersion(major: number, minor: number, patch: number): number {
	return major * VERSION_CODE_MAJOR_STRIDE + minor * VERSION_CODE_MINOR_STRIDE + patch;
}

export interface AndroidVersion {
	/** What the app displays and `dumpsys` reports, tag and all: `v0.0.7`, or `v0.0.7+be031ca`. */
	versionName: string;
	/** The integer Android compares between installs. */
	versionCode: number;
}

const TAG = /^v(\d+)\.(\d+)\.(\d+)(\+.+)?$/;

/**
 * The pair Gradle is given, from the string `scripts/build/app-version.ts`
 * already derives, so the APK cannot claim a different version from the bundle
 * inside it.
 *
 * A build ahead of its tag keeps the `+<sha>` in `versionName` — that is the
 * whole point of the suffix — and takes its `versionCode` from the tag it is
 * ahead of. Two such builds therefore share a code, which `adb install -r`
 * accepts; only a tagged build gets a code no other build will reuse.
 */
export function androidVersion(buildVersion: string): AndroidVersion {
	const match = TAG.exec(buildVersion);
	if (match === null) {
		throw new Error(
			`Cannot derive an Android version from "${buildVersion}": expected v<major>.<minor>.<patch>, optionally with a +<commit> suffix.`
		);
	}
	// The pattern matched, so all three groups are present; `Number` of each is
	// exact, because each is a bare run of digits.
	const major = Number(match[1]);
	const minor = Number(match[2]);
	const patch = Number(match[3]);
	for (const [name, value] of [
		['minor', minor],
		['patch', patch]
	] as const) {
		if (value >= VERSION_CODE_MINOR_STRIDE) {
			throw new Error(
				`"${buildVersion}" has a ${name} of ${value}, which does not fit the versionCode packing (each of minor and patch must stay under ${VERSION_CODE_MINOR_STRIDE}).`
			);
		}
	}
	return { versionName: buildVersion, versionCode: packVersion(major, minor, patch) };
}

export interface ReleaseOptions {
	/** The origin the shell loads everything from. */
	serverUrl: string;
	/** Build without a `signingConfig`, producing an APK no device will install. */
	unsigned: boolean;
}

const SERVER_URL_FLAG = '--server-url=';

/**
 * `--unsigned` and `--server-url=<https origin>`, and nothing else.
 *
 * An unrecognized argument stops the build rather than being ignored: a
 * mistyped `--server-url` that is silently dropped ships a phone-facing APK
 * pointed at production when the operator asked for staging, and nothing about
 * the resulting build says so.
 */
export function parseReleaseArguments(argv: readonly string[]): ReleaseOptions {
	let serverUrl = PRODUCTION_SERVER_URL;
	let unsigned = false;
	for (const argument of argv) {
		if (argument === '--unsigned') unsigned = true;
		else if (argument.startsWith(SERVER_URL_FLAG))
			serverUrl = argument.slice(SERVER_URL_FLAG.length);
		else throw new Error(`Unexpected argument ${argument}; expected --unsigned or --server-url=.`);
	}
	// `capacitor.config.ts` allows loopback http:// as well, for the USB flow.
	// A release APK is not that flow: it is installed on a phone that is not
	// tethered to this machine, so only a real origin is accepted here.
	if (!serverUrl.startsWith('https://')) {
		throw new Error(`--server-url must be an https:// origin; "${serverUrl}" is not.`);
	}
	return { serverUrl, unsigned };
}

/** Names the properties file `android/app/build.gradle` reads the keystore from. */
export const SIGNING_PROPERTIES_VARIABLE = 'FIT_ANDROID_SIGNING_PROPERTIES';

/**
 * The signing properties this build will use, or `null` when it was explicitly
 * asked for an unsigned one.
 *
 * Unset without `--unsigned` is a failure here rather than in Gradle, which
 * would happily emit an unsigned APK: the whole reason to run this script is to
 * get a file that can be installed, and finding out at `adb install` costs the
 * entire build.
 */
export function resolveSigningProperties(
	options: ReleaseOptions,
	environment: Readonly<Record<string, string | undefined>>
): string | null {
	const configured = environment[SIGNING_PROPERTIES_VARIABLE]?.trim() ?? '';
	if (options.unsigned) return null;
	if (configured === '') {
		throw new Error(
			`${SIGNING_PROPERTIES_VARIABLE} is not set, so the APK would be unsigned and could not be installed. Point it at the keystore properties file kept outside this repository, or pass --unsigned deliberately.`
		);
	}
	return configured;
}

/**
 * Where the Android SDK is, from the environment or from the file Android
 * Studio already writes.
 *
 * Gradle reads `android/local.properties` on its own, but `cap sync` and `adb`
 * do not, so the path has to be resolved once and handed to every child. The
 * environment wins because it is what a machine other than this one will set.
 */
export function resolveAndroidSdk(
	environment: Readonly<Record<string, string | undefined>>,
	localProperties: string | null
): string {
	for (const variable of ['ANDROID_HOME', 'ANDROID_SDK_ROOT']) {
		const value = environment[variable]?.trim() ?? '';
		if (value !== '') return value;
	}
	for (const line of (localProperties ?? '').split('\n')) {
		const [key, ...value] = line.split('=');
		// `=` is legal inside a Windows path, so only the first one separates.
		if (key?.trim() === 'sdk.dir' && value.join('=').trim() !== '') return value.join('=').trim();
	}
	throw new Error(
		'No Android SDK: set ANDROID_HOME, or write sdk.dir into android/local.properties (Android Studio does it on first open).'
	);
}

/**
 * The major version `java -version` reports, which it prints on stderr in a
 * shape that has been stable since JDK 9: `openjdk version "21.0.12.1"`.
 */
export function parseJavaMajor(output: string): number | null {
	const version = /version "(\d+)/.exec(output)?.[1];
	return version === undefined ? null : Number(version);
}

/** A JDK other than 21 is refused: Android Gradle Plugin 8 rejects it, in a message that names neither. */
export function assertJavaVersion(output: string): void {
	const major = parseJavaMajor(output);
	if (major !== REQUIRED_JDK_MAJOR) {
		throw new Error(
			`Android builds need JDK ${REQUIRED_JDK_MAJOR}; java reports ${major ?? 'nothing recognizable'}. Set JAVA_HOME to a ${REQUIRED_JDK_MAJOR} installation.`
		);
	}
}

/**
 * The serials `adb devices` lists as ready, from output that always opens with
 * a header line and may carry `unauthorized` or `offline` entries — neither of
 * which can be installed to, and both of which used to look like a device to
 * anything matching on the serial alone.
 */
export function connectedDevices(output: string): string[] {
	const ready: string[] = [];
	for (const line of output.split('\n')) {
		// `List of devices attached` and a blank last line have no second field
		// that reads `device`, so the header needs no special case.
		const [serial, state] = line.trim().split(/\s+/);
		if (state === 'device' && serial !== undefined) ready.push(serial);
	}
	return ready;
}

const BUILD_TOOLS = /^(\d+)\.(\d+)\.(\d+)$/;

/**
 * The newest build-tools directory in the SDK, which is where `apksigner`
 * lives.
 *
 * Compared by number rather than as text, because the SDK holds `9.0.0` beside
 * `36.0.0` for as long as anyone keeps an old platform around, and text order
 * puts the nine on top. Anything that is not three numbers -- a stray file, a
 * preview directory -- is not a candidate rather than a parse failure.
 */
export function newestBuildTools(versions: readonly string[]): string | null {
	let newest: { name: string; order: number } | null = null;
	for (const name of versions) {
		const match = BUILD_TOOLS.exec(name);
		if (match === null) continue;
		const order = packVersion(Number(match[1]), Number(match[2]), Number(match[3]));
		if (newest === null || order > newest.order) newest = { name, order };
	}
	return newest?.name ?? null;
}
