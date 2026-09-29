import { describe, expect, it } from "vitest";
import { guessName, redact, splitJoins } from "@/lib/privacy/redact";

// Layouts seen in real sample CVs, with invented people.
const filler = "\n" + "Handled Bills of Lading and delivery exception logs with CHAs and carrier partners daily.\n".repeat(4);

describe("name detection on awkward PDF layouts", () => {
  it("skips section headings and finds the name glued together next to the contact line", () => {
    const cv = `Strategic & Marketing Lead\nPROFESSIONAL SUMMARY\nMarketer with 8 years.\nCore Competencies\nBrand strategy\n${filler}\nKAVYA MENONKavya Menon\nkavya@x.com+91 98450 1234598450 12345 linkedin.com/in/kavya-menon`;
    expect(guessName(cv)).toBe("Kavya Menon");
    const r = redact(cv);
    expect(r.redacted).not.toMatch(/kavya|menon|98450|12345/i);
    expect(r.leaks).toEqual([]);
  });

  it("finds a name on the same line as the email", () => {
    const cv = `• • linkedin.com/in/\nPROFESSIONAL SUMMARY\nProduct leader.${filler}\nRavi ThomasRAVI THOMAS ravi@x.com+91 94470 00011`;
    expect(guessName(cv)).toBe("Ravi Thomas");
    expect(redact(cv).redacted).not.toMatch(/ravi|thomas/i);
  });

  it("does not take 'Academic Qualifications' as a name", () => {
    const cv = `Major: Chemical Engineering\nAcademic Qualifications\nYear Qualification Institute\n${filler}\nDev Banerjee DEV BANERJEE dev@x.com`;
    expect(guessName(cv)).toBe("Dev Banerjee");
  });

  it("finds the name above the role title and contact line", () => {
    const cv = `Meera Das\nSenior Product Manager\n+91 90000 11111 · shared@x.com · Mumbai · linkedin.com/in/meeradas${filler}`;
    expect(guessName(cv)).toBe("Meera Das");
    expect(redact(cv).redacted).toContain("Mumbai"); // the city on the contact line is not a name
  });

  it("uses the file name as a cross-check when the layout gives nothing", () => {
    const cv = `PROFESSIONAL SUMMARY\nOps lead. Worked with Sana Qureshi's team lead on exports.${filler}`;
    expect(guessName(cv)).toBeNull();
    expect(guessName(cv, "07_sana_qureshi.pdf")).toBe("Sana Qureshi");
    expect(guessName(cv, "product_manager_cv_final.pdf")).toBeNull();
  });

  it("reads name, then title, then contact — and keeps the title out of the redaction", () => {
    const cv = `Rahul Nair\nGrowth Marketer\nrahul.nair@x.com | +91 90000 22222${filler}`;
    expect(guessName(cv)).toBe("Rahul Nair");
    const r = redact(cv);
    expect(r.redacted).toContain("Growth Marketer");
    expect(r.redacted).not.toMatch(/rahul|nair/i);
  });

  it("prefers the candidate that matches the email or LinkedIn handle", () => {
    const cv = `Supply Planning\nIrene Dsouza\nirene.dsouza@x.com · linkedin.com/in/irene-dsouza${filler}`;
    expect(guessName(cv)).toBe("Irene Dsouza");
  });

  it("leaves ordinary words alone when splitting glued text", () => {
    expect(splitJoins("LinkedIn KPIs SaaS iPhone")).toBe("LinkedIn KPIs SaaS iPhone");
    expect(splitJoins("SHARMAPriya JosephTARUN")).toBe("SHARMA Priya Joseph TARUN");
  });
});
