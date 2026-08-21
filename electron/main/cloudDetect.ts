export function isCloudOnly(stats: { size: number; blocks: number }): boolean {
  if (stats.size === 0) return false
  const allocatedBytes = stats.blocks * 512
  return allocatedBytes < stats.size * 0.5
}
