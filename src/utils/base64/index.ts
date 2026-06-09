export const toBase64 = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes));

export const fromBase64 = (text: string): Uint8Array =>
  Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
