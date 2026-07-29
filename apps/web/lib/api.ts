"use client";

/** Typed fetch wrapper. The bearer token lives in localStorage; a 401 clears it
 * and returns the user to /login. All permission decisions are server-side —
 * this client only reflects them. */

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:8000/api";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("brainchain_token");
}

export function setToken(token: string | null) {
  if (token) window.localStorage.setItem("brainchain_token", token);
  else window.localStorage.removeItem("brainchain_token");
}

export function getStoredUser(): import("@brainchain/shared").UserInfo | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem("brainchain_user");
  return raw ? JSON.parse(raw) : null;
}

export function setStoredUser(user: unknown | null) {
  if (user) window.localStorage.setItem("brainchain_user", JSON.stringify(user));
  else window.localStorage.removeItem("brainchain_user");
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; params?: Record<string, string | number | boolean | undefined | null> } = {},
): Promise<T> {
  const url = new URL(API_BASE + path);
  for (const [key, value] of Object.entries(options.params ?? {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const token = getToken();
  const resp = await fetch(url.toString(), {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (resp.status === 401) {
    setToken(null);
    setStoredUser(null);
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    throw new ApiError(401, "Session expired");
  }
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      const data = await resp.json();
      detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
    } catch {
      /* keep statusText */
    }
    throw new ApiError(resp.status, detail);
  }
  return resp.json() as Promise<T>;
}
