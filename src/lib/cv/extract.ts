import "server-only";

export const ACCEPTED = [".pdf", ".docx", ".txt"];
// Vercel rejects request bodies over 4.5 MB, so cap uploads just under that.
export const MAX_BYTES = 4 * 1024 * 1024;

/** Pull plain text out of a CV file, locally. The file itself is never sent to the AI. */
export async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const buf = new Uint8Array(await file.arrayBuffer());

  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(buf);
    const { text } = await pdfText(pdf, { mergePages: false });
    return text.join("\n\n");
  }
  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buf) });
    return value;
  }
  if (name.endsWith(".txt") || file.type.startsWith("text/")) {
    return new TextDecoder().decode(buf);
  }
  throw new Error(`Unsupported file type. Upload ${ACCEPTED.join(", ")}.`);
}
