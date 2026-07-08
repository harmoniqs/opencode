import { describe, expect, test } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { libraryBody, saveLibraryFile, sanitizeFilename } from "@/server/amicode/library"

const PDF = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.from("x".repeat(64))])
const body = (filename: string, data: Buffer = PDF) => JSON.stringify({ filename, data_b64: data.toString("base64") })

describe("library", () => {
  test("save → list roundtrip; newest first; path included for the agent prompt", () => {
    const root = mkdtempSync(path.join(tmpdir(), "amicode-lib-"))
    const saved = JSON.parse(saveLibraryFile(body("Krotov Methods (2024).pdf"), root))
    expect(saved.ok).toBe(true)
    expect(saved.papers).toHaveLength(1)
    expect(saved.papers[0].name).toBe("Krotov Methods -2024-.pdf")
    const listed = JSON.parse(libraryBody(root))
    expect(listed.papers[0].path).toContain(root)
    expect(listed.papers[0].size).toBe(PDF.length)
  })
  test("rejects non-PDF content, wrong extension, oversize, garbage body", () => {
    const root = mkdtempSync(path.join(tmpdir(), "amicode-lib-"))
    expect(JSON.parse(saveLibraryFile(body("notes.txt"), root)).ok).toBe(false)
    expect(JSON.parse(saveLibraryFile(body("fake.pdf", Buffer.from("hello")))).ok).toBe(false)
    expect(JSON.parse(saveLibraryFile("not json", root)).ok).toBe(false)
    expect(JSON.parse(saveLibraryFile(JSON.stringify({ filename: "a.pdf" }), root)).ok).toBe(false)
  })
  test("sanitizeFilename: basename-only, pdf-only, traversal-proof", () => {
    expect(sanitizeFilename("../../etc/passwd.pdf")).toBe("passwd.pdf")
    expect(sanitizeFilename("paper.PDF")).toMatch(/\.pdf$/i)
    expect(sanitizeFilename("nope.txt")).toBeNull()
    expect(sanitizeFilename(".pdf")).toBeNull()
  })
})
