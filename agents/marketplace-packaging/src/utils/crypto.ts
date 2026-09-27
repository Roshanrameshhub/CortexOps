/**
 * Cryptographic utilities for Marketplace Packaging Agent
 *
 * Used for generating checksums and hashes.
 */

import { createHash, randomUUID } from 'crypto';

/**
 * Generate SHA-256 hash of data
 */
export function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Generate SHA-256 hash of an object (JSON serialized)
 */
export function hashObject(obj: unknown): string {
  // Sort keys for deterministic hashing
  const json = JSON.stringify(obj, Object.keys(obj as object).sort());
  return sha256(json);
}

/**
 * Generate a new UUID v4
 */
export function generateUUID(): string {
  return randomUUID();
}

/**
 * Verify checksum matches expected value
 */
export function verifyChecksum(data: string | Buffer, expected: string): boolean {
  return sha256(data) === expected;
}
