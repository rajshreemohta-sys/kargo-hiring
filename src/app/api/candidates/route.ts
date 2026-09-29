import { extractText, MAX_BYTES } from "@/lib/cv/extract";
import { fail, handle, ok } from "@/lib/http";
import { createCandidate } from "@/lib/pipeline";
import type { Role } from "@/lib/rubric";

export const maxDuration = 60;

// Upload one CV (file or pasted text). Personal details are split off here; no AI is called.
export const POST = handle(async (request: Request) => {
  const form = await request.formData();
  const role = form.get("role");
  if (role !== "pm" && role !== "spm") return fail("Choose the role they applied for.");

  const file = form.get("file");
  const pasted = form.get("text");
  let rawText: string;
  let upload: File | undefined;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) return fail("That file is over 4 MB. Try a smaller export, or paste the text.");
    rawText = await extractText(file);
    upload = file;
  } else if (typeof pasted === "string" && pasted.trim()) {
    rawText = pasted;
  } else {
    return fail("Add a CV file or paste its text.");
  }

  const result = await createCandidate({ rawText, appliedRole: role as Role, file: upload });
  return ok(result, result.duplicateOf ? 409 : 201);
});
