<script lang="ts">
  interface Props {
    type?: 'text' | 'password' | 'email';
    value?: string;
    placeholder?: string;
    disabled?: boolean;
    class?: string;
    oninput?: (e: Event) => void;
    onkeydown?: (e: KeyboardEvent) => void;
  }

  let {
    type = 'text',
    value = $bindable(''),
    placeholder = '',
    disabled = false,
    class: className = '',
    oninput,
    onkeydown,
  }: Props = $props();
</script>

<input
  {type}
  bind:value
  {placeholder}
  {disabled}
  class="w-full px-3 py-2 text-sm rounded-lg border border-tutor-border bg-tutor-surface text-tutor-text
    placeholder:text-tutor-text-secondary
    focus:outline-none focus:ring-2 focus:ring-tutor-accent focus:border-transparent
    disabled:opacity-50 disabled:cursor-not-allowed
    {className}"
  oninput={oninput}
  onkeydown={onkeydown}
/>
