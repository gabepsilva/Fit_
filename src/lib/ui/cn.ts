import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge conditional class names, letting later Tailwind utilities win over
 * earlier ones in the same group (`p-2 p-4` resolves to `p-4`).
 */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
