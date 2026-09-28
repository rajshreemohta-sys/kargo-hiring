import { describe, expect, it } from "vitest";
import { findLeaks, guessName, redact } from "@/lib/privacy/redact";
import { SAMPLE_CV } from "./fixtures";

describe("redact", () => {
  const r = redact(SAMPLE_CV);

  it("finds the contact details", () => {
    expect(r.pii.fullName).toBe("Priya Ramaswamy");
    expect(r.pii.email).toBe("priya.ramaswamy92@gmail.com");
    expect(r.pii.phone).toBe("+91 98200 45123");
    expect(r.pii.links).toContain("linkedin.com/in/priya-ramaswamy");
  });

  it("removes every trace of the person from the text", () => {
    for (const s of ["Priya", "Ramaswamy", "priya", "98200", "gmail", "linkedin", "Sunshine Heights", "400069", "14/03/1994", "Female", "Married", "2834", "1234 5678"]) {
      expect(r.redacted).not.toContain(s);
    }
    expect(r.leaks).toEqual([]);
  });

  it("keeps the work evidence intact", () => {
    for (const s of ["Bills of Lading", "(2019 - 2024)", "12-member ops team", "18 months of 40% higher", "by 35%", "Oceanic Freight"]) {
      expect(r.redacted).toContain(s);
    }
  });

  it("keeps labels but drops protected values", () => {
    expect(r.redacted).toContain("Gender: [REMOVED]");
    expect(r.pii.other.gender).toEqual(["Female"]);
    expect(r.counts.name).toBeGreaterThanOrEqual(3);
  });

  it("uses a name the team corrected", () => {
    const cv = "Curriculum Vitae\nContact: someone@x.com\n\nWorked with Meera Iyer's team. Meera led it.\n" + "x".repeat(200);
    expect(guessName(cv)).toBeNull();
    const fixed = redact(cv, { fullName: "Meera Iyer" });
    expect(fixed.redacted).not.toMatch(/Meera|Iyer/);
  });

  it("does not treat date ranges or metrics as phone numbers", () => {
    const out = redact("Anil Kapoor\n\nOps lead 2018 - 2023. Moved 1200000 kg. Ref 2019-2020-2021.").redacted;
    expect(out).toContain("2018 - 2023");
    expect(out).toContain("1200000");
  });

  it("flags leftovers", () => {
    expect(findLeaks("mail me at a@b.co", [])).toContain("email address");
    expect(findLeaks("call 9820045123", [])).toContain("phone number");
    expect(findLeaks("Rohan built it", ["rohan"])).toContain("name");
  });
});
