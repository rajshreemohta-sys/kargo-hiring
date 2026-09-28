// The Kargo hiring rubric, transcribed from rubric.txt. Weights must sum to 100 per role.

export type Role = "pm" | "spm";
export const ROLES: Role[] = ["pm", "spm"];
export const ROLE_LABEL: Record<Role, string> = { pm: "Product Manager", spm: "Senior Product Manager" };
export const ROLE_SHORT: Record<Role, string> = { pm: "PM", spm: "SPM" };

export type Criterion = { key: string; title: string; weight: number; bar: string };

export const RUBRIC: Record<Role, Criterion[]> = {
  pm: [
    {
      key: "ops_hands_on",
      title: "Hands-on time in freight or logistics operations",
      weight: 25,
      bar: `Has held at least one role where they personally handled shipments, documents or carriers every day. The CV names specific documents (e.g. Bills of Lading, Certificates of Origin, LC document sets, delivery exception logs) and specific counterparts (e.g. CHAs, customs officers, shipping lines, carrier partners). Integrating with logistics providers through APIs, building software for logistics customers, or interviewing operators does not count.`,
    },
    {
      key: "fixed_breakdown",
      title: "Fixed a breakdown they hit, and others adopted the fix",
      weight: 20,
      bar: `The CV describes all three of these for at least one example: (a) a specific problem the person ran into in their own work, (b) a fix they built without being asked, often with simple tools like an Excel sheet, checklist or weekend prototype, and (c) a named group beyond themselves that adopted it, such as "12-member team within two weeks." Process templates that are a standard part of the person's own job, like a PM writing a PRD template, do not count.`,
    },
    {
      key: "bigger_load",
      title: "Handled a bigger load than the role came with, without extra people",
      weight: 20,
      bar: `The CV describes a period when volume, accounts or scope grew beyond the normal load for the role, and the person handled it without new hires or extra support. It names what they changed to cope, and a result that held up. Examples from the hires:
- Rohan handled 18 months of higher documentation volume with no added headcount by redesigning the process.
- Meghna covered a departing colleague's 8 accounts for three months, with no churn.
- Aditya built his territory from a cold list, with 8 of his 14 accounts self-sourced rather than coming from marketing leads.
- Lavanya was the only PM across three product areas while running three discovery tracks in parallel.
Hiring people to meet growth does not count. Neither does a steady-state load like "managed 18 accounts" with no increase described.`,
    },
    {
      key: "direct_customer",
      title: "Direct contact with the customer during live problems",
      weight: 15,
      bar: `In at least one role, the person dealt with the customer or end user directly while a problem was happening, with no account manager, product manager or senior colleague in between. The CV says so explicitly, e.g. "primary contact for 12 key accounts" or "without a product layer." Scheduled research interviews alone do not count.`,
    },
    {
      key: "customer_outcomes",
      title: "Results measured in the customer's operation",
      weight: 20,
      bar: `At least one result on the CV is stated as a change in the customer's own operation: a shipment that left on time, an inspection passed without observations, fewer support tickets or queries from a customer, or less time for a customer to integrate or go live. Examples from the hires: Sunita's client passed a customs inspection with no observations; Lavanya cut one account's support tickets by 60%; Rohan cut shipment-status queries from customers by 35%. Results stated only in the candidate's own company's numbers (revenue, ARR, pipeline, customer acquisition cost, feature adoption, uptime, query speed) do not count on their own, however large.`,
    },
  ],
  spm: [
    {
      key: "ops_hands_on",
      title: "Hands-on time in freight or logistics operations, under deadline",
      weight: 20,
      bar: `Meets everything in the PM description (at least one role personally handling shipments, documents or carriers every day; names specific documents and specific counterparts; API integrations, building software for logistics customers or interviewing operators do not count). In addition, problems landed on them under deadline, not just routine processing. The CV should name the incidents, e.g. a customs hold cleared before a sailing, customs inspections closed without penalty, or berth-window escalations during peak season.`,
    },
    {
      key: "fixed_breakdown",
      title: "Fixed breakdowns they hit, and the fix outlasted them",
      weight: 15,
      bar: `At least two examples that meet all three parts of the PM description ((a) a specific problem they ran into in their own work, (b) a fix they built without being asked, (c) a named group beyond themselves that adopted it; standard process templates that are part of their own job do not count). At least one of those fixes must have outlasted the person's own involvement: it became a permanent process, a core product feature, or was adopted by other teams or regions.`,
    },
    {
      key: "bigger_load",
      title: "Handled a bigger load than the role came with, by changing how the work was done",
      weight: 25,
      bar: `Meets the PM version (load grew beyond normal for the role, handled without new hires or extra support, names what they changed, result held up; hiring to meet growth and steady-state loads do not count). In addition, the extra load lasted at least six months or became permanent, and the CV shows the person absorbed it by redesigning the work rather than putting in more hours. That means a new process, tool or way of splitting the work, which the person chose themselves rather than being handed.
- Rohan meets this bar: he redesigned the process to handle 18 months of higher volume with no new hires.
- Lavanya meets it: she was the only PM across three product areas for over a year while running three discovery tracks in parallel.
- Meghna's three-month cover of a departing colleague's accounts is strong for a PM but does not reach this bar on its own. It was temporary, and her CV does not say she changed how the work was done.
The six-month threshold is there so two people reading the same CV draw the line in the same place.`,
    },
    {
      key: "final_decision_maker",
      title: "Final decision-maker, with others acting on their calls",
      weight: 25,
      bar: `In their most recent role, the person was the last word in their area, with no one senior above them making the calls. The CV shows others acting on their decisions without escalating, e.g. "sole PM," "no escalation to management in 14 months," or a colleague saying their calls were trusted immediately. Being one of a larger team (one of 12 engineers, one of 4 PMs) or supporting senior owners does not meet the bar.`,
    },
    {
      key: "customer_outcomes",
      title: "Results measured in the customer's operation, across customers",
      weight: 15,
      bar: `At least two results that meet the PM description (a change in the customer's own operation, not the candidate's company's own numbers like revenue, ARR, pipeline, CAC, feature adoption, uptime or query speed). At least one must cover several customers or a whole group of customers, not a single account. Examples from the hires: Lavanya cut integration time for new logistics customers by two weeks; Rohan cut shipment-status queries across the customers using his tracking portal by 35%. A single account's improvement (e.g. one client passing an inspection) counts toward the two but does not meet the multi-customer requirement.`,
    },
  ],
};

export const SCORE_SCALE: { score: number; label: string; meaning: string }[] = [
  { score: 4, label: "Meets the bar", meaning: "Every part of the bar is met, with specific named detail in the CV." },
  { score: 3, label: "Nearly meets", meaning: "The bar is met, but one part rests on thin or implied detail." },
  { score: 2, label: "Partial", meaning: "Some required parts are present and at least one is missing (e.g. a fix with no named adopters, or one example where two are required)." },
  { score: 1, label: "Weak", meaning: "Only vague claims, or only evidence the rubric explicitly says does not count." },
  { score: 0, label: "None", meaning: "Nothing in the CV speaks to this." },
];
export const MAX_SCORE = 4;
