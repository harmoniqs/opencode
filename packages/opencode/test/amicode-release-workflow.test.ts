import { expect, test } from "bun:test"
import path from "path"

const workflow = await Bun.file(path.resolve(import.meta.dir, "../../..", ".github/workflows/amicode-release.yml")).text()

test("repository dispatch owns the fork tag before building a BETA release", () => {
  expect(workflow).toContain("github.event.client_payload.ref")
  expect(workflow).toContain('TARGET="$(git rev-parse HEAD)"')
  expect(workflow).toContain('git tag "$TAG" "$TARGET"')
  expect(workflow).toContain('git push origin "$TAG"')
})
