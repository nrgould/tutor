<script lang="ts">
	/**
	 * LiquidGlassBar - Dark glass container with top shimmer
	 *
	 * The bar itself is a dark translucent container with a white shimmer
	 * on the top border that fades toward the edges. Internal components
	 * (buttons, inputs) should use the .liquid-glass-element class for
	 * the actual liquid glass effect.
	 */

	import type { Snippet } from 'svelte';

	interface Props {
		class?: string;
		children?: Snippet;
	}

	let { class: className = '', children }: Props = $props();
</script>

<div class="liquid-glass-bar {className}">
	<!-- Top shimmer overlay -->
	<div class="top-shimmer"></div>

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

		/* Fill layer - adapted from liquid glass medium */
		background: linear-gradient(0deg, rgba(50, 50, 52, 0.85), rgba(50, 50, 52, 0.85)), #262626;
		background-blend-mode: normal, color-dodge;

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
</style>
