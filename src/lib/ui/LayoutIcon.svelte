<script lang="ts">
  import type { LayoutKind } from '../layout/templates';
  let { kind, size = 44 }: { kind: LayoutKind; size?: number } = $props();
  const runs: Record<LayoutKind, string[]> = {
    'one-wall': ['M6 6H38V13H6Z'],
    galley: ['M6 6H38V13H6Z', 'M6 31H38V38H6Z'],
    l: ['M6 6H38V13H6Z', 'M31 13H38V38H31Z'],
    u: ['M6 6H38V13H6Z', 'M6 13H13V38H6Z', 'M31 13H38V38H31Z'],
    island: ['M6 6H38V13H6Z', 'M31 13H38V38H31Z', 'M11 22H25V29H11Z'],
    empty: []
  };
</script>

<svg width={size} height={size} viewBox="0 0 44 44" aria-hidden="true">
  <rect x="3" y="3" width="38" height="38" fill="none" stroke="currentColor" stroke-width="2" opacity=".5" />
  {#each runs[kind] as d}<path {d} fill="var(--accent)" opacity=".85" />{/each}
</svg>
