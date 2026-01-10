<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
	import Button from './shared/Button.svelte';

	let { visible = $bindable(false) } = $props();

	async function openSystemSettings() {
		// Open macOS System Settings to Screen Recording permissions
		try {
			await invoke('open_screen_recording_settings');
		} catch (e) {
			console.error('Failed to open system settings:', e);
		}
		visible = false;
	}
</script>

{#if visible}
	<div class="permission-overlay" onclick={(e) => e.target === e.currentTarget && (visible = false)}>
		<div class="permission-dialog">
			<div class="permission-icon">🔒</div>
			<h2>Screen Recording Permission Required</h2>
			<p>
				Eigen needs screen recording permission to capture your screen and help you study.
			</p>
			<p class="permission-instructions">
				To grant permission:
			</p>
			<ol class="permission-steps">
				<li>Click "Open System Settings" below</li>
				<li>Enable the toggle next to "Eigen" in the list</li>
				<li>Return to Eigen and try recording again</li>
			</ol>
			<div class="permission-actions">
				<Button onclick={openSystemSettings} variant="primary">
					Open System Settings
				</Button>
				<Button onclick={() => (visible = false)} variant="secondary">
					Later
				</Button>
			</div>
		</div>
	</div>
{/if}

<style>
	.permission-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10000;
		backdrop-filter: blur(4px);
	}

	.permission-dialog {
		background: white;
		border-radius: 12px;
		padding: 32px;
		max-width: 500px;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
		animation: slideIn 0.2s ease-out;
	}

	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateY(-20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.permission-icon {
		font-size: 48px;
		text-align: center;
		margin-bottom: 16px;
	}

	h2 {
		margin: 0 0 16px 0;
		font-size: 24px;
		font-weight: 600;
		color: #1a1a1a;
		text-align: center;
	}

	p {
		margin: 0 0 16px 0;
		color: #666;
		line-height: 1.6;
		text-align: center;
	}

	.permission-instructions {
		font-weight: 500;
		color: #333;
		margin-top: 24px;
	}

	.permission-steps {
		margin: 16px 0 24px 0;
		padding-left: 24px;
		color: #666;
		line-height: 1.8;
	}

	.permission-steps li {
		margin-bottom: 8px;
	}

	.permission-actions {
		display: flex;
		gap: 12px;
		justify-content: center;
		margin-top: 24px;
	}
</style>
