import { afterEach, describe, expect, test } from "bun:test"
import {
  inMemorySecretStore,
  pasqalSecretStore,
  setPasqalSecretStore,
} from "@/server/amicode/pasqal-secret"

// The keychain seam (#194). These exercise the injectable in-memory store and
// the install/restore seam; the real @napi-rs/keyring backend is verified on a
// real machine (ADR 0001 addendum) since a live OS keychain cannot be reached
// hermetically here.

describe("inMemorySecretStore", () => {
  test("round-trips a secret and reports durable (write → true)", () => {
    const store = inMemorySecretStore()
    expect(store.read("default")).toBeUndefined()
    expect(store.write("default", { username: "kate@example.com", password: "p@ss\"word" })).toBe(true)
    expect(store.read("default")).toEqual({ username: "kate@example.com", password: 'p@ss"word' })
  })

  test("clear removes the slot; slots are independent by account", () => {
    const store = inMemorySecretStore()
    store.write("a", { username: "ua", password: "pa" })
    store.write("b", { username: "ub", password: "pb" })
    store.clear("a")
    expect(store.read("a")).toBeUndefined()
    expect(store.read("b")).toEqual({ username: "ub", password: "pb" })
  })
})

describe("setPasqalSecretStore", () => {
  let restore: (() => void) | undefined
  afterEach(() => {
    restore?.()
    restore = undefined
  })

  test("installs a store and restores the previous one", () => {
    const before = pasqalSecretStore()
    const injected = inMemorySecretStore()
    restore = setPasqalSecretStore(injected)
    expect(pasqalSecretStore()).toBe(injected)
    restore()
    restore = undefined
    expect(pasqalSecretStore()).toBe(before)
  })
})
