import toast from "react-hot-toast";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const TOKEN_KEY = "aegis_jwt_token";

export interface ApiResponse<T> {
  success: true;
  data: T;
  message: string;
  transactionId?: string;
  hashscanUrl?: string;
  status?: string;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  message: string;
}

type ApiResult<T> = ApiResponse<T> | ApiErrorResponse;

class ApiClient {
  private getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(TOKEN_KEY);
  }

  setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  }

  clearToken(): void {
    localStorage.removeItem(TOKEN_KEY);
  }

  private headers(): HeadersInit {
    const headers: HeadersInit = { "Content-Type": "application/json" };
    const token = this.getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<ApiResponse<T>> {
    const url = `${API_BASE_URL}${path}`;

    const init: RequestInit = {
      method,
      headers: this.headers(),
    };

    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    let res: Response;
    try {
      res = await fetch(url, init);
    } catch {
      const msg = "Network error — please check your connection.";
      toast.error(msg);
      throw new Error(msg);
    }

    const json: ApiResult<T> = await res.json();

    if (!json.success) {
      const errResponse = json as ApiErrorResponse;
      toast.error(errResponse.message || errResponse.error);
      throw errResponse;
    }

    return json as ApiResponse<T>;
  }

  async get<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>("GET", path);
  }

  async post<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>("POST", path, body);
  }

  async put<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>("PUT", path, body);
  }

  async delete<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>("DELETE", path);
  }
}

export const apiClient = new ApiClient();
