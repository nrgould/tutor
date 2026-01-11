<script lang="ts">
	/**
	 * LiquidGlassPanel - Flexible glass container for panels like chat
	 *
	 * Similar to LiquidGlassBar but designed for variable-height panels.
	 * Features both top-left and bottom-right shimmer borders.
	 */

	import type { Snippet } from 'svelte';

	interface Props {
		class?: string;
		borderRadius?: number;
		children?: Snippet;
	}

	let { class: className = '', borderRadius = 18, children }: Props = $props();
</script>

<div class="liquid-glass-panel {className}" style="--border-radius: {borderRadius}px">
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
	.liquid-glass-panel {
		position: relative;
		border-radius: var(--border-radius, 18px);
		isolation: isolate;
		overflow: hidden;

		/* Fill layer - dark glass background */
		background: linear-gradient(0deg, rgba(25, 25, 25, 0.95), rgba(25, 25, 25, 0.95)), #191919;
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
	.liquid-glass-panel::before {
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
		border-radius: calc(var(--border-radius, 18px) - 2px);
		z-index: -1;
		pointer-events: none;
	}

	/* Top-left shimmer border */
	.top-shimmer {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 2;
		border-radius: var(--border-radius, 18px);

		/* Shimmer border using gradient */
		background: linear-gradient(
			135deg,
			rgba(255, 255, 255, 0.2) 0%,
			rgba(255, 255, 255, 0.12) 20%,
			rgba(255, 255, 255, 0.06) 45%,
			rgba(255, 255, 255, 0.02) 70%,
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
		border-radius: var(--border-radius, 18px);

		/* Mirror gradient: 315deg = opposite of 135deg, reduced opacity */
		background: linear-gradient(
			315deg,
			rgba(255, 255, 255, 0.1) 0%,
			rgba(255, 255, 255, 0.05) 20%,
			rgba(255, 255, 255, 0.02) 45%,
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
	.liquid-glass-panel::after {
		content: '';
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.001);
		border-radius: var(--border-radius, 18px);
		pointer-events: none;
		z-index: 3;
	}

	/* Content layer */
	.content {
		position: relative;
		z-index: 4;
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	/* Fallback for browsers without backdrop-filter */
	@supports not (backdrop-filter: blur(10px)) {
		.liquid-glass-panel {
			background: rgba(25, 25, 25, 0.98);
		}
	}
</style>
