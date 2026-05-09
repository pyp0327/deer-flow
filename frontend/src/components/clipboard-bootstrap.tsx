"use client";

import { useEffect } from "react";

import { installClipboardWriteTextFallback } from "@/core/utils/clipboard";

export function ClipboardBootstrap() {
  useEffect(() => {
    installClipboardWriteTextFallback();
  }, []);

  return null;
}
