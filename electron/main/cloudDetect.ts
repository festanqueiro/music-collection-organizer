// `blocks` can be missing (it isn't a Windows concept in every Node build):
// then there's nothing to go on, and the file counts as local.
export function isCloudOnly(stats: { size: number; blocks?: number }): boolean {
  if (stats.size === 0 || stats.blocks === undefined) return false
  const allocatedBytes = stats.blocks * 512
  return allocatedBytes < stats.size * 0.5
}
