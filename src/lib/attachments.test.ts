import { describe, expect, it } from "vitest";
import { AttachmentSchema, attachmentPrompt, validateAttachmentFile } from "./attachments";

describe("supporting documents", () => {
  it("includes the file name and full evidence in council context", () => {
    const prompt = attachmentPrompt({ name: "runway.csv", text: "cash,runway\n120000,4 months" });
    expect(prompt).toContain("runway.csv");
    expect(prompt).toContain("120000,4 months");
    expect(attachmentPrompt()).toBe("");
  });
  it("accepts the supported document extensions", () => {
    for (const name of [
      "brief.PDF",
      "brief.docx",
      "brief.txt",
      "brief.md",
      "brief.csv",
      "brief.json",
    ]) {
      expect(() => validateAttachmentFile({ name, size: 100 })).not.toThrow();
    }
    expect(() => validateAttachmentFile({ name: "brief.exe", size: 100 })).toThrow();
  });
  it("rejects files exceeding 5 MB", () => {
    expect(() =>
      validateAttachmentFile({ name: "brief.txt", size: 5 * 1024 * 1024 + 1 }),
    ).toThrow();
    expect(() =>
      validateAttachmentFile({ name: "brief.txt", size: 5 * 1024 * 1024 }),
    ).not.toThrow();
  });
  it("rejects empty or oversized extracted text on the server boundary", () => {
    expect(AttachmentSchema.safeParse({ name: "brief.txt", text: " " }).success).toBe(false);
    expect(AttachmentSchema.safeParse({ name: "brief.txt", text: "x".repeat(30001) }).success).toBe(
      false,
    );
    expect(AttachmentSchema.safeParse({ name: "brief.txt", text: "x".repeat(30000) }).success).toBe(
      true,
    );
  });
});
