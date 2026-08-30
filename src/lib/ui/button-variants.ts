export type ButtonVariant = 'default' | 'secondary' | 'ghost' | 'outline' | 'quiet';
export type ButtonSize = 'default' | 'sm' | 'lg' | 'icon' | 'icon-round';

export const BUTTON_BASE =
	'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-[transform,background-color,opacity,box-shadow,color] duration-150 ease-out active:not-disabled:scale-[0.96] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background';

export const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
	default: 'bg-primary text-primary-foreground hover:opacity-90',
	secondary: 'bg-secondary text-secondary-foreground hover:bg-muted',
	ghost: 'text-foreground hover:bg-secondary',
	outline: 'border border-border bg-card text-foreground hover:bg-secondary',
	quiet: 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-secondary'
};

export const BUTTON_SIZES: Record<ButtonSize, string> = {
	default: 'h-11 px-4 rounded-xl text-sm',
	sm: 'h-9 px-3 rounded-lg text-sm',
	lg: 'h-12 px-5 rounded-2xl text-base',
	icon: 'size-11 rounded-xl',
	'icon-round': 'size-11 rounded-full'
};
