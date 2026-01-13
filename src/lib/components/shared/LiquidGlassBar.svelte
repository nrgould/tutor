<script lang="ts">
	/**
	 * LiquidGlassBar - Dark glass container with top shimmer
	 *
	 * The bar itself is a dark translucent container with a white shimmer
	 * on the top border that fades toward the edges. Internal components
	 * (buttons, inputs) should use the .liquid-glass-element class for
	 * the actual liquid glass effect.
	 * When active=false, shows flat #292929 background without effects.
	 */

	import type { Snippet } from 'svelte';

	interface Props {
		class?: string;
		active?: boolean;
		connected?: boolean; // When true, removes bottom border-radius to connect with panel below
		children?: Snippet;
	}

	let { class: className = '', active = true, connected = false, children }: Props = $props();
</script>

<div class="liquid-glass-bar {className}" class:active class:inactive={!active} class:connected>
	<!-- Top-left shimmer overlay -->
	<div class="top-shimmer"></div>
	<!-- Bottom-right shimmer overlay (subtler) -->
	<div class="bottom-shimmer"></div>

	<!-- Content -->
	<div class="content">
		{@render children?.()}
	</div>
</div>

<style>
	.liquid-glass-bar {
		position: relative;
		border-radius: 26px;
		isolation: isolate;
		overflow: hidden;

		/* Semi-transparent dark background for visibility with native liquid glass */
		background: rgba(28, 28, 30, 0.8);

		/* Backdrop blur for glass effect */
		backdrop-filter: blur(40px);
		-webkit-backdrop-filter: blur(40px);

		/* No borders or outlines */
		border: none;
		outline: none;
		box-shadow: none;
	}

	/* Blur layer */
	.liquid-glass-bar::before {
		content: '';
		position: absolute;
		left: 4px;
		right: 4px;
		top: 6px;
		bottom: 4px;
		background: rgba(0, 0, 0, 0.08);
		background-blend-mode: hard-light;
		filter: blur(20px);
		backdrop-filter: blur(40px);
		-webkit-backdrop-filter: blur(40px);
		border-radius: 24px;
		z-index: -1;
		pointer-events: none;
	}

	/* Top-left shimmer border */
	.top-shimmer {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 2;
		border-radius: 26px;

		/* Shimmer border using gradient on pseudo-element */
		background: linear-gradient(
			135deg,
			rgba(255, 255, 255, 0.25) 0%,
			rgba(255, 255, 255, 0.15) 20%,
			rgba(255, 255, 255, 0.08) 45%,
			rgba(255, 255, 255, 0.03) 70%,
			transparent 90%
		);

		/* Mask to create border effect */
		-webkit-mask:
			linear-gradient(#fff 0 0) content-box,
			linear-gradient(#fff 0 0);
		mask:
			linear-gradient(#fff 0 0) content-box,
			linear-gradient(#fff 0 0);
		-webkit-mask-composite: xor;
		mask-composite: exclude;
		padding: 1px;
	}

	/* Bottom-right shimmer border (subtler than top-left) */
	.bottom-shimmer {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 2;
		border-radius: 26px;

		/* Mirror gradient: 315deg = opposite of 135deg, reduced opacity */
		background: linear-gradient(
			315deg,
			rgba(255, 255, 255, 0.12) 0%,
			rgba(255, 255, 255, 0.06) 20%,
			rgba(255, 255, 255, 0.03) 45%,
			rgba(255, 255, 255, 0.01) 70%,
			transparent 90%
		);

		/* Mask to create border effect */
		-webkit-mask:
			linear-gradient(#fff 0 0) content-box,
			linear-gradient(#fff 0 0);
		mask:
			linear-gradient(#fff 0 0) content-box,
			linear-gradient(#fff 0 0);
		-webkit-mask-composite: xor;
		mask-composite: exclude;
		padding: 1px;
	}

	/* Glass effect layer */
	.liquid-glass-bar::after {
		content: '';
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.001);
		border-radius: 26px;
		pointer-events: none;
		z-index: 3;
	}

	/* Content layer */
	.content {
		position: relative;
		z-index: 4;
	}

	/* Fallback for browsers without backdrop-filter */
	@supports not (backdrop-filter: blur(10px)) {
		.liquid-glass-bar {
			background: rgba(28, 28, 30, 0.95);
		}
	}

	/* Inactive state - dimmed but still visible */
	.liquid-glass-bar.inactive {
		background: rgba(28, 28, 30, 0.95);
	}

	.liquid-glass-bar.inactive .top-shimmer,
	.liquid-glass-bar.inactive .bottom-shimmer {
		opacity: 0.3;
	}

	.liquid-glass-bar.inactive::before {
		opacity: 0.5;
	}

	/* Connected state - flat bottom to connect with panel below */
	.liquid-glass-bar.connected {
		border-bottom-left-radius: 0;
		border-bottom-right-radius: 0;
	}

	.liquid-glass-bar.connected::before {
		border-bottom-left-radius: 0;
		border-bottom-right-radius: 0;
	}

	.liquid-glass-bar.connected::after {
		border-bottom-left-radius: 0;
		border-bottom-right-radius: 0;
	}

	.liquid-glass-bar.connected .top-shimmer {
		border-bottom-left-radius: 0;
		border-bottom-right-radius: 0;
	}

	.liquid-glass-bar.connected .bottom-shimmer {
		border-bottom-left-radius: 0;
		border-bottom-right-radius: 0;
	}
</style>
