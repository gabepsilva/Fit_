export type ButtonVariant = 'default' | 'secondary' | 'ghost' | 'outline' | 'quiet';
export type ButtonSize = 'default' | 'sm' | 'lg' | 'icon' | 'icon-round';

export const BUTTON_BASE =
	'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-[transform,background-color,opacity,box-shadow,color] duration-150 ease-out active:not-disabled:scale-[0.96] disabled:pointer-events-none disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background';

// Filled (`default`) buttons get an explicit disabled treatment rather than opacity:
// fading a filled button's background and foreground together toward the page background
// collapses their contrast regardless of the starting colors (see issue #46). It reuses
// the `secondary` pair — a light, muted fill with dark text — precisely because it reads
// as unmistakably "off" against the dark-green enabled fill from its lightness alone, not
// from a color a person has to discriminate or a hover/cursor a touch screen doesn't have.
// (The color swap itself doesn't animate — see the `button:disabled` rule in app.css —
// so the transition can't cross the two color pairs through a low-contrast midpoint.)
// The other variants sit on transparent/light backgrounds already, where a plain opacity
// fade keeps its target ratio.
export const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
	default:
		'bg-primary text-primary-foreground hover:opacity-90 disabled:bg-secondary disabled:text-secondary-foreground',
	secondary: 'bg-secondary text-secondary-foreground hover:bg-muted disabled:opacity-50',
	ghost: 'text-foreground hover:bg-secondary disabled:opacity-50',
	outline: 'border border-border bg-card text-foreground hover:bg-secondary disabled:opacity-50',
	quiet:
		'bg-transparent text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-50'
};

export const BUTTON_SIZES: Record<ButtonSize, string> = {
	default: 'h-11 px-4 rounded-xl text-sm',
	sm: 'h-9 px-3 rounded-lg text-sm',
	lg: 'h-12 px-5 rounded-2xl text-base',
	icon: 'size-11 rounded-xl',
	'icon-round': 'size-11 rounded-full'
};
