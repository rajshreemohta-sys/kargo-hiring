"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api, evaluate, pool } from "./run";

type Item = {
  key: string;
  label: string;
  state: "queued" | "reading" | "evaluating" | "done" | "error" | "duplicate";
  id?: string;
  note?: string;
};

const STATE_TEXT: Record<Item["state"], string> = {
  queued: "Queued",
  reading: "Removing personal details…",
  evaluating: "Scoring for PM and SPM…",
  done: "Done",
  error: "Failed",
  duplicate: "Already uploaded",
};
const DECISION_TEXT: Record<string, string> = { shortlisted: "Shortlisted", review: "Needs review", rejected: "Rejected" };

export function Uploader() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [role, setRole] = useState<"pm" | "spm">("pm");
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  const busy = items.some((i) => ["queued", "reading", "evaluating"].includes(i.state));

  const update = (key: string, patch: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  async function process(jobs: { key: string; body: FormData }[]) {
    await pool(jobs, 3, async ({ key, body }) => {
      try {
        update(key, { state: "reading" });
        const created = await api<{ id: string; duplicateOf?: string }>("/api/candidates", { method: "POST", body });
        if (created.duplicateOf) return update(key, { state: "duplicate", id: created.id });
        update(key, { state: "evaluating", id: created.id });
        const result = await evaluate(created.id);
        update(key, { state: "done", note: result.decision ? DECISION_TEXT[result.decision] : undefined });
      } catch (e) {
        update(key, { state: "error", note: e instanceof Error ? e.message : "Failed" });
      }
      router.refresh();
    });
  }

  function addFiles(files: FileList | File[]) {
    const jobs = [...files].map((file) => {
      const body = new FormData();
      body.set("role", role);
      body.set("file", file);
      return { key: crypto.randomUUID(), label: file.name, body };
    });
    setItems((xs) => [...jobs.map((j) => ({ key: j.key, label: j.label, state: "queued" as const })), ...xs]);
    process(jobs);
  }

  function addPasted() {
    const body = new FormData();
    body.set("role", role);
    body.set("text", pasted);
    const key = crypto.randomUUID();
    setItems((xs) => [{ key, label: "Pasted CV", state: "queued" }, ...xs]);
    setPasted("");
    setPasting(false);
    process([{ key, body }]);
  }

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">Upload CVs</h2>
          <p className="text-sm text-muted">PDF, DOCX or TXT, up to 4 MB each. Add as many as you like.</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted">Applied for</span>
          <div className="flex rounded-lg border border-line p-0.5">
            {(["pm", "spm"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`rounded-md px-3 py-1 ${role === r ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
              >
                {r === "pm" ? "Product Manager" : "Senior PM"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {pasting ? (
        <div className="mt-4 space-y-2">
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={8}
            placeholder="Paste the full CV text, including the name and contact details at the top."
            className="input font-mono text-xs"
          />
          <div className="flex gap-2">
            <button className="btn-primary" disabled={pasted.trim().length < 200} onClick={addPasted}>Screen this CV</button>
            <button className="btn-ghost" onClick={() => setPasting(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => (e.preventDefault(), setDragging(true))}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
          }}
          onClick={() => input.current?.click()}
          className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-8 text-center transition-colors ${
            dragging ? "border-accent bg-accent-soft" : "border-neutral-300 hover:border-ink"
          }`}
        >
          <p className="text-sm font-medium">Drop CVs here, or click to choose files</p>
          <p className="mt-1 text-xs text-muted">
            or{" "}
            <button className="underline hover:text-ink" onClick={(e) => (e.stopPropagation(), setPasting(true))}>
              paste the text
            </button>{" "}
            if it&apos;s a scanned PDF
          </p>
          <input
            ref={input}
            type="file"
            multiple
            accept=".pdf,.docx,.txt"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {items.length > 0 && (
        <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
          {items.map((i) => (
            <li key={i.key} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="truncate">{i.label}</span>
              <span className="flex shrink-0 items-center gap-3">
                <span
                  className={
                    i.state === "error" ? "max-w-xs truncate text-red-600" : i.state === "done" ? "text-ink" : i.state === "reading" || i.state === "evaluating" ? "text-accent" : "text-muted"
                  }
                  title={i.note}
                >
                  {i.state === "error" ? i.note : i.state === "done" && i.note ? i.note : STATE_TEXT[i.state]}
                </span>
                {i.id && ["done", "error", "duplicate"].includes(i.state) && (
                  <Link href={`/candidates/${i.id}`} className="text-muted underline hover:text-ink">Open</Link>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!busy && items.length > 0 && (
        <button className="mt-2 text-xs text-muted hover:text-ink" onClick={() => setItems([])}>Clear list</button>
      )}
    </section>
  );
}
