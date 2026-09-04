import { expect, test, type Page, type Locator } from '@playwright/test';
import { clearRegistrationThrottle, freshUsername } from '../../../tests/e2e-support';
import AxeBuilder from '@axe-core/playwright';

/**
 * Creating an account. Registration is the only path that answers "does this
 * username exist", so the taken name is exercised here and nowhere else.
 */

/** Above the server's 10-char minimum. */
const PASSWORD = 'salt-and-pepper-mill';

async function axeViolations(page: Page) {
	const results = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	// Returned, not asserted: each test makes its own a11y assertion.
	return results.violations;
}

/** The route a person takes: ask for the app, get the sign-in form, follow the offer to create one. */
async function reachSignUp(page: Page) {
	await page.goto('/');
	await page.getByRole('link', { name: 'Create one' }).click();
	await expect(page.getByRole('heading', { name: 'Create an account', level: 1 })).toBeVisible();
}

/**
 * WCAG contrast ratio between a locator's own color and background, composited the way a
 * person actually sees a disabled button — not the way `getComputedStyle` reports it.
 *
 * Two reasons this can't just be an axe assertion (issue #46's regression is otherwise
 * invisible to the suite):
 *  - axe-core's `color-contrast` rule skips disabled elements by design
 *    (`colorContrastMatches` bails out for a disabled node before it measures anything),
 *    so axe can never fail on a disabled control's contrast.
 *  - `getComputedStyle(el).color` / `.backgroundColor` report the element's OWN values,
 *    not what a person sees: `opacity` composites those against whatever is behind the
 *    element at paint time without changing the computed values at all. A button faded to
 *    `opacity: 0.5` still reports its full-strength colors here.
 *
 * So this hand-rolls the compositing: blend the element's color and background toward the
 * page background by the element's own computed opacity (alpha-composite per channel), then
 * compute the WCAG relative-luminance contrast ratio between the two blended colors.
 */
type Rgb = { r: number; g: number; b: number };

async function contrastRatioOf(locator: Locator): Promise<number> {
	return locator.evaluate((el) => {
		function parseRgb(css: string): Rgb {
			// getComputedStyle on an element always resolves to rgb()/rgba(); a raw custom
			// property value (the --color-background token itself) comes back as its
			// literal hex source instead, so both forms are handled here.
			const trimmed = css.trim();
			const hex = trimmed.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
			if (hex) {
				return {
					r: parseInt(hex[1] ?? '0', 16),
					g: parseInt(hex[2] ?? '0', 16),
					b: parseInt(hex[3] ?? '0', 16)
				};
			}
			const match = trimmed.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
			if (!match) throw new Error(`unexpected color format: ${css}`);
			return {
				r: parseFloat(match[1] ?? '0'),
				g: parseFloat(match[2] ?? '0'),
				b: parseFloat(match[3] ?? '0')
			};
		}

		const style = getComputedStyle(el);
		const opacity = parseFloat(style.opacity);
		const pageBackground = parseRgb(
			getComputedStyle(document.documentElement).getPropertyValue('--color-background') ||
				getComputedStyle(document.body).backgroundColor
		);
		const foreground = parseRgb(style.color);
		const background = parseRgb(style.backgroundColor);

		// Alpha-composite each channel toward the page background by the element's opacity.
		// A no-op when opacity is 1, which is what makes plain `getComputedStyle` misleading
		// for anything faded.
		function blend(color: Rgb): Rgb {
			return {
				r: color.r * opacity + pageBackground.r * (1 - opacity),
				g: color.g * opacity + pageBackground.g * (1 - opacity),
				b: color.b * opacity + pageBackground.b * (1 - opacity)
			};
		}

		function relativeLuminance(color: Rgb): number {
			const channel = (value: number) => {
				const c = value / 255;
				return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
			};
			return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
		}

		const l1 = relativeLuminance(blend(foreground));
		const l2 = relativeLuminance(blend(background));
		const lighter = Math.max(l1, l2);
		const darker = Math.min(l1, l2);
		return (lighter + 0.05) / (darker + 0.05);
	});
}

async function submitAccount(page: Page, username: string, password = PASSWORD) {
	await page.getByLabel('Username').fill(username);
	await page.getByLabel('Name', { exact: true }).fill('Robin');
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Create account' }).click();
}

test.beforeEach(clearRegistrationThrottle);

test.describe('creating an account', () => {
	test.beforeEach(async ({ page }) => {
		await reachSignUp(page);
	});

	test('states the rules before anything is rejected', async ({ page }) => {
		await expect(page.getByText('3 to 32 characters: letters, digits, and . _ -')).toBeVisible();
		await expect(page.getByText('At least 10 characters. Length beats punctuation.')).toBeVisible();
		await expect(page.getByLabel('Household')).toBeVisible();
	});

	test('has no detectable accessibility violations', async ({ page }) => {
		expect(await axeViolations(page)).toEqual([]);
	});

	test('signs the new account in and opens the app', async ({ page }) => {
		const username = freshUsername();
		await submitAccount(page, username);

		// A new account on a new device opens on the first run rather than on a
		// journal: registering creates the account, not the journal.
		await expect(page.getByRole('heading', { name: 'Tend' })).toBeVisible();

		// And the drawer, once there is one, names who is signed in.
		await page.getByRole('button', { name: 'Continue' }).click();
		await page.getByRole('button', { name: 'Continue' }).click();
		await page.getByRole('button', { name: 'Open the sample journal' }).click();
		await page.getByRole('button', { name: 'Open menu' }).click();
		await expect(page.getByText('Robin', { exact: true })).toBeVisible();
		await expect(page.getByText(`@${username}`)).toBeVisible();
	});

	test('refuses a short password under the password box', async ({ page }) => {
		await submitAccount(page, freshUsername(), 'short');

		await expect(page.getByText('At least 10 characters.', { exact: true })).toBeVisible();
		await expect(page.getByLabel('Password')).toHaveAttribute('aria-invalid', 'true');
		await expect(page.getByRole('heading', { name: 'Create an account', level: 1 })).toBeVisible();
	});

	test('refuses a username the shape rules do not allow', async ({ page }) => {
		await submitAccount(page, 'no');

		await expect(page.getByText('At least 3 characters.')).toBeVisible();
		await expect(page.getByLabel('Username')).toHaveAttribute('aria-invalid', 'true');
	});

	test('names the characters a username may use', async ({ page }) => {
		await submitAccount(page, 'robin!!');

		await expect(page.getByText('Letters, digits, and . _ - only.')).toBeVisible();
	});

	test('keeps the disabled submit button readable while creating the account', async ({ page }) => {
		const username = freshUsername();
		await page.getByLabel('Username').fill(username);
		await page.getByLabel('Name', { exact: true }).fill('Robin');
		await page.getByLabel('Password').fill(PASSWORD);

		const button = page.getByRole('button', { name: /Create account|Creating/ });
		await button.click();

		// Web-first assertions poll rather than snapshot once, so these still catch the
		// busy state even if the real network round trip settles quickly.
		await expect(button).toBeDisabled();
		await expect(button).toHaveText('Creating…');

		await expect.poll(() => contrastRatioOf(button)).toBeGreaterThanOrEqual(4.5);

		// `expect.poll` above only proves the settled state is readable — it succeeds on
		// the first passing sample, so it can't tell "never dips below 4.5" from "got
		// lucky mid-fade" (issue #46 bit this twice: once for real on the sign-in page,
		// once again while re-verifying this very test). Animating `background-color` or
		// `color` between two accessible pairs necessarily passes through intermediates
		// that satisfy neither — that's what produced the 3.08 ratio axe caught on
		// sign-in — so the fix is that those properties never animate on a button at all,
		// not that the animation happens to land somewhere safe. That's a fact about
		// configuration, not about a rendered frame, so check it directly: no polling, no
		// flake, fails immediately if either property is ever re-added to the transition.
		const transitionProperties = await button.evaluate((el) =>
			getComputedStyle(el)
				.transitionProperty.split(',')
				.map((property) => property.trim())
		);
		expect(transitionProperties).not.toContain('background-color');
		expect(transitionProperties).not.toContain('color');
	});

	test('has no detectable accessibility violations with a field rejected', async ({ page }) => {
		await submitAccount(page, freshUsername(), 'short');
		await expect(page.getByLabel('Password')).toHaveAttribute('aria-invalid', 'true');
		expect(await axeViolations(page)).toEqual([]);
	});
});

/** The second sign-up for one name; goto directly, since the gate no longer stands in the way. */
test('says a username is taken, under the box that holds it', async ({ page }) => {
	const username = freshUsername();
	await reachSignUp(page);
	await submitAccount(page, username);
	await expect(page.getByRole('heading', { name: 'Tend' })).toBeVisible();

	await page.goto('/signup');
	await submitAccount(page, username);

	await expect(page.getByText('That username is taken.')).toBeVisible();
	await expect(page.getByLabel('Username')).toHaveAttribute('aria-invalid', 'true');
});
