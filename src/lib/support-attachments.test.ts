import { describe, expect, it } from "vitest";
import { validateSupportFiles } from "@/lib/support-attachments";

function formWith(...files: File[]) {
  const form = new FormData();
  files.forEach((file) => form.append("attachments", file));
  return form;
}

describe("support attachment validation", () => {
  it("accepts a PNG whose signature matches its declared type", async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    await expect(validateSupportFiles(formWith(new File([bytes], "proof.png", { type: "image/png" })))).resolves.toHaveLength(1);
  });

  it("rejects a file whose content does not match its declared type", async () => {
    const file = new File(["not a PDF"], "proof.pdf", { type: "application/pdf" });
    await expect(validateSupportFiles(formWith(file))).rejects.toThrow("do not match its file type");
  });

  it("rejects more than three files", async () => {
    const text = () => new File(["evidence"], "note.txt", { type: "text/plain" });
    await expect(validateSupportFiles(formWith(text(), text(), text(), text()))).rejects.toThrow("no more than 3 files");
  });

  it("rejects an individual file larger than 700 KB", async () => {
    const file = new File([new Uint8Array(700 * 1024 + 1)], "large.txt", { type: "text/plain" });
    await expect(validateSupportFiles(formWith(file))).rejects.toThrow("700 KB or less");
  });
});
