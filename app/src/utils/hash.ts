/**
 * Simple hash function for content comparison
 * Uses a basic string hashing algorithm that's fast and sufficient for change detection
 */
export function hashContent(content: string): string {
  let hash = 0;
  if (content.length === 0) return "0";

  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Convert to hex string for consistency
  return Math.abs(hash).toString(16);
}
