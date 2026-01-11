<script lang="ts">
	/**
	 * LiquidGlassBar - Apple Liquid Glass Effect for Command Bar
	 *
	 * Creates a frosted glass effect using multiple stacked backdrop-filter layers
	 * with progressive blur values, matching the Figma liquid glass design.
	 */

	import type { Snippet } from 'svelte';

	interface Props {
		class?: string;
		children?: Snippet;
	}

	let { class: className = '', children }: Props = $props();
</script>

<div class="liquid-glass-bar {className}">
	<!-- Layer 0: Outermost, heaviest blur -->
	<div class="lens lens-0"></div>
	<!-- Layer 1 -->
	<div class="lens lens-1"></div>
	<!-- Layer 2 -->
	<div class="lens lens-2"></div>
	<!-- Layer 3 -->
	<div class="lens lens-3"></div>
	<!-- Layer 4: Innermost, lightest blur -->
	<div class="lens lens-4"></div>

	<!-- Content -->
	<div class="content">
		{@render children?.()}
	</div>
</div>

<style>
	.liquid-glass-bar {
		position: relative;
		border-radius: 100px;

		/* Base gradient for highlight effect */
		background: radial-gradient(
			57.2% 57.2% at 13.35% 16.4%,
			rgba(255, 255, 255, 0.05) 0%,
			rgba(255, 255, 255, 0) 100%
		);

		/* Depth shadows - no harsh borders */
		box-shadow:
			0px 20px 40px -15px rgba(0, 0, 0, 0.15),
			inset 0px 0px 25px rgba(255, 255, 255, 0.03);

		/* Isolation for blend modes */
		isolation: isolate;

		/* Ensure no border */
		border: none;
		outline: none;
	}

	/* Base lens layer styles */
	.lens {
		position: absolute;
		background: rgba(255, 255, 255, 0.01);
		border-radius: 100px;
		pointer-events: none;
	}

	/* Layer 0: Outermost */
	.lens-0 {
		inset: 0;
		backdrop-filter: blur(50px) saturate(180%);
		-webkit-backdrop-filter: blur(50px) saturate(180%);
	}

	/* Layer 1 */
	.lens-1 {
		inset: 1px;
		backdrop-filter: blur(25px) saturate(160%);
		-webkit-backdrop-filter: blur(25px) saturate(160%);
	}

	/* Layer 2 */
	.lens-2 {
		inset: 3px;
		backdrop-filter: blur(12px) saturate(140%);
		-webkit-backdrop-filter: blur(12px) saturate(140%);
	}

	/* Layer 3 */
	.lens-3 {
		inset: 6px;
		backdrop-filter: blur(5px) saturate(120%);
		-webkit-backdrop-filter: blur(5px) saturate(120%);
	}

	/* Layer 4: Innermost */
	.lens-4 {
		inset: 10px;
		backdrop-filter: blur(1px);
		-webkit-backdrop-filter: blur(1px);
	}

	/* Content layer */
	.content {
		position: relative;
		z-index: 10;
		pointer-events: auto;
	}
</style>
