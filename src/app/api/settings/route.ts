import { query } from "@/lib/db";
import { fail, handle, ok } from "@/lib/http";
import { reapplyThresholds } from "@/lib/pipeline";

export const PUT = handle(async (request: Request) => {
  const b = await request.json();
  const shortlist = Number(b.shortlist_threshold);
  const reject = Number(b.reject_threshold);
  if (!(shortlist > 0 && shortlist <= 100 && reject >= 0 && reject <= shortlist)) {
    return fail("Thresholds must be between 0 and 100, with reject at or below shortlist.");
  }
  const text = (k: string) => String(b[k] ?? "").trim();
  if (!text("sender_name") || !text("sender_title")) return fail("Add a sender name and title.");
  if (text("scheduling_link") && !/^https:\/\//.test(text("scheduling_link"))) return fail("The scheduling link should start with https://");
  await query(
    `update settings set shortlist_threshold = $1, reject_threshold = $2, auto_send = $3, sender_name = $4,
       sender_title = $5, interview_format = $6, interview_location = $7, scheduling_link = $8, updated_at = now()
     where id = 1`,
    [
      shortlist,
      reject,
      Boolean(b.auto_send),
      text("sender_name"),
      text("sender_title"),
      text("interview_format") || "a 45-minute conversation",
      text("interview_location") || "our office in Mumbai",
      text("scheduling_link"),
    ],
  );
  const resorted = await reapplyThresholds();
  return ok({ resorted });
});
