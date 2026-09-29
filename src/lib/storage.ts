import "server-only";
import { maybeOne, query } from "./db";

// Original CV files are kept in Postgres (cv_files), next to the private contact details.
// Deleting a candidate removes the file with them.

export async function putCv(candidateId: string, file: File): Promise<void> {
  await query("insert into cv_files (candidate_id, content_type, data) values ($1, $2, $3)", [
    candidateId,
    file.type || "application/octet-stream",
    Buffer.from(await file.arrayBuffer()),
  ]);
}

export async function getCv(candidateId: string): Promise<{ data: Buffer; filename: string; contentType: string } | null> {
  return maybeOne(
    `select f.data, f.content_type as "contentType", p.cv_filename as filename
     from cv_files f join candidate_pii p using (candidate_id) where f.candidate_id = $1`,
    [candidateId],
  );
}
