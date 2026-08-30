import { clsx, type ClassValue } from 'clsx';

/**
 * Join conditional class names. It does not resolve conflicts between Tailwind
 * utilities in the same group: a caller that passes `p-2` and `p-4` gets both,
 * and the stylesheet decides. Compose so that only one utility per group is ever
 * emitted — a ternary between two palettes rather than one layered over another.
 * `tailwind-merge` used to do that resolution here and cost 26.7 KB of the client
 * bundle to serve a handful of call sites, all of which now say which they mean.
 */
export function cn(...inputs: ClassValue[]) {
	return clsx(inputs);
}
