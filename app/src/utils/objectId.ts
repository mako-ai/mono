/**
 * Generate a MongoDB ObjectId on the client side
 * Based on the MongoDB ObjectId specification
 */
export function generateObjectId(): string {
  // 4-byte timestamp value in hex (seconds since Unix epoch)
  const timestamp = Math.floor(Date.now() / 1000)
    .toString(16)
    .padStart(8, "0");

  // 5-byte random value (10 hex chars)
  const randomValue = Array.from({ length: 10 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("");

  // 3-byte counter (6 hex chars) - using random for simplicity
  const counter = Array.from({ length: 6 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("");

  return timestamp + randomValue + counter;
}

/**
 * Validate if a string is a valid MongoDB ObjectId
 */
export function isValidObjectId(id: string): boolean {
  if (typeof id !== "string") return false;
  return /^[0-9a-fA-F]{24}$/.test(id);
}

/**
 * Get the timestamp from an ObjectId
 */
export function getTimestampFromObjectId(id: string): Date | null {
  if (!isValidObjectId(id)) return null;
  const timestamp = parseInt(id.substring(0, 8), 16);
  return new Date(timestamp * 1000);
}
