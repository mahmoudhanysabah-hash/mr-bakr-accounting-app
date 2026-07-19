export function formatApiValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (Array.isArray(value)) {
    return value.map(formatApiValue).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const errorValue = formatApiValue(record.error);
    if (errorValue) return errorValue;
    const messageValue = formatApiValue(record.message);
    if (messageValue) return messageValue;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function getApiErrorMessage(error: unknown, fallback: string) {
  const response = (error as { response?: { data?: { error?: unknown; message?: unknown } } }).response;
  return formatApiValue(response?.data?.error) || formatApiValue(response?.data?.message) || fallback;
}