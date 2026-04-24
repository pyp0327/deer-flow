import { getBackendBaseURL } from "../config";
import { getOrCreateClientUserId } from "../session/user-id";
import type { AgentThread } from "../threads";

function withUserIdQuery(url: string): string {
  if (typeof window === "undefined") {
    return url;
  }

  try {
    const parsed = new URL(url, window.location.origin);
    if (!parsed.searchParams.has("deer_user_id")) {
      parsed.searchParams.set("deer_user_id", getOrCreateClientUserId());
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export function urlOfArtifact({
  filepath,
  threadId,
  download = false,
  isMock = false,
}: {
  filepath: string;
  threadId: string;
  download?: boolean;
  isMock?: boolean;
}) {
  if (isMock) {
    return withUserIdQuery(
      `${getBackendBaseURL()}/mock/api/threads/${threadId}/artifacts${filepath}${download ? "?download=true" : ""}`,
    );
  }
  return withUserIdQuery(
    `${getBackendBaseURL()}/api/threads/${threadId}/artifacts${filepath}${download ? "?download=true" : ""}`,
  );
}

export function extractArtifactsFromThread(thread: AgentThread) {
  return thread.values.artifacts ?? [];
}

export function resolveArtifactURL(absolutePath: string, threadId: string) {
  return withUserIdQuery(
    `${getBackendBaseURL()}/api/threads/${threadId}/artifacts${absolutePath}`,
  );
}
