/** The two values derived from a user's password on the client. */
export interface DerivedKeys {
  /** Key-encryption-key. Wraps the DEK. Never leaves the device. */
  kek: Uint8Array;
  /** The password value handed to Supabase auth. The real password is not. */
  authSecret: string;
}

/** A nonce plus ciphertext produced by AEAD. Both are safe to store in plaintext. */
export interface SealedBox {
  nonce: Uint8Array;
  ciphertext: Uint8Array;
}
