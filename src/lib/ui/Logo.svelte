<script lang="ts">
  let { size = 28, word = false }: { size?: number; word?: boolean } = $props();
</script>

<span class="logo">
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <rect x="1" y="1" width="30" height="30" rx="8" fill="var(--accent)" />
    <path d="M7 13 16 7l9 6v12H7Z" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round" />
    <path d="M10 17h12v8H10zM16 17v8" fill="none" stroke="#fff" stroke-width="1.6" />
  </svg>
  {#if word}<span class="word">OpenKitchen<b>3D</b></span>{/if}
</span>

<style>
  .logo { display: inline-flex; align-items: center; gap: 8px; color: var(--ink); }
  .word { font-weight: 700; font-size: 17px; letter-spacing: -.01em; }
  .word b { color: var(--accent); }
</style>
