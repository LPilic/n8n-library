const CSRF_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'X-Requested-With': 'XMLHttpRequest',
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new ApiError(res.status, body.error || res.statusText)
  }
  return res.json()
}

export const api = {
  get<T>(path: string): Promise<T> {
    return fetch(path).then((r) => handleResponse<T>(r))
  },

  post<T>(path: string, body?: unknown): Promise<T> {
    return fetch(path, {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }).then((r) => handleResponse<T>(r))
  },

  put<T>(path: string, body?: unknown): Promise<T> {
    return fetch(path, {
      method: 'PUT',
      headers: CSRF_HEADERS,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }).then((r) => handleResponse<T>(r))
  },

  patch<T>(path: string, body?: unknown): Promise<T> {
    return fetch(path, {
      method: 'PATCH',
      headers: CSRF_HEADERS,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }).then((r) => handleResponse<T>(r))
  },

  delete<T>(path: string): Promise<T> {
    return fetch(path, {
      method: 'DELETE',
      headers: CSRF_HEADERS,
    }).then((r) => handleResponse<T>(r))
  },
}
