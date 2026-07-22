const DIAGNOSTIC_TEXT_BYTE_LIMIT = 256

/** Sanitize and UTF-8-bound one untrusted value before diagnostic interpolation. */
export function boundedDiagnosticText(value: string): string {
  const sanitized = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, "�")
  if (Buffer.byteLength(sanitized, "utf8") <= DIAGNOSTIC_TEXT_BYTE_LIMIT) return sanitized
  let result = ""
  let bytes = 0
  for (const character of sanitized) {
    const nextBytes = Buffer.byteLength(character, "utf8")
    if (bytes + nextBytes > DIAGNOSTIC_TEXT_BYTE_LIMIT) break
    result += character
    bytes += nextBytes
  }
  return result
}
