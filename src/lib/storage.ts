import "server-only";
import { getStore, type Store } from "@netlify/blobs";

// Original CV files live in a private Netlify Blobs store. Running on Vercel, the store is
// reached with the Netlify site ID and an access token.
let store: Store | null = null;

function cvs(): Store {
  if (store) return store;
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  if (!siteID || !token) throw new Error("Missing NETLIFY_SITE_ID or NETLIFY_BLOBS_TOKEN.");
  store = getStore({ name: "cvs", siteID, token });
  return store;
}

export async function putCv(key: string, file: File): Promise<void> {
  await cvs().set(key, await file.arrayBuffer(), {
    metadata: { filename: file.name, contentType: file.type || "application/octet-stream" },
  });
}

export async function getCv(key: string): Promise<{ data: ArrayBuffer; filename: string; contentType: string } | null> {
  const blob = await cvs().getWithMetadata(key, { type: "arrayBuffer" });
  if (!blob) return null;
  const meta = blob.metadata as { filename?: string; contentType?: string };
  return { data: blob.data, filename: meta.filename ?? "cv", contentType: meta.contentType ?? "application/octet-stream" };
}

export async function deleteCv(key: string): Promise<void> {
  await cvs().delete(key);
}
