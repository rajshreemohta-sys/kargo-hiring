import { describe, expect, it } from "vitest";
import { decide, quoteInText, scoreRole } from "@/lib/scoring";
import { SAMPLE_CV } from "./fixtures";
import { inviteDraft, rejectionDraft } from "@/lib/email/templates";

const full = (evidence: string[]) => ({ score: 4, evidence, reasoning: "ok" });

describe("scoreRole", () => {
  it("weights 0–4 scores into a total out of 100", () => {
    const s = scoreRole(
      "pm",
      {
        ops_hands_on: full(["Prepared Bills of Lading and Certificates of Origin daily"]),
        fixed_breakdown: { score: 2, evidence: ["adopted by the 12-member ops team within two weeks"], reasoning: "" },
        bigger_load: full(["no added headcount by redesigning the document checklist"]),
        direct_customer: { score: 0, evidence: [], reasoning: "" },
        customer_outcomes: full(["Cut shipment-status queries from customers by 35%"]),
      },
      "",
      SAMPLE_CV,
    );
    // 25 + 10 + 20 + 0 + 20
    expect(s.total).toBe(75);
  });

  it("caps criteria whose quotes aren't in the CV", () => {
    const s = scoreRole("pm", { ops_hands_on: full(["Managed 300 containers a day at Nhava Sheva"]) }, "", SAMPLE_CV);
    expect(s.criteria[0].score).toBe(1);
    expect(s.criteria[0].capped).toBe(true);
    expect(s.criteria[0].unverified).toHaveLength(1);
  });

  it("matches quotes despite whitespace, case, curly quotes and dash differences", () => {
    const cv = "Cleared a customs hold at JNPT 6 hours before sailing — by re-filing the shipper’s bill".toLowerCase();
    expect(quoteInText("cleared a customs hold at JNPT 6 hours   before sailing - by re-filing the shipper's bill", cv)).toBe(true);
    expect(quoteInText("Cleared a customs hold ... re-filing the shipper's bill", cv)).toBe(true);
    expect(quoteInText("Cleared a customs hold at Mundra", cv)).toBe(false);
  });
});

describe("decide", () => {
  const t = { shortlist: 70, reject: 45 };
  it("prefers the applied role", () => expect(decide("spm", { pm: 90, spm: 72 }, t)).toEqual({ decision: "shortlisted", role: "spm", crossRole: false }));
  it("shortlists for the other role when only that one clears", () =>
    expect(decide("spm", { pm: 78, spm: 50 }, t)).toEqual({ decision: "shortlisted", role: "pm", crossRole: true }));
  it("sends the middle band to review", () => expect(decide("pm", { pm: 60, spm: 30 }, t).decision).toBe("review"));
  it("rejects only when both roles are below the bar", () => expect(decide("pm", { pm: 44, spm: 20 }, t).decision).toBe("rejected"));
});

describe("emails", () => {
  const settings = { sender_name: "Arjun Mehta", sender_title: "Founder, Kargo", interview_format: "a 45-minute conversation", interview_location: "our office in Mumbai", scheduling_link: "" };
  it("writes a soft rejection by first name", () => {
    const d = rejectionDraft({ name: "Priya Ramaswamy", appliedRole: "pm", settings });
    expect(d.body.startsWith("Hi Priya,")).toBe(true);
    expect(d.body).not.toMatch(/\b(score|rubric|AI)\b/i);
  });
  it("puts the 4-line brief in the invite and explains a cross-role invite", () => {
    const d = inviteDraft({ name: "Priya Ramaswamy", appliedRole: "spm", inviteRole: "pm", brief: ["a", "b", "c", "d"], settings });
    expect(d.body.match(/^• /gm)).toHaveLength(4);
    expect(d.body).toContain("fits our Product Manager role more closely");
    expect(d.subject).toBe("Interview invitation: Product Manager at Kargo");
  });
});
