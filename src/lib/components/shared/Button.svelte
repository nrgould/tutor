<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    type?: 'button' | 'submit';
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
    loading?: boolean;
    class?: string;
    onclick?: () => void;
    children: Snippet;
  }

  let {
    type = 'button',
    variant = 'primary',
    size = 'md',
    disabled = false,
    loading = false,
    class: className = '',
    onclick,
    children,
  }: Props = $props();

  const baseClasses =
    'inline-flex items-center justify-center font-medium rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tutor-accent focus-visible:ring-offset-2 focus-visible:ring-offset-tutor-bg disabled:opacity-50 disabled:cursor-not-allowed select-none';

  const variantClasses = {
    primary:
      'bg-tutor-accent text-white hover:bg-tutor-accent-hover active:bg-tutor-accent-hover',
    secondary:
      'bg-tutor-surface-elevated text-tutor-text hover:bg-tutor-border-subtle active:bg-tutor-border',
    ghost:
      'text-tutor-text-secondary hover:text-tutor-text hover:bg-tutor-surface-elevated active:bg-tutor-border',
    danger:
      'bg-tutor-error/10 text-tutor-error hover:bg-tutor-error/20 active:bg-tutor-error/30',
  };

  const sizeClasses = {
    sm: 'px-2.5 py-1.5 text-xs gap-1.5',
    md: 'px-3.5 py-2 text-sm gap-2',
    lg: 'px-5 py-2.5 text-sm gap-2',
  };
</script>

<button
  {type}
  disabled={disabled || loading}
  class="{baseClasses} {variantClasses[variant]} {sizeClasses[size]} {className}"
  onclick={onclick}
>
  {#if loading}
    <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  {/if}
  {@render children()}
</button>
