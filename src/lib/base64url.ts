export function bufferToBase64URL(buffer: ArrayBuffer) {
  return Buffer.from(buffer).toString("base64url");
}

export function base64URLToBuffer(base64url: string) {
  return Buffer.from(base64url, "base64url");
}