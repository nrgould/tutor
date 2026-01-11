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
		border-radius: 22px;
		isolation: isolate;

		/* Dark fill layer with blend mode */
		background: linear-gradient(
				0deg,
				rgba(40, 40, 42, 0.85),
				rgba(40, 40, 42, 0.85)
			),
			#0a0a0a;
		background-blend-mode: normal, color-dodge;

		/* Backdrop blur for glass effect */
		backdrop-filter: blur(40px);
		-webkit-backdrop-filter: blur(40px);

		/* Absolutely no borders or outlines */
		border: none !important;
		outline: none !important;
		box-shadow: none !important;
	}

	/* Blur layer positioned slightly below top */
	.liquid-glass-bar::before {
		content: '';
		position: absolute;
		left: 4px;
		right: 4px;
		top: 6px;
		bottom: 4px;
		background: rgba(0, 0, 0, 0.15);
		background-blend-mode: hard-light;
		filter: blur(20px);
		backdrop-filter: blur(40px);
		-webkit-backdrop-filter: blur(40px);
		border-radius: 20px;
		z-index: -1;
		pointer-events: none;
	}

	/* Top shimmer - subtle white glow at top edge */
	.top-shimmer {
		position: absolute;
		left: 0;
		right: 0;
		top: 0;
		height: 12px;
		pointer-events: none;

		/* Shimmer gradient from top */
		background: linear-gradient(
			180deg,
			rgba(255, 255, 255, 0.2) 0%,
			rgba(255, 255, 255, 0.1) 40%,
			transparent 100%
		);

		/* Fade from sides */
		mask-image: linear-gradient(
			90deg,
			transparent 0%,
			black 8%,
			black 92%,
			transparent 100%
		);

		border-radius: 22px 22px 0 0;
		mix-blend-mode: overlay;
	}

	/* Content layer */
	.content {
		position: relative;
		z-index: 1;
	}

	/* Fallback for browsers without backdrop-filter */
	@supports not (backdrop-filter: blur(10px)) {
		.liquid-glass-bar {
			background: rgba(28, 28, 30, 0.95);
		}
	}
</style>
