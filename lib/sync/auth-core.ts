const encoder = new TextEncoder();

export function bearerTokenFromRequest(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : "";
}

export function timingSafeEqualString(actual: string | undefined, expected: string | undefined): boolean {
  const actualBytes = encoder.encode(actual ?? "");
  const expectedBytes = encoder.encode(expected ?? "");
  const length = Math.max(actualBytes.length, expectedBytes.length, 1);
  let diff = actualBytes.length ^ expectedBytes.length;

  for (let index = 0; index < length; index += 1) {
    diff |= (actualBytes[index] ?? 0) ^ (expectedBytes[index] ?? 0);
  }

  return diff === 0;
}

export function isOwnerEmail(requestEmail: string | null | undefined, ownerEmail: string | undefined): boolean {
  const normalizedOwner = ownerEmail?.trim().toLowerCase() ?? "";
  const normalizedRequest = requestEmail?.trim().toLowerCase() ?? "";
  return Boolean(normalizedOwner && normalizedRequest && normalizedOwner === normalizedRequest);
}

export function isAutomationRequest(request: Request, automationToken: string | undefined): boolean {
  const expected = automationToken?.trim() ?? "";
  if (!expected) return false;
  return timingSafeEqualString(bearerTokenFromRequest(request), expected);
}
