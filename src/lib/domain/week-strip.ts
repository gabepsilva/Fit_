/**
 * The accessible-name suffix for one day button in the week strip: which of
 * food, exercise and weight were logged that day, or "nothing logged" when
 * none were.
 */
export function loggedMarksText(food: boolean, exercise: boolean, weight: boolean): string {
	const parts: string[] = [];
	if (food) parts.push('food');
	if (exercise) parts.push('exercise');
	if (weight) parts.push('weight');
	if (parts.length === 0) return 'nothing logged';
	return `${parts.join(', ')} logged`;
}
