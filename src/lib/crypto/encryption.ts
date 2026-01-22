/**
 * Encryption Module
 *
 * Provides AES-256-GCM encryption for sensitive user credentials (GitHub tokens, etc.)
 *
 * Security Features:
 * - AES-256-GCM: Military-grade symmetric encryption
 * - Unique IV per encryption: Prevents pattern analysis
 * - Authentication tags: Detects tampering
 * - Key rotation ready: Can add version field for key management
 *
 * Usage:
 * ```typescript
 * // Encrypt
 * const githubToken = "ghp_abc123...";
 * const encrypted = encryptToJSON(githubToken);
 * await supabase.from('credentials').insert({ encrypted_value: encrypted });
 *
 * // Decrypt
 * const { data } = await supabase.from('credentials').select('encrypted_value').single();
 * const plaintext = decryptFromJSON(data.encrypted_value);
 * ```
 */

import crypto from 'crypto';

// Algorithm configuration
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;          // 16 bytes = 128 bits
const AUTH_TAG_LENGTH = 16;    // 16 bytes = 128 bits
const KEY_LENGTH = 32;         // 32 bytes = 256 bits

/**
 * Get encryption key from environment variable
 *
 * ENCRYPTION_KEY must be a 64-character hexadecimal string (32 bytes when decoded)
 * Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * @throws {Error} If ENCRYPTION_KEY is missing or invalid
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;

  if (!key) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is not set. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  if (key.length !== 64) {
    throw new Error(
      `ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). Got ${key.length} characters.`
    );
  }

  // Verify it's valid hex
  if (!/^[0-9a-f]{64}$/i.test(key)) {
    throw new Error('ENCRYPTION_KEY must contain only hexadecimal characters (0-9, a-f)');
  }

  return Buffer.from(key, 'hex');
}

/**
 * Encrypted data structure
 */
interface EncryptedData {
  ciphertext: string;   // Hex-encoded encrypted data
  iv: string;           // Hex-encoded initialization vector
  authTag: string;      // Hex-encoded authentication tag
  version?: number;     // For future key rotation (currently unused)
}

/**
 * Encrypt plaintext and return as JSON string
 *
 * This function:
 * 1. Generates a random IV (initialization vector)
 * 2. Encrypts the plaintext using AES-256-GCM
 * 3. Extracts the authentication tag
 * 4. Returns all components as a JSON string
 *
 * @param plaintext - The sensitive data to encrypt (e.g., GitHub token)
 * @returns JSON string containing ciphertext, IV, and auth tag
 *
 * @example
 * ```typescript
 * const token = "ghp_abc123xyz789";
 * const encrypted = encryptToJSON(token);
 * // Result: '{"ciphertext":"...","iv":"...","authTag":"..."}'
 * ```
 */
export function encryptToJSON(plaintext: string): string {
  const key = getEncryptionKey();

  // Generate a random IV (must be unique for each encryption)
  const iv = crypto.randomBytes(IV_LENGTH);

  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  // Encrypt the plaintext
  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');

  // Get the authentication tag (for tamper detection)
  const authTag = cipher.getAuthTag();

  // Package everything as JSON
  const encryptedData: EncryptedData = {
    ciphertext,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };

  return JSON.stringify(encryptedData);
}

/**
 * Decrypt JSON-encoded encrypted data
 *
 * This function:
 * 1. Parses the JSON to extract ciphertext, IV, and auth tag
 * 2. Creates a decipher with the encryption key
 * 3. Verifies the authentication tag (throws if tampered)
 * 4. Decrypts and returns the plaintext
 *
 * @param encryptedJSON - JSON string from encryptToJSON()
 * @returns The original plaintext
 *
 * @throws {Error} If data has been tampered with (auth tag mismatch)
 * @throws {Error} If decryption fails for any reason
 *
 * @example
 * ```typescript
 * const encrypted = '{"ciphertext":"...","iv":"...","authTag":"..."}';
 * const token = decryptFromJSON(encrypted);
 * // Result: "ghp_abc123xyz789"
 * ```
 */
export function decryptFromJSON(encryptedJSON: string): string {
  const key = getEncryptionKey();

  // Parse the JSON
  let encryptedData: EncryptedData;
  try {
    encryptedData = JSON.parse(encryptedJSON);
  } catch (error) {
    throw new Error(
      `Failed to parse encrypted data as JSON: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  // Validate structure
  if (!encryptedData.ciphertext || !encryptedData.iv || !encryptedData.authTag) {
    throw new Error('Invalid encrypted data: missing required fields (ciphertext, iv, or authTag)');
  }

  // Convert hex strings back to buffers
  const iv = Buffer.from(encryptedData.iv, 'hex');
  const authTag = Buffer.from(encryptedData.authTag, 'hex');

  // Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

  // Set the authentication tag (must be done before calling final())
  decipher.setAuthTag(authTag);

  // Decrypt
  let plaintext: string;
  try {
    plaintext = decipher.update(encryptedData.ciphertext, 'hex', 'utf8');
    plaintext += decipher.final('utf8');
  } catch (error) {
    // This typically means the data was tampered with or wrong key
    throw new Error(
      `Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}. ` +
      'Data may have been tampered with or encryption key is incorrect.'
    );
  }

  return plaintext;
}

/**
 * Test encryption round-trip
 *
 * Useful for verifying ENCRYPTION_KEY is set correctly
 *
 * @returns True if round-trip succeeded, false otherwise
 */
export function testEncryption(): boolean {
  try {
    const testString = 'test-data-' + Date.now();
    const encrypted = encryptToJSON(testString);
    const decrypted = decryptFromJSON(encrypted);
    return testString === decrypted;
  } catch (error) {
    console.error('Encryption test failed:', error);
    return false;
  }
}

/**
 * Generate a new encryption key
 *
 * Run this once to generate a production key:
 * ```bash
 * node -e "console.log(require('./src/lib/crypto/encryption').generateKey())"
 * ```
 *
 * Then add to .env.local:
 * ```
 * ENCRYPTION_KEY=<generated-key-here>
 * ```
 *
 * @returns A 64-character hex string (32 bytes)
 */
export function generateKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
}
