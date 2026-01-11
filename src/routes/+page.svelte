<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { settingsStore } from '$lib/stores/settings';
	import { recordingStore } from '$lib/stores/recording';
	import { invoke } from '@tauri-apps/api/core';
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import { listen } from '@tauri-apps/api/event';
	import {
		getSetting,
		setSetting,
		createConversation,
		saveMessage,
		updateConversation,
		invalidateConversationsCache,
		getMessages,
	} from '$lib/utils/db';
	import {
		streamChat,
		analyzeScreenBatch,
		generateSessionTitle,
		parseSuggestionsFromResponse,
	} from '$lib/utils/api';
	import { parseMarkdown } from '$lib/utils/markdown';
	import { processConversationMemories } from '$lib/services/memoryService';
	import { tryShowNudge } from '$lib/services/nudgeGenerator';
	import { toast } from '$lib/stores/toast';
	import type { Message } from '$lib/types';
	import Onboarding from '$lib/components/Onboarding.svelte';
	import PermissionDialog from '$lib/components/PermissionDialog.svelte';
	import LiquidGlassBar from '$lib/components/shared/LiquidGlassBar.svelte';

	const settings = $derived($settingsStore);

	// UI State
	let inputValue = $state('');
	let isRecording = $state(false);
	let recordingDuration = $state(0);
	let showOnboarding = $state(false);
	let checkingOnboarding = $state(true);
	let showPermissionDialog = $state(false);
	let hasScreenRecordingPermission = $state(true); // Assume granted until checked

	// Chat state
	let showChat = $state(false);
	let currentConversationId = $state<string | null>(null);
	let messages = $state<
		Array<{
			id: string;
			role: 'user' | 'assistant';
			content: string;
			hasScreen?: boolean;
		}>
	>([]);
	let isLoading = $state(false);
	let streamingContent = $state('');
	let suggestions = $state<string[]>([]);

	// Recording state
	let screenshotBuffer = $state<string[]>([]);
	let latestScreenshot = $state<string | null>(null);
	let screenContextHistory = $state<Array<{ time: number; context: string }>>(
		[]
	);
	let watchInterval: ReturnType<typeof setInterval> | null = null;
	let durationInterval: ReturnType<typeof setInterval> | null = null;
	let isProcessingBatch = $state(false);

	const MAX_CONTEXT_HISTORY = 10;
	const BATCH_SIZE = 3;

	// Refs
	let messagesContainer: HTMLDivElement;
	let inputRef: HTMLInputElement;

	const BAR_HEIGHT = 52;
	const CHAT_HEIGHT = 400;

	onMount(() => {
		const init = async () => {
			await settingsStore.load();
			await restoreBarPosition();

			// Initialize recording store to listen to backend events
			await recordingStore.init();

			try {
				const onboardingComplete = await getSetting(
					'onboarding_complete'
				);
				if (!onboardingComplete) {
					showOnboarding = true;
				}
			} catch {
				showOnboarding = true;
			}
			checkingOnboarding = false;
		};

		init();

		const window = getCurrentWindow();
		const unlistenMove = window.onMoved(async (event) => {
			await setSetting('bar_position_x', String(event.payload.x));
			await setSetting('bar_position_y', String(event.payload.y));
		});

		// Listen for load-conversation events from dashboard
		const unlistenConversation = listen<{ conversationId: string }>(
			'load-conversation',
			async (event) => {
				await loadConversation(event.payload.conversationId);
			}
		);

		// Listen for nudge clicks from nudge window
		const unlistenNudge = listen<{
			aiMessage: string;
			suggestions?: string[];
		}>('nudge-clicked', async (event) => {
			await handleNudgeClick(
				event.payload.aiMessage,
				event.payload.suggestions || []
			);
		});

		// Listen to backend recording status changes
		const unlistenRecording = listen<{
			is_recording: boolean;
			session_id?: string;
			screenshot_count: number;
			started_at?: string;
		}>('recording-status', async (event) => {
			const status = event.payload;
			console.log('Recording status event received:', status);
			// Sync frontend state with backend recording state
			if (status.is_recording && !isRecording) {
				console.log('Backend started recording - syncing frontend');
				// Backend started recording - start frontend recording logic
				await startRecording();
				
				// Open chat interface
				if (!showChat) {
					console.log('Opening chat interface');
					showChat = true;
					await resizeWindow(true);
				}
			} else if (!status.is_recording && isRecording) {
				console.log('Backend stopped recording - syncing frontend');
				// Backend stopped recording - stop frontend recording logic
				stopRecording();
			}
		});

		// Listen for explicit recording started event
		const unlistenRecordingStarted = listen('recording-started', async () => {
			console.log('Recording started event received - opening chat');
			if (!showChat) {
				showChat = true;
				await resizeWindow(true);
			}
		});

		// Listen for screenshot captures from backend
		const unlistenScreenshot = listen<{
			id: string;
			session_id: string;
			image_data: string;
			thumbnail_data?: string;
			captured_at: string;
		}>('screenshot-captured', async (event) => {
			console.log('Screenshot captured event received:', event.payload.id);
			// Use the full image from backend recording for AI analysis
			if (event.payload.image_data) {
				latestScreenshot = event.payload.image_data;
				screenshotBuffer = [...screenshotBuffer, event.payload.image_data];
				
				// Process batch when we have enough screenshots
				if (screenshotBuffer.length >= BATCH_SIZE && !isProcessingBatch) {
					console.log('Processing screenshot batch for AI analysis');
					processBatch();
				}
			}
		});

		// Listen for screen recording permission denied event
		const unlistenPermission = listen('screen-recording-permission-denied', () => {
			console.log('Screen recording permission denied - showing dialog');
			hasScreenRecordingPermission = false;
			showPermissionDialog = true;
		});

		// Check permission on startup
		(async () => {
			try {
				const hasPermission = await invoke<boolean>('check_screen_recording_permission');
				hasScreenRecordingPermission = hasPermission;
				if (!hasPermission) {
					console.log('Screen recording permission not granted on startup');
					showPermissionDialog = true;
				}
			} catch (e) {
				console.error('Failed to check screen recording permission:', e);
				hasScreenRecordingPermission = false;
				showPermissionDialog = true;
			}
		})();

		return () => {
			stopRecording();
			unlistenMove.then((fn) => fn());
			unlistenConversation.then((fn) => fn());
			unlistenNudge.then((fn) => fn());
			unlistenRecording.then((fn) => fn());
			unlistenRecordingStarted.then((fn) => fn());
			unlistenScreenshot.then((fn) => fn());
			unlistenPermission.then((fn) => fn());
		};
	});

	async function restoreBarPosition() {
		try {
			const x = await getSetting('bar_position_x');
			const y = await getSetting('bar_position_y');
			const window = getCurrentWindow();
			const { LogicalPosition } = await import('@tauri-apps/api/dpi');

			if (x && y) {
				const posX = parseInt(x);
				const posY = parseInt(y);

				// Validate position is on-screen (basic check)
				// If position seems off-screen, use default centered position
				if (posX >= 0 && posX < 4000 && posY >= 0 && posY < 3000) {
					await window.setPosition(new LogicalPosition(posX, posY));
					return;
				}
			}

			// Default: center horizontally near top of screen
			await window.setPosition(new LogicalPosition(100, 100));
		} catch {
			// Use default position on error
			try {
				const window = getCurrentWindow();
				const { LogicalPosition } = await import('@tauri-apps/api/dpi');
				await window.setPosition(new LogicalPosition(100, 100));
			} catch {
				// Ignore
			}
		}
	}

	async function handleOnboardingComplete(profile: {
		name: string;
		courses: string[];
		goals: string;
	}) {
		await setSetting('onboarding_complete', 'true');
		if (profile.name) await setSetting('user_name', profile.name);
		if (profile.courses.length > 0)
			await setSetting('user_courses', JSON.stringify(profile.courses));
		if (profile.goals) await setSetting('user_goals', profile.goals);
		showOnboarding = false;
	}

	async function toggleRecording() {
		console.log('Toggle recording clicked. Current state:', isRecording);
		if (isRecording) {
			// Stop via backend command, but also immediately update UI
			// The backend event will confirm, but this prevents UI lag
			stopRecording();
			try {
				await invoke('stop_recording');
				console.log('Backend stop recording command sent');
			} catch (e) {
				console.error('Failed to stop recording:', e);
				// If backend fails, UI is already stopped, which is fine
			}
		} else {
			// Check permission before starting
			if (!hasScreenRecordingPermission) {
				console.log('Screen recording permission not granted - showing dialog');
				showPermissionDialog = true;
				return;
			}

			// Verify permission again before starting
			try {
				const hasPermission = await invoke<boolean>('check_screen_recording_permission');
				if (!hasPermission) {
					console.log('Screen recording permission not granted - showing dialog');
					hasScreenRecordingPermission = false;
					showPermissionDialog = true;
					return;
				}
				hasScreenRecordingPermission = true;
			} catch (e) {
				console.error('Failed to check permission:', e);
				showPermissionDialog = true;
				return;
			}

			// Start via backend command with 1 second interval
			try {
				await invoke('start_recording', { intervalSeconds: 1 });
				console.log('Backend start recording command sent');
				// Don't set isRecording here - wait for recording-status event
				// to ensure backend actually started recording
			} catch (e) {
				console.error('Failed to start recording:', e);
				// If error mentions permission, show dialog
				if (String(e).includes('permission') || String(e).includes('Permission')) {
					hasScreenRecordingPermission = false;
					showPermissionDialog = true;
				}
			}
		}
	}

	async function startRecording() {
		if (isRecording) return;
		console.log('Starting frontend recording logic');
		isRecording = true;
		recordingDuration = 0;
		screenshotBuffer = [];

		// Start duration counter only - backend handles screenshot capture
		durationInterval = setInterval(() => {
			recordingDuration++;
		}, 1000);
		
		// Don't start watchInterval - backend will emit screenshot-captured events
		// which we listen to above
	}

	function stopRecording() {
		console.log('Stopping frontend recording logic');
		isRecording = false;
		recordingDuration = 0; // Reset duration when stopping
		const duration = recordingDuration;
		if (watchInterval) {
			clearInterval(watchInterval);
			watchInterval = null;
		}
		if (durationInterval) {
			clearInterval(durationInterval);
			durationInterval = null;
		}
		// Clear screenshot buffer and latest screenshot when stopping
		screenshotBuffer = [];
		latestScreenshot = '';

		// Process memories from any active conversation when stopping recording
		console.log('stopRecording state check:', {
			hasConversationId: !!currentConversationId,
			conversationId: currentConversationId,
			messageCount: messages.length,
			messages: messages.map((m) => ({
				role: m.role,
				contentPreview: m.content.substring(0, 50),
			})),
		});

		if (currentConversationId && messages.length >= 2) {
			console.log('Processing memories on recording stop...');
			const apiMessages: Message[] = messages.map((m) => ({
				id: m.id,
				conversation_id: currentConversationId!,
				role: m.role,
				content: m.content,
				created_at: new Date().toISOString(),
			}));
			processConversationMemories(apiMessages, currentConversationId)
				.then(() =>
					console.log('Memory processing completed successfully')
				)
				.catch((e) => console.error('Memory processing failed:', e));
			invalidateConversationsCache();
		} else {
			console.log(
				'Skipping memory processing - no active conversation or not enough messages'
			);
			if (!currentConversationId) {
				console.log(
					'Hint: You need to chat with the tutor during the session for topics to be tracked'
				);
			}
		}

		// Clear all screen-related state
		latestScreenshot = null;
		screenContextHistory = [];
		screenshotBuffer = [];
		recordingDuration = 0;
		// Show toast notification
		if (duration > 0) {
			toast.success(`Session recorded: ${formatDuration(duration)}`);
		}
	}

	async function processBatch() {
		if (screenshotBuffer.length === 0 || isProcessingBatch) return;

		isProcessingBatch = true;
		const batch = [...screenshotBuffer];
		screenshotBuffer = [];

		try {
			const analysis = await analyzeScreenBatch(batch);
			// Only add to history if still recording (prevents adding after stop)
			if (analysis && isRecording) {
				const newEntry = { time: Date.now(), context: analysis };
				screenContextHistory = [
					...screenContextHistory,
					newEntry,
				].slice(-MAX_CONTEXT_HISTORY);
				console.log('[Screen context]', analysis);

				// Try to generate a proactive nudge (only when not in conversation)
				if (!showChat) {
					const previousContexts = screenContextHistory
						.slice(0, -1)
						.map((e) => e.context);
					tryShowNudge(
						analysis,
						latestScreenshot || undefined,
						previousContexts
					).catch((err) => console.error('[Nudge] Error:', err));
				}
			}
		} catch (error) {
			console.error('Batch analysis failed:', error);
		} finally {
			isProcessingBatch = false;
		}
	}

	function getScreenHistorySummary(): string | null {
		if (screenContextHistory.length === 0) return null;

		const now = Date.now();
		const entries = screenContextHistory.map((entry) => {
			const secsAgo = Math.round((now - entry.time) / 1000);
			return `${secsAgo}s ago: ${entry.context}`;
		});

		return entries.join('\n');
	}

	async function resizeWindow(expanded: boolean) {
		try {
			const window = getCurrentWindow();
			const { LogicalSize } = await import('@tauri-apps/api/dpi');
			const newHeight = expanded ? BAR_HEIGHT + CHAT_HEIGHT : BAR_HEIGHT;
			await window.setSize(new LogicalSize(480, newHeight));
		} catch (error) {
			console.error('Failed to resize window:', error);
		}
	}

	async function scrollToBottom() {
		await tick();
		if (messagesContainer) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	}

	async function focusInput() {
		await tick();
		inputRef?.focus();
	}

	async function handleSend(overrideContent?: string) {
		const content = (overrideContent ?? inputValue).trim();
		if (!content || isLoading) return;

		inputValue = '';
		suggestions = []; // Clear suggestions when sending

		// Capture fresh screenshot immediately when recording
		// This ensures Claude always has the most up-to-date view
		let freshScreenshot: string | null = null;
		if (isRecording) {
			try {
				freshScreenshot = await invoke<string>('capture_screen_silent');
				latestScreenshot = freshScreenshot; // Update the latest screenshot too
			} catch (e) {
				console.error('Failed to capture fresh screenshot:', e);
				// Fall back to existing latestScreenshot if capture fails
				freshScreenshot = latestScreenshot;
			}
		}

		// Use fresh screenshot if available, otherwise fall back to latestScreenshot
		const screenshotToUse = freshScreenshot || latestScreenshot;

		// Create conversation if needed
		if (!currentConversationId) {
			try {
				const conversation = await createConversation(
					content.slice(0, 50)
				);
				currentConversationId = conversation.id;
			} catch (e) {
				console.error('Failed to create conversation:', e);
			}
		}

		const userMessage = {
			id: crypto.randomUUID(),
			role: 'user' as const,
			content,
			hasScreen: !!screenshotToUse,
		};
		messages = [...messages, userMessage];

		// Persist user message
		if (currentConversationId) {
			saveMessage(
				currentConversationId,
				'user',
				content,
				screenshotToUse ? { screenshot: screenshotToUse } : undefined
			).catch(console.error);
		}

		if (!showChat) {
			showChat = true;
			await resizeWindow(true);
		}

		await scrollToBottom();
		await focusInput();

		isLoading = true;
		streamingContent = '';

		try {
			const apiMessages: Message[] = messages.map((m) => ({
				id: m.id,
				conversation_id: currentConversationId || '',
				role: m.role,
				content: m.content,
				created_at: new Date().toISOString(),
				screen_context:
					m.id === userMessage.id && screenshotToUse
						? { screenshot: screenshotToUse }
						: undefined,
			}));

			const context = {
				screenHistory: getScreenHistorySummary() || undefined,
				socraticMode: settings.socratic_mode,
			};

			for await (const chunk of streamChat(apiMessages, context)) {
				streamingContent += chunk;
				await scrollToBottom();
			}

			// Parse and extract suggestions from the response
			const { cleanedResponse, suggestions: extractedSuggestions } =
				parseSuggestionsFromResponse(streamingContent);
			suggestions = extractedSuggestions;

			const assistantMessage = {
				id: crypto.randomUUID(),
				role: 'assistant' as const,
				content: cleanedResponse,
			};
			messages = [...messages, assistantMessage];

			// Persist assistant message (without suggestions marker)
			if (currentConversationId) {
				saveMessage(
					currentConversationId,
					'assistant',
					cleanedResponse
				).catch(console.error);

				// Generate title after first exchange (2 messages: user + assistant)
				if (messages.length === 2) {
					generateSessionTitle(content, cleanedResponse)
						.then((title) => {
							if (title && currentConversationId) {
								updateConversation(currentConversationId, {
									title,
								}).catch(console.error);
								invalidateConversationsCache();
							}
						})
						.catch(console.error);
				}
			}

			streamingContent = '';
		} catch (error) {
			const errorContent = `Error: ${error instanceof Error ? error.message : 'Failed to get response'}`;
			messages = [
				...messages,
				{
					id: crypto.randomUUID(),
					role: 'assistant',
					content: errorContent,
				},
			];
			toast.error(
				error instanceof Error
					? error.message
					: 'Failed to get response'
			);
		} finally {
			isLoading = false;
			await scrollToBottom();
			await focusInput();
		}
	}

	async function closeChat() {
		// Process memories from the conversation before closing (at least one exchange)
		if (currentConversationId && messages.length >= 2) {
			console.log('Processing memories on chat close:', {
				messageCount: messages.length,
				conversationId: currentConversationId,
			});
			const apiMessages: Message[] = messages.map((m) => ({
				id: m.id,
				conversation_id: currentConversationId!,
				role: m.role,
				content: m.content,
				created_at: new Date().toISOString(),
			}));
			processConversationMemories(apiMessages, currentConversationId)
				.then(() =>
					console.log('Memory processing completed on chat close')
				)
				.catch((e) =>
					console.error('Memory processing failed on chat close:', e)
				);
			invalidateConversationsCache();
		}

		// Clear state for next session
		currentConversationId = null;
		messages = [];
		latestScreenshot = null;
		screenContextHistory = [];
		suggestions = [];

		showChat = false;
		await resizeWindow(false);
	}

	async function startNewChat() {
		// Process memories from previous conversation (at least one exchange)
		if (currentConversationId && messages.length >= 2) {
			console.log('Processing memories on new chat:', {
				messageCount: messages.length,
				conversationId: currentConversationId,
			});
			const apiMessages: Message[] = messages.map((m) => ({
				id: m.id,
				conversation_id: currentConversationId!,
				role: m.role,
				content: m.content,
				created_at: new Date().toISOString(),
			}));
			processConversationMemories(apiMessages, currentConversationId)
				.then(() =>
					console.log('Memory processing completed on new chat')
				)
				.catch((e) =>
					console.error('Memory processing failed on new chat:', e)
				);
			invalidateConversationsCache();
		}

		// Reset for new conversation
		currentConversationId = null;
		messages = [];
		streamingContent = '';
		suggestions = [];
		latestScreenshot = null;
		screenContextHistory = []; // Clear old screen context history
		focusInput();
	}

	async function handleNudgeClick(
		aiMessage: string,
		nudgeSuggestions: string[] = []
	) {
		// Create a new conversation if needed
		if (!currentConversationId) {
			try {
				const conversation =
					await createConversation('Tutor Suggestion');
				currentConversationId = conversation.id;
			} catch (e) {
				console.error('Failed to create conversation for nudge:', e);
				return;
			}
		}

		// Add the AI's proactive message
		const assistantMessage = {
			id: crypto.randomUUID(),
			role: 'assistant' as const,
			content: aiMessage,
		};
		messages = [assistantMessage];

		// Set quick reply suggestions
		suggestions = nudgeSuggestions;

		// Save the message
		if (currentConversationId) {
			saveMessage(currentConversationId, 'assistant', aiMessage).catch(
				console.error
			);
		}

		// Open the chat panel
		if (!showChat) {
			showChat = true;
			await resizeWindow(true);
		}

		await focusInput();
	}

	async function loadConversation(conversationId: string) {
		try {
			// Load messages for this conversation
			const savedMessages = await getMessages(conversationId);

			// Convert to local message format
			messages = savedMessages.map((m) => ({
				id: m.id,
				role: m.role,
				content: m.content,
				hasScreen: !!m.screen_context?.screenshot,
			}));

			currentConversationId = conversationId;
			suggestions = []; // Clear suggestions when loading a different conversation

			// Show chat and expand window
			showChat = true;
			const window = getCurrentWindow();
			await window.setSize(
				new (await import('@tauri-apps/api/dpi')).LogicalSize(
					480,
					BAR_HEIGHT + CHAT_HEIGHT
				)
			);

			await tick();
			scrollToBottom();
			focusInput();
		} catch (error) {
			console.error('Failed to load conversation:', error);
			toast.error('Failed to load conversation');
		}
	}

	async function openDashboard() {
		const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
		const existing = await WebviewWindow.getByLabel('dashboard');
		if (existing) {
			await existing.show();
			await existing.setFocus();
			return;
		}
		new WebviewWindow('dashboard', {
			url: '/dashboard',
			title: 'Eigen',
			width: 900,
			height: 700,
			resizable: true,
			decorations: false,
			center: true,
		});
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
		if (e.key === 'Escape' && showChat) {
			closeChat();
		}
	}

	function handleSuggestionClick(suggestion: string) {
		handleSend(suggestion);
	}

	async function startDrag(e: MouseEvent) {
		if (e.button !== 0) return;
		const target = e.target as HTMLElement;
		if (
			target.closest('button') ||
			target.closest('input') ||
			target.closest('.messages')
		)
			return;

		try {
			const window = getCurrentWindow();
			await window.startDragging();
		} catch (error) {
			console.error('Failed to start dragging:', error);
		}
	}

	function formatDuration(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	async function toggleSocraticMode() {
		const newValue = !settings.socratic_mode;
		await settingsStore.save('socratic_mode', newValue.toString());
		toast.info(
			newValue
				? "Socratic mode on - I'll guide you with questions"
				: 'Socratic mode off - Direct explanations'
		);
	}
</script>

<div class="window-wrapper">
	<div
		class="container"
		onmousedown={startDrag}
		role="application"
		aria-label="Eigen"
	>
		<!-- Main bar -->
		<LiquidGlassBar class="bar-glass">
			<div class="bar-inner">
			<button
				class="record-btn"
				class:recording={isRecording}
				onclick={toggleRecording}
				title={isRecording ? 'Stop recording' : 'Start recording'}
				aria-label={isRecording ? 'Stop recording' : 'Start recording'}
			>
				{#if isRecording}
					<span class="rec-indicator">
						<span class="rec-dot"></span>
						<span class="rec-time"
							>{formatDuration(recordingDuration)}</span
						>
					</span>
				{:else}
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="currentColor"
					>
						<circle cx="12" cy="12" r="8" />
					</svg>
				{/if}
			</button>

			{#if !showChat}
				<div class="input-wrapper">
					<input
						type="text"
						bind:value={inputValue}
						bind:this={inputRef}
						placeholder="Ask anything..."
						onkeydown={handleKeydown}
					/>
					<span class="shortcut">Return</span>
				</div>

				<button
					class="icon-btn"
					onclick={openDashboard}
					title="Dashboard"
					aria-label="Dashboard"
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
					>
						<rect x="3" y="3" width="7" height="7" rx="1" />
						<rect x="14" y="3" width="7" height="7" rx="1" />
						<rect x="3" y="14" width="7" height="7" rx="1" />
						<rect x="14" y="14" width="7" height="7" rx="1" />
					</svg>
				</button>
			{:else}
				<div class="bar-info">
					{#if isRecording && latestScreenshot}
						<span class="screen-badge">Screen active</span>
					{/if}
					<button
						class="mode-toggle"
						class:active={settings.socratic_mode}
						onclick={toggleSocraticMode}
						title={settings.socratic_mode
							? 'Socratic mode: Guiding with questions'
							: 'Direct mode: Clear explanations'}
					>
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
						>
							<circle cx="12" cy="12" r="10" />
							<path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
							<circle
								cx="12"
								cy="17"
								r="0.5"
								fill="currentColor"
							/>
						</svg>
						<span
							>{settings.socratic_mode
								? 'Socratic'
								: 'Direct'}</span
						>
					</button>
				</div>

				<div class="bar-actions">
					{#if messages.length > 0}
						<button
							class="icon-btn"
							onclick={startNewChat}
							title="New chat"
							aria-label="New chat"
						>
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<path d="M12 5v14m-7-7h14" />
							</svg>
						</button>
					{/if}
					<button
						class="icon-btn"
						onclick={closeChat}
						title="Close"
						aria-label="Close chat"
					>
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<path d="M18 6L6 18M6 6l12 12" />
						</svg>
					</button>
				</div>
			{/if}
			</div>
		</LiquidGlassBar>

		<!-- Chat panel -->
		{#if showChat}
			<div class="chat-panel">
				<div class="messages" bind:this={messagesContainer}>
					{#if messages.length === 0 && !isLoading}
						<div class="empty-state">
							<p>Ask a question to start</p>
						</div>
					{:else}
						{#each messages as message (message.id)}
							<div class="message-row {message.role}">
								<div class="message {message.role}">
									{#if message.role === 'user'}
										{message.content}
									{:else}
										<div class="markdown-content">
											{@html parseMarkdown(
												message.content
											)}
										</div>
									{/if}
								</div>
							</div>
						{/each}

						{#if isLoading && streamingContent}
							<div class="message-row assistant">
								<div class="message assistant">
									<div class="markdown-content">
										{@html parseMarkdown(streamingContent)}
									</div>
								</div>
							</div>
						{:else if isLoading}
							<div class="message-row assistant">
								<div class="message assistant typing">
									<span class="dot"></span>
									<span class="dot"></span>
									<span class="dot"></span>
								</div>
							</div>
						{/if}
					{/if}
				</div>

				<!-- Suggestion pills -->
				{#if suggestions.length > 0 && !isLoading}
					<div class="suggestions">
						{#each suggestions as suggestion}
							<button
								class="suggestion-pill"
								onclick={() =>
									handleSuggestionClick(suggestion)}
							>
								{suggestion}
							</button>
						{/each}
					</div>
				{/if}

				<div class="chat-input">
					<input
						type="text"
						bind:value={inputValue}
						bind:this={inputRef}
						placeholder="Message..."
						onkeydown={handleKeydown}
						disabled={isLoading}
					/>
					<button
						class="send-btn"
						onclick={() => handleSend()}
						disabled={!inputValue.trim() || isLoading}
						aria-label="Send"
					>
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<path d="M5 12h14M12 5l7 7-7 7" />
						</svg>
					</button>
				</div>
			</div>
		{/if}
	</div>
</div>

{#if showOnboarding && !checkingOnboarding}
	<Onboarding oncomplete={handleOnboardingComplete} />
	<PermissionDialog bind:visible={showPermissionDialog} />
{/if}

<style>
	:global(*) {
		box-sizing: border-box;
	}

	:global(*:focus) {
		outline: none !important;
	}

	:global(body) {
		margin: 0;
		padding: 0;
		background: transparent !important;
		background-color: transparent !important;
		font-family:
			'Satoshi',
			-apple-system,
			BlinkMacSystemFont,
			system-ui,
			sans-serif;
		-webkit-font-smoothing: antialiased;
		border: none !important;
		outline: none !important;
	}

	:global(html) {
		background: transparent !important;
		background-color: transparent !important;
		border: none !important;
		outline: none !important;
	}

	.window-wrapper {
		width: 100%;
		height: 100%;
		background: transparent !important;
		background-color: transparent !important;
		overflow: hidden;
		position: relative;
	}

	.container {
		display: flex;
		flex-direction: column;
		height: 100%;
		cursor: grab;
		background: transparent !important;
		background-color: transparent !important;
		overflow: hidden;
		position: relative;
		border: none;
		outline: none;
		box-shadow: none;
	}

	.container:active {
		cursor: grabbing;
	}

	.container:focus {
		outline: none;
		border: none;
	}

	/* Liquid Glass Bar Wrapper */
	:global(.bar-glass) {
		height: 52px;
		min-height: 52px;
		border: none !important;
		outline: none !important;
		box-shadow: none !important;
	}

	/* Bar Inner Content */
	.bar-inner {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		height: 52px;
		min-height: 52px;
		position: relative;
		z-index: 1;
	}

	/* Record button - Liquid Glass effect */
	.record-btn {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 8px;
		min-width: 36px;
		height: 36px;
		border-radius: 1000px;
		border: none;
		isolation: isolate;
		outline: none;
		overflow: hidden;

		/* Fill layer with plus-darker blend */
		background: linear-gradient(0deg, rgba(55, 55, 58, 0.9), rgba(55, 55, 58, 0.9)),
			linear-gradient(0deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.15)),
			#1a1a1a;
		background-blend-mode: plus-darker, normal, color-dodge;

		/* Subtle inner glow at top */
		box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.2);

		color: #ef4444;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	/* Blur layer */
	.record-btn::before {
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
	.record-btn::after {
		content: '';
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.001);
		border-radius: 1000px;
		pointer-events: none;
	}

	.record-btn:hover {
		background: linear-gradient(0deg, rgba(65, 65, 68, 0.95), rgba(65, 65, 68, 0.95)),
			linear-gradient(0deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.2)),
			#1a1a1a;
		background-blend-mode: plus-darker, normal, color-dodge;
		box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.3);
	}

	.record-btn.recording {
		background: linear-gradient(0deg, rgba(239, 68, 68, 0.15), rgba(239, 68, 68, 0.15)),
			linear-gradient(0deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.1)),
			#1a1a1a;
		background-blend-mode: plus-darker, normal, color-dodge;
		padding: 8px 12px;
	}

	.rec-indicator {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.rec-dot {
		width: 8px;
		height: 8px;
		background: #ef4444;
		border-radius: 50%;
		animation: pulse 1.2s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.4;
		}
	}

	.rec-time {
		font-size: 13px;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		color: #ef4444;
	}

	/* Input */
	.input-wrapper {
		flex: 1;
		position: relative;
	}

	.input-wrapper input {
		position: relative;
		width: 100%;
		padding: 9px 70px 9px 14px;
		border-radius: 14px;
		border: none;

		/* Fill layer with blend mode */
		background: linear-gradient(
				0deg,
				rgba(245, 245, 245, 0.08),
				rgba(245, 245, 245, 0.08)
			),
			rgba(38, 38, 38, 0.4);
		background-blend-mode: normal, color-dodge;

		/* Backdrop blur for glass */
		backdrop-filter: blur(40px);
		-webkit-backdrop-filter: blur(40px);

		/* Glass shine overlay */
		box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.15);

		color: #fafafa;
		font-size: 14px;
		outline: none;
		transition: all 0.2s ease;
	}

	.input-wrapper input::placeholder {
		color: rgba(250, 250, 250, 0.4);
	}

	.input-wrapper input:focus {
		background: linear-gradient(
				0deg,
				rgba(245, 245, 245, 0.12),
				rgba(245, 245, 245, 0.12)
			),
			rgba(38, 38, 38, 0.4);
		box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.25);
	}

	.shortcut {
		position: absolute;
		right: 12px;
		top: 50%;
		transform: translateY(-50%);
		font-size: 11px;
		color: rgba(250, 250, 250, 0.3);
		pointer-events: none;
	}

	/* Bar info */
	.bar-info {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.screen-badge {
		position: relative;
		padding: 6px 12px;
		border-radius: 1000px;
		border: none;
		isolation: isolate;
		outline: none;
		overflow: hidden;

		/* Fill layer with plus-darker blend and green tint */
		background: linear-gradient(0deg, rgba(34, 197, 94, 0.15), rgba(34, 197, 94, 0.15)),
			linear-gradient(0deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.12)),
			#1a1a1a;
		background-blend-mode: plus-darker, normal, color-dodge;

		/* Subtle inner glow at top */
		box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.15);

		font-size: 12px;
		font-weight: 500;
		color: #22c55e;
	}

	/* Blur layer for screen-badge */
	.screen-badge::before {
		content: '';
		position: absolute;
		left: 3px;
		right: 3px;
		top: 3px;
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

	/* Glass effect layer for screen-badge */
	.screen-badge::after {
		content: '';
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.001);
		border-radius: 1000px;
		pointer-events: none;
	}

	.mode-toggle {
		position: relative;
		display: flex;
		align-items: center;
		gap: 5px;
		padding: 6px 12px;
		border-radius: 1000px;
		border: none;
		isolation: isolate;
		outline: none;
		overflow: hidden;

		/* Fill layer with plus-darker blend */
		background: linear-gradient(0deg, rgba(55, 55, 58, 0.9), rgba(55, 55, 58, 0.9)),
			linear-gradient(0deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.15)),
			#1a1a1a;
		background-blend-mode: plus-darker, normal, color-dodge;

		/* Subtle inner glow at top */
		box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.2);

		font-size: 11px;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.6);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	/* Blur layer */
	.mode-toggle::before {
		content: '';
		position: absolute;
		left: 3px;
		right: 3px;
		top: 3px;
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
	.mode-toggle::after {
		content: '';
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.001);
		border-radius: 1000px;
		pointer-events: none;
	}

	.mode-toggle:hover {
		color: rgba(255, 255, 255, 0.8);
		background: linear-gradient(0deg, rgba(65, 65, 68, 0.95), rgba(65, 65, 68, 0.95)),
			linear-gradient(0deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.2)),
			#1a1a1a;
		background-blend-mode: plus-darker, normal, color-dodge;
		box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.3);
	}

	.mode-toggle.active {
		background: linear-gradient(0deg, rgba(147, 51, 234, 0.15), rgba(147, 51, 234, 0.15)),
			linear-gradient(0deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.12)),
			#1a1a1a;
		background-blend-mode: plus-darker, normal, color-dodge;
		color: #a855f7;
	}

	.bar-actions {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	/* Icon button - Liquid Glass effect */
	.icon-btn {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		padding: 0;
		border-radius: 1000px;
		border: none;
		isolation: isolate;
		outline: none;
		overflow: hidden;

		/* Fill layer with plus-darker blend */
		background: linear-gradient(0deg, rgba(55, 55, 58, 0.9), rgba(55, 55, 58, 0.9)),
			linear-gradient(0deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.15)),
			#1a1a1a;
		background-blend-mode: plus-darker, normal, color-dodge;

		/* Subtle inner glow at top */
		box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.2);

		color: rgba(250, 250, 250, 0.6);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	/* Blur layer */
	.icon-btn::before {
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
	.icon-btn::after {
		content: '';
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.001);
		border-radius: 1000px;
		pointer-events: none;
	}

	.icon-btn:hover {
		color: #fafafa;
		background: linear-gradient(0deg, rgba(65, 65, 68, 0.95), rgba(65, 65, 68, 0.95)),
			linear-gradient(0deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.2)),
			#1a1a1a;
		background-blend-mode: plus-darker, normal, color-dodge;
		box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.3);
	}

	/* Chat panel */
	.chat-panel {
		display: flex;
		flex-direction: column;
		flex: 1;
		background: rgba(9, 9, 11, 0.92);
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 14px;
		overflow: hidden;
	}

	/* Messages */
	.messages {
		flex: 1;
		overflow-y: auto;
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.messages::-webkit-scrollbar {
		width: 5px;
	}

	.messages::-webkit-scrollbar-track {
		background: transparent;
	}

	.messages::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.1);
		border-radius: 3px;
	}

	.empty-state {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.empty-state p {
		color: rgba(250, 250, 250, 0.35);
		font-size: 13px;
		margin: 0;
	}

	/* Messages */
	.message-row {
		display: flex;
	}

	.message-row.user {
		justify-content: flex-end;
	}

	.message-row.assistant {
		justify-content: flex-start;
	}

	.message {
		max-width: 85%;
		padding: 10px 14px;
		border-radius: 14px;
		font-size: 13px;
		line-height: 1.5;
	}

	.message.user {
		background: #fafafa;
		color: #09090b;
		border-bottom-right-radius: 4px;
	}

	.message.assistant {
		background: rgba(255, 255, 255, 0.08);
		color: rgba(250, 250, 250, 0.95);
		border-bottom-left-radius: 4px;
	}

	/* Typing */
	.message.typing {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 14px 18px;
	}

	.dot {
		width: 6px;
		height: 6px;
		background: rgba(250, 250, 250, 0.4);
		border-radius: 50%;
		animation: bounce 1.4s ease-in-out infinite;
	}

	.dot:nth-child(1) {
		animation-delay: 0s;
	}
	.dot:nth-child(2) {
		animation-delay: 0.15s;
	}
	.dot:nth-child(3) {
		animation-delay: 0.3s;
	}

	@keyframes bounce {
		0%,
		60%,
		100% {
			transform: translateY(0);
		}
		30% {
			transform: translateY(-3px);
		}
	}

	/* Chat input */
	.chat-input {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
	}

	.chat-input input {
		flex: 1;
		padding: 10px 14px;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 10px;
		color: #fafafa;
		font-size: 14px;
		outline: none;
		transition: border-color 0.15s;
	}

	.chat-input input::placeholder {
		color: rgba(250, 250, 250, 0.4);
	}

	.chat-input input:focus {
		border-color: rgba(255, 255, 255, 0.2);
	}

	.chat-input input:disabled {
		opacity: 0.5;
	}

	.send-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		padding: 0;
		background: #fafafa;
		border: none;
		border-radius: 8px;
		color: #09090b;
		cursor: pointer;
		transition: opacity 0.15s;
	}

	.send-btn:hover:not(:disabled) {
		opacity: 0.9;
	}

	.send-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	/* Markdown */
	.markdown-content {
		color: rgba(250, 250, 250, 0.95);
	}

	.markdown-content :global(p) {
		margin: 0 0 8px;
	}

	.markdown-content :global(p:last-child) {
		margin-bottom: 0;
	}

	.markdown-content :global(strong) {
		font-weight: 600;
	}

	.markdown-content :global(code) {
		padding: 2px 5px;
		background: rgba(0, 0, 0, 0.3);
		border-radius: 4px;
		font-family: 'SF Mono', Monaco, monospace;
		font-size: 12px;
	}

	.markdown-content :global(pre) {
		margin: 8px 0;
		padding: 10px;
		background: rgba(0, 0, 0, 0.3);
		border-radius: 8px;
		overflow-x: auto;
	}

	.markdown-content :global(pre code) {
		padding: 0;
		background: transparent;
	}

	.markdown-content :global(ul),
	.markdown-content :global(ol) {
		margin: 6px 0;
		padding-left: 18px;
	}

	.markdown-content :global(li) {
		margin: 3px 0;
	}

	.markdown-content :global(a) {
		color: #60a5fa;
		text-decoration: none;
	}

	/* Suggestions */
	.suggestions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		padding: 8px 12px;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
	}

	.suggestion-pill {
		padding: 6px 12px;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		color: rgba(250, 250, 250, 0.8);
		font-size: 12px;
		cursor: pointer;
		transition:
			background 0.15s,
			border-color 0.15s,
			color 0.15s;
	}

	.suggestion-pill:hover {
		background: rgba(255, 255, 255, 0.12);
		border-color: rgba(255, 255, 255, 0.2);
		color: #fafafa;
	}
</style>
