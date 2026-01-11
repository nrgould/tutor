<script lang="ts">
	/**
	 * LiquidGlassButtonGroup - Pill container for grouped icon buttons
	 *
	 * Groups multiple icon buttons into a single liquid glass pill.
	 * Child buttons should use the 'group-icon-btn' class for proper styling.
	 * When active=false, shows flat #292929 background without effects.
	 */

	import type { Snippet } from 'svelte';

	interface Props {
		class?: string;
		active?: boolean;
		children?: Snippet;
	}

	let { class: className = '', active = true, children }: Props = $props();
</script>

<div class="liquid-glass-button-group {className}" class:active class:inactive={!active}>
	<!-- Top-left shimmer overlay -->
	<div class="top-shimmer"></div>
	<!-- Bottom-right shimmer overlay (subtler) -->
	<div class="bottom-shimmer"></div>

	<!-- Content -->
	<div class="group-content">
		{@render children?.()}
	</div>
</div>

<style>
	.liquid-glass-button-group {
		position: relative;
		display: flex;
		align-items: center;
		border-radius: 1000px;
		isolation: isolate;
		overflow: hidden;
		padding: 4px;

		/* Fill layer with plus-darker blend */
		background: linear-gradient(0deg, rgba(55, 55, 58, 0.9), rgba(55, 55, 58, 0.9)),
			linear-gradient(0deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.15)),
			#272727;
		background-blend-mode: plus-darker, normal, color-dodge;

		/* Subtle inner glow at top */
		box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.2);
	}

	/* Blur layer */
	.liquid-glass-button-group::before {
		content: '';
		position: absolute;
		left: 3px;
		right: 3px;
		top: 4px;
		bottom: 2px;
		background: rgba(0, 0, 0, 0.1);
		background-blend-mode: hard-light;
		filter: blur(10px);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border-radius: 1000px;
		z-index: -1;
		opacity: 0.67;
	}

	/* Glass effect layer */
	.liquid-glass-button-group::after {
		content: '';
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.001);
		border-radius: 1000px;
		pointer-events: none;
	}

	/* Top-left shimmer border */
	.top-shimmer {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 2;
		border-radius: 1000px;

		background: linear-gradient(
			135deg,
			rgba(255, 255, 255, 0.25) 0%,
			rgba(255, 255, 255, 0.15) 20%,
			rgba(255, 255, 255, 0.08) 45%,
			rgba(255, 255, 255, 0.03) 70%,
			transparent 90%
		);

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

	/* Bottom-right shimmer border (subtler) */
	.bottom-shimmer {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 2;
		border-radius: 1000px;

		background: linear-gradient(
			315deg,
			rgba(255, 255, 255, 0.12) 0%,
			rgba(255, 255, 255, 0.06) 20%,
			rgba(255, 255, 255, 0.03) 45%,
			rgba(255, 255, 255, 0.01) 70%,
			transparent 90%
		);

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

	/* Content container */
	.group-content {
		position: relative;
		z-index: 4;
		display: flex;
		align-items: center;
		gap: 2px;
	}

	/* Individual icon buttons inside the group */
	.group-content :global(.group-icon-btn) {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		border: none;
		border-radius: 1000px;
		background: transparent;
		color: rgba(250, 250, 250, 0.6);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.group-content :global(.group-icon-btn:hover) {
		background: rgba(255, 255, 255, 0.1);
		color: #fafafa;
	}

	.group-content :global(.group-icon-btn:active) {
		background: rgba(255, 255, 255, 0.15);
	}

	/* Inactive state - flat background, no effects */
	.liquid-glass-button-group.inactive {
		background: #292929;
		box-shadow: none;
	}

	.liquid-glass-button-group.inactive::before {
		opacity: 0;
	}

	.liquid-glass-button-group.inactive .top-shimmer,
	.liquid-glass-button-group.inactive .bottom-shimmer {
		opacity: 0;
	}
</style>
