function restoreSelection(ranges: Range[]): void {
  const selection = document.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  for (const range of ranges) {
    selection.addRange(range);
  }
}

async function fallbackCopyText(text: string): Promise<void> {
  if (typeof document === "undefined") {
    throw new Error("Document is not available");
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);

  const selection = document.getSelection();
  const previousRanges: Range[] = [];
  if (selection) {
    for (let i = 0; i < selection.rangeCount; i += 1) {
      previousRanges.push(selection.getRangeAt(i));
    }
  }

  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
    restoreSelection(previousRanges);
  }

  if (!copied) {
    throw new Error("Failed to copy to clipboard");
  }
}

export async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("Window is not available");
  }

  const clipboard = navigator.clipboard;
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text);
      return;
    } catch {
      // Fallback to legacy API.
    }
  }

  await fallbackCopyText(text);
}

export function installClipboardWriteTextFallback(): void {
  if (typeof window === "undefined") {
    return;
  }

  const marker = "__deerflowPatched__";
  const clipboardLike = navigator.clipboard as
    | (Clipboard & {
        writeText?: ((text: string) => Promise<void>) & {
          [key: string]: unknown;
        };
      })
    | undefined;

  if (clipboardLike?.writeText) {
    if (clipboardLike.writeText[marker]) {
      return;
    }

    const nativeWriteText = clipboardLike.writeText.bind(clipboardLike);
    const patchedWriteText = (async (text: string) => {
      try {
        await nativeWriteText(text);
      } catch {
        await fallbackCopyText(text);
      }
    }) as typeof clipboardLike.writeText;

    patchedWriteText[marker] = true;
    clipboardLike.writeText = patchedWriteText;
    return;
  }

  const clipboardPolyfill = {
    writeText: async (text: string) => {
      await fallbackCopyText(text);
    },
  } as Clipboard;

  Object.defineProperty(window.navigator, "clipboard", {
    value: clipboardPolyfill,
    configurable: true,
  });
}
