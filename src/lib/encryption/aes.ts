import crypto from 'crypto';

// Algorithm: AES-256-GCM (Galois/Counter Mode)
// - AES-256: Military-grade encryption, 256-bit key
// - GCM: Authenticated encryption - detects tampering
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 16 bytes = 128 bits
const AUTH_TAG_LENGTH = 16; // 16 bytes = 128 bits

/**
 * Get the encryption key from environment variables
 * The key must be 32 bytes (64 hex characters)
 */
function getEncryptionKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY;

  if (!keyHex) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }

  if (keyHex.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }

  return Buffer.from(keyHex, 'hex');
}

/**
 * Structure for encrypted data
 */
export interface EncryptedData {
  ciphertext: string;  // Hex-encoded encrypted data
  iv: string;          // Hex-encoded initialization vector
  authTag: string;     // Hex-encoded authentication tag
}

/**
 * Encrypt a plaintext string using AES-256-GCM
 *
 * @param plaintext - The string to encrypt (e.g., API key)
 * @returns EncryptedData object with ciphertext, IV, and auth tag
 *
 * @example
 * const encrypted = encrypt('sk-1234567890abcdef');
 * // Store encrypted.ciphertext, encrypted.iv, and encrypted.authTag in database
 */
export function encrypt(plaintext: string): EncryptedData {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Plaintext must be a non-empty string');
  }

  const key = getEncryptionKey();

  // Generate random IV (Initialization Vector)
  // CRITICAL: Never reuse the same IV with the same key!
  const iv = crypto.randomBytes(IV_LENGTH);

  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  // Encrypt the plaintext
  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');

  // Get authentication tag (verifies data hasn't been tampered with)
  const authTag = cipher.getAuthTag();

  return {
    ciphertext,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

/**
 * Decrypt an EncryptedData object back to plaintext
 *
 * @param encrypted - The EncryptedData object to decrypt
 * @returns The original plaintext string
 * @throws Error if decryption fails (wrong key, tampered data, etc.)
 *
 * @example
 * const encrypted = { ciphertext: '...', iv: '...', authTag: '...' };
 * const apiKey = decrypt(encrypted);
 */
export function decrypt(encrypted: EncryptedData): string {
  if (!encrypted || !encrypted.ciphertext || !encrypted.iv || !encrypted.authTag) {
    throw new Error('Invalid encrypted data: missing required fields');
  }

  const key = getEncryptionKey();

  // Convert hex strings back to buffers
  const iv = Buffer.from(encrypted.iv, 'hex');
  const authTag = Buffer.from(encrypted.authTag, 'hex');

  // Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

  // Set auth tag (must be done before decryption)
  decipher.setAuthTag(authTag);

  // Decrypt
  let plaintext = decipher.update(encrypted.ciphertext, 'hex', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}

/**
 * Encrypt a value and return it as a JSON string
 * Useful for storing in a TEXT column in the database
 *
 * @param plaintext - The string to encrypt
 * @returns JSON string of encrypted data
 */
export function encryptToJSON(plaintext: string): string {
  const encrypted = encrypt(plaintext);
  return JSON.stringify(encrypted);
}

/**
 * Decrypt a JSON string back to plaintext
 *
 * @param encryptedJSON - JSON string containing encrypted data
 * @returns The original plaintext string
 */
export function decryptFromJSON(encryptedJSON: string): string {
  const encrypted = JSON.parse(encryptedJSON) as EncryptedData;
  return decrypt(encrypted);
}

/**
 * Utility to test if encryption is working
 * Use this to verify your ENCRYPTION_KEY is set up correctly
 */
export function testEncryption(): boolean {
  try {
    const testString = 'test-api-key-12345';
    const encrypted = encrypt(testString);
    const decrypted = decrypt(encrypted);
    return decrypted === testString;
  } catch (error) {
    console.error('Encryption test failed:', error);
    return false;
  }
}
