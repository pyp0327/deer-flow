"use client";

import { getBackendBaseURL, getLangGraphBaseURL } from "@/core/config";

const LOCAL_STORAGE_KEY = "deerflow:user_id";
export const USER_ID_COOKIE_NAME = "deer_user_id";
export const USER_ID_HEADER_NAME = "X-Deer-User-Id";
const FETCH_PATCH_FLAG = "__deerflowUserIdFetchPatched__";
const USER_ID_QUERY_PARAM = "w3Id";
const USER_ID_SAFE_RE = /^[A-Za-z0-9._-]{1,128}$/;

function generateFallbackId() {
  return `u_${Math.random().toString(36).slice(2, 12)}`;
}

export function getOrCreateClientUserId(): string {
  if (typeof window === "undefined") {
    return "anonymous";
  }

  const stored = window.localStorage.getItem(LOCAL_STORAGE_KEY)?.trim();
  if (stored) {
    return stored;
  }

  const generated =
    typeof window.crypto !== "undefined" && "randomUUID" in window.crypto
      ? window.crypto.randomUUID()
      : generateFallbackId();
  const userId = `u_${generated.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 64)}`;
  window.localStorage.setItem(LOCAL_STORAGE_KEY, userId);
  return userId;
}

export function initializeUserIdFromUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const url = new URL(window.location.href);
  const fromQuery = url.searchParams.get(USER_ID_QUERY_PARAM)?.trim();
  if (!fromQuery || !USER_ID_SAFE_RE.test(fromQuery)) {
    return null;
  }

  window.localStorage.setItem(LOCAL_STORAGE_KEY, fromQuery);
  const maxAge = 60 * 60 * 24 * 365; // one year
  document.cookie = `${USER_ID_COOKIE_NAME}=${encodeURIComponent(fromQuery)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;

  // Reduce leakage via logs/referer after bootstrap.
  url.searchParams.delete("token");
  url.searchParams.delete(USER_ID_QUERY_PARAM);
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, "", nextUrl);

  return fromQuery;
}

export function ensureUserIdCookie(): string {
  const userId = getOrCreateClientUserId();
  const maxAge = 60 * 60 * 24 * 365; // one year
  document.cookie = `${USER_ID_COOKIE_NAME}=${encodeURIComponent(userId)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
  return userId;
}

function shouldAttachUserId(input: RequestInfo | URL): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const asString =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  if (asString.startsWith("/")) {
    return true;
  }

  let parsed: URL;
  try {
    parsed = new URL(asString, window.location.origin);
  } catch {
    return false;
  }

  const knownBases = [
    getBackendBaseURL(),
    getLangGraphBaseURL(),
    `${window.location.origin}/api`,
    `${window.location.origin}/api/langgraph`,
  ]
    .filter(Boolean)
    .map((base) => base.replace(/\/+$/, ""));

  const urlWithoutTrailingSlash = parsed.toString().replace(/\/+$/, "");
  return knownBases.some(
    (base) =>
      urlWithoutTrailingSlash === base ||
      urlWithoutTrailingSlash.startsWith(`${base}/`),
  );
}

function mergeHeaders(
  original: HeadersInit | undefined,
  userId: string,
): HeadersInit {
  const headers = new Headers(original);
  headers.set(USER_ID_HEADER_NAME, userId);
  return headers;
}

export function installUserIdFetchInterceptor(): void {
  if (typeof window === "undefined") {
    return;
  }

  const globalWithFlag = window as Window & { [FETCH_PATCH_FLAG]?: boolean };
  if (globalWithFlag[FETCH_PATCH_FLAG]) {
    return;
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!shouldAttachUserId(input)) {
      return originalFetch(input, init);
    }

    const userId = ensureUserIdCookie();
    const nextInit: RequestInit = {
      ...init,
      headers: mergeHeaders(init?.headers, userId),
    };
    return originalFetch(input, nextInit);
  };

  globalWithFlag[FETCH_PATCH_FLAG] = true;
}
