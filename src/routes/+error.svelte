<script lang="ts">
  import { page } from '$app/stores';
</script>

<div class="error-page">
  <h1>{$page.status}</h1>
  <p>{$page.error?.message || 'An error occurred'}</p>
</div>

<style>
  .error-page {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    background: #09090b;
    color: #fafafa;
    font-family: 'Satoshi', system-ui, sans-serif;
  }

  h1 {
    font-size: 48px;
    margin: 0 0 8px;
    font-weight: 600;
  }

  p {
    font-size: 14px;
    color: rgba(250, 250, 250, 0.5);
    margin: 0;
  }
</style>
