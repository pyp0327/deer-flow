import fs from "fs";
import path from "path";

import type { NextRequest } from "next/server";

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      thread_id: string;
      artifact_path?: string[] | undefined;
    }>;
  },
) {
  const threadId = (await params).thread_id;
  let artifactPath = (await params).artifact_path?.join("/") ?? "";
  if (artifactPath.startsWith("mnt/")) {
    const demoThreadsRoot = path.join(process.cwd(), "public", "demo", "threads");
    const relativeArtifactPath = artifactPath.slice("mnt/".length);
    const resolvedPath = path.resolve(demoThreadsRoot, threadId, relativeArtifactPath);
    const expectedPrefix = path.resolve(demoThreadsRoot, threadId) + path.sep;
    if (!(resolvedPath + path.sep).startsWith(expectedPrefix)) {
      return new Response("Invalid artifact path", { status: 400 });
    }
    artifactPath = resolvedPath;
    if (fs.existsSync(artifactPath)) {
      if (request.nextUrl.searchParams.get("download") === "true") {
        // Attach the file to the response
        const headers = new Headers();
        headers.set(
          "Content-Disposition",
          `attachment; filename="${artifactPath}"`,
        );
        return new Response(fs.readFileSync(artifactPath), {
          status: 200,
          headers,
        });
      }
      if (artifactPath.endsWith(".mp4")) {
        return new Response(fs.readFileSync(artifactPath), {
          status: 200,
          headers: {
            "Content-Type": "video/mp4",
          },
        });
      }
      return new Response(fs.readFileSync(artifactPath), { status: 200 });
    }
  }
  return new Response("File not found", { status: 404 });
}
