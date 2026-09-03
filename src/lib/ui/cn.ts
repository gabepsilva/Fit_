import { clsx, type ClassValue } from 'clsx';

// Joins conditional class names without resolving conflicts: `cn('p-2', 'p-4')`
// keeps both. Emit at most one utility per group, chosen by a ternary.
export function cn(...inputs: ClassValue[]) {
	return clsx(inputs);
}
