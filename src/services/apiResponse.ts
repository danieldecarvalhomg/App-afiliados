export class ApiResponseFormatError extends Error {
  readonly code = 'BACKEND_RESPONSE_INVALID';

  constructor() {
    super('O backend não respondeu corretamente. Recarregue a página e tente novamente.');
    this.name = 'ApiResponseFormatError';
  }
}

export async function readJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) throw new ApiResponseFormatError();

  try {
    return await response.json() as T;
  } catch {
    throw new ApiResponseFormatError();
  }
}
