"use client";

import { useEffect } from "react";

import {
  ensureUserIdCookie,
  initializeUserIdFromUrl,
  installUserIdFetchInterceptor,
} from "@/core/session/user-id";

export function SessionUserBootstrap() {
  useEffect(() => {
    initializeUserIdFromUrl();
    ensureUserIdCookie();
    installUserIdFetchInterceptor();
  }, []);

  return null;
}
