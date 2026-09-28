import { db } from "@/lib/db";
import { fail, handle, ok } from "@/lib/http";

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
  const { error } = await db()
    .from("settings")
    .update({
      shortlist_threshold: shortlist,
      reject_threshold: reject,
      auto_send: Boolean(b.auto_send),
      sender_name: text("sender_name"),
      sender_title: text("sender_title"),
      interview_format: text("interview_format") || "a 45-minute conversation",
      interview_location: text("interview_location") || "our office in Mumbai",
      scheduling_link: text("scheduling_link"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) return fail(error.message, 500);
  return ok();
});
