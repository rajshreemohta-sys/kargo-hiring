// Email drafts. Written in code, not by the model, and filled with the candidate's
// real name only at this last step, after evaluation is done.

import { ROLE_LABEL, type Role } from "../rubric";

export type SenderSettings = {
  sender_name: string;
  sender_title: string;
  interview_format: string;
  interview_location: string;
  scheduling_link: string;
};

export type Draft = { subject: string; body: string };

export function firstName(fullName: string | null | undefined): string {
  const first = (fullName ?? "").trim().split(/\s+/)[0];
  return first || "there";
}

const signature = (s: SenderSettings) => `Warm regards,\n${s.sender_name}\n${s.sender_title}`;

export function rejectionDraft(o: { name: string | null; appliedRole: Role; settings: SenderSettings }): Draft {
  const role = ROLE_LABEL[o.appliedRole];
  return {
    subject: `Your application for ${role} at Kargo`,
    body: [
      `Hi ${firstName(o.name)},`,
      `Thank you for applying for the ${role} role at Kargo, and for the time you put into your application.`,
      `We read every CV closely. For this role we're looking for a very particular mix of hands-on freight operations experience, and we've decided not to take your application forward at this stage.`,
      `This isn't a judgement on your ability, and it doesn't have to be a final no. Kargo is growing quickly, and we'd be glad to hear from you again as new roles open up.`,
      `Thank you again, and all the best with your search.`,
      signature(o.settings),
    ].join("\n\n"),
  };
}

export function inviteDraft(o: {
  name: string | null;
  appliedRole: Role;
  inviteRole: Role;
  brief: string[];
  settings: SenderSettings;
}): Draft {
  const role = ROLE_LABEL[o.inviteRole];
  const s = o.settings;
  const crossRole =
    o.inviteRole !== o.appliedRole
      ? `You applied for the ${ROLE_LABEL[o.appliedRole]} role. Having read your CV, we think your experience fits our ${role} role more closely, so that's the role we'd like to talk to you about. We're happy to discuss both.`
      : null;
  const nextSteps = s.scheduling_link
    ? `The interview will be ${s.interview_format} at ${s.interview_location}. Please pick a time that suits you here: ${s.scheduling_link}`
    : `The interview will be ${s.interview_format} at ${s.interview_location}. Please reply with two or three times that work for you over the next week, and we'll confirm one.`;

  return {
    subject: `Interview invitation: ${role} at Kargo`,
    body: [
      `Hi ${firstName(o.name)},`,
      `Thank you for applying to Kargo. We enjoyed reading your CV, and I'm glad to confirm that we'd like to invite you to interview for the ${role} role.`,
      crossRole,
      `Interview brief\n${o.brief.map((l) => `• ${l}`).join("\n")}`,
      `Next steps\n${nextSteps}`,
      `Looking forward to speaking with you.`,
      signature(s),
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Plain-text body → simple, readable HTML email. */
export function toHtml(body: string): string {
  const blocks = body.split(/\n{2,}/).map((block) => {
    const lines = block.split("\n");
    const [head, ...rest] = lines;
    const linkify = (s: string) =>
      escapeHtml(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#ea580c">$1</a>');
    if (rest.length && rest.every((l) => l.startsWith("• "))) {
      return `<p style="margin:0 0 6px;font-weight:600">${linkify(head)}</p><ul style="margin:0 0 16px;padding-left:20px">${rest
        .map((l) => `<li style="margin:0 0 6px">${linkify(l.slice(2))}</li>`)
        .join("")}</ul>`;
    }
    return `<p style="margin:0 0 16px">${lines.map(linkify).join("<br>")}</p>`;
  });
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111;max-width:560px">${blocks.join("")}</div>`;
}
