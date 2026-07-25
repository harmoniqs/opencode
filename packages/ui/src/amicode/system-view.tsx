import { For, Show, createMemo } from "solid-js"
import katex from "katex"
import { systemProjection } from "./problem"
import { formatSci } from "./facets"
import { systemTableModel, systemHamiltonianLatex } from "./system-render"

// AMICODE System hero (spec §6.1) — PHYSICS-FORWARD (Kate 2026-07-23): lead with
// the Hamiltonian, then a labeled physics spec (frequency, anharmonicity, drive
// bound, decay, + any recorded params). Missing canonical params read "not set"
// so an under-specified model is visible at a glance rather than silently thin.
// Multi-component systems show the component/coupling table (it scales; the
// node/edge schematic was removed — Kate 2026-07-24). Thin — logic in the pure
// systemProjection / system-render models.

// Unitless params get a math symbol; unit-suffixed keys (chi_kHz, K_c_Hz, N_fock)
// keep their name so the unit isn't lost.
const PARAM_SYMBOL: Record<string, string> = {
  omega: "ω",
  delta: "δ",
  chi: "χ",
  strength: "J",
  drive_max: "|u|",
  du_bound: "|u̇|",
}
// Drop unset (zero) params — "ω 0 · δ 0" is noise — and format the rest with
// the π-aware formatter so a drive bound reads "|u| 40π", not "|u| 125.66…".
const paramsText = (params: Record<string, number>): string =>
  Object.entries(params)
    .filter(([, v]) => typeof v === "number" && v !== 0)
    .map(([k, v]) => `${PARAM_SYMBOL[k] ?? k} ${formatSci(v)}`)
    .join(" · ")

// Canonical single-qubit physics keys, consumed by the physics spec; anything
// left over is appended as its own row so nothing recorded is lost.
const CANON_KEYS = new Set(["omega", "frequency", "f01", "delta", "alpha", "anharmonicity", "drive_max", "T1", "t1", "T2", "t2"])
type PhysRow = { label: string; sym?: string; value: string; set: boolean }

export function SystemComposite(props: { entity: Record<string, unknown> }) {
  const proj = createMemo(() => systemProjection(props.entity))
  const table = createMemo(() => systemTableModel(proj()))
  const hamiltonian = createMemo(() => {
    const latex = systemHamiltonianLatex(proj())
    return latex ? katex.renderToString(latex, { throwOnError: false }) : undefined
  })
  // Single qubit/atom, no couplings → the physics spec. Else the structural view.
  const single = createMemo(() => proj().components.length === 1 && proj().couplings.length === 0)
  const physics = createMemo<PhysRow[]>(() => {
    const c = proj().components[0]
    if (!c) return []
    const par = c.params
    const num = (keys: string[]): number | undefined => {
      for (const k of keys) if (typeof par[k] === "number" && par[k] !== 0) return par[k]
      return undefined
    }
    const rows: PhysRow[] = []
    if (c.levels !== undefined) rows.push({ label: "levels", value: String(c.levels), set: true })
    const f = num(["omega", "frequency", "f01"])
    rows.push({ label: "frequency", sym: "ω", value: f !== undefined ? formatSci(f) : "not set", set: f !== undefined })
    const a = num(["delta", "alpha", "anharmonicity"])
    rows.push({ label: "anharmonicity", sym: "δ", value: a !== undefined ? formatSci(a) : "not set", set: a !== undefined })
    const d = num(["drive_max"])
    rows.push({ label: "drive bound", sym: "|u|", value: d !== undefined ? `≤ ${formatSci(d)}` : "not set", set: d !== undefined })
    const t1 = num(["T1", "t1"])
    const t2 = num(["T2", "t2"])
    const decay = [t1 !== undefined ? `T₁ ${formatSci(t1)}` : null, t2 !== undefined ? `T₂ ${formatSci(t2)}` : null]
      .filter(Boolean)
      .join(" · ")
    rows.push({ label: "decay", sym: "T₁/T₂", value: decay || "not set", set: t1 !== undefined || t2 !== undefined })
    for (const [k, v] of Object.entries(par))
      if (typeof v === "number" && v !== 0 && !CANON_KEYS.has(k))
        rows.push({ label: PARAM_SYMBOL[k] ?? k, sym: PARAM_SYMBOL[k], value: formatSci(v), set: true })
    return rows
  })

  return (
    <div class="amc-system" data-component="amicode-system-view">
      <Show when={proj().platform || proj().driveArch}>
        <div class="amc-modebar" data-slot="amicode-system-identity">
          <Show when={proj().platform}>{(p) => <span class="amc-badge">{p()}</span>}</Show>
          <Show when={proj().driveArch}>{(d) => <span class="amc-badge">{d()} drive</span>}</Show>
        </div>
      </Show>

      <Show when={hamiltonian()}>
        {(html) => (
          <>
            <div class="amc-ev-sec">Hamiltonian</div>
            <div class="amc-ev-formula" data-slot="amicode-system-hamiltonian">
              <div innerHTML={html()} />
            </div>
          </>
        )}
      </Show>

      <Show
        when={single()}
        fallback={
          <div class="amc-systbl" data-slot="amicode-system-table">
            <For each={table().components}>
              {(c) => (
                <div class="amc-systbl-row">
                  <span class="amc-c-id">{c.id}</span>
                  <span class="amc-c-role">{c.role}</span>
                  <Show when={c.levels !== undefined}>
                    <span class="amc-c-lvl">{c.levels} lvl</span>
                  </Show>
                  <span class="amc-c-params">{paramsText(c.params)}</span>
                </div>
              )}
            </For>
            <For each={table().couplings}>
              {(cp) => (
                <div class="amc-systbl-row amc-coupling">
                  <span class="amc-c-id">{cp.between.join(" ↔ ")}</span>
                  <span class="amc-c-role">{cp.kind}</span>
                  <span class="amc-c-params">{paramsText(cp.params)}</span>
                </div>
              )}
            </For>
          </div>
        }
      >
        <>
          <div class="amc-ev-sec">Physics</div>
          <div class="amc-sys-physics" data-slot="amicode-system-physics">
            <For each={physics()}>
              {(r) => (
                <div class="amc-term">
                  <div class="amc-term-head">
                    <span class="amc-term-name">{r.label}</span>
                  </div>
                  <div class="amc-term-val" classList={{ "is-unset": !r.set }}>
                    <span>{r.value}</span>
                    <Show when={r.sym}>{(s) => <span class="amc-term-sym">{s()}</span>}</Show>
                  </div>
                </div>
              )}
            </For>
          </div>
        </>
      </Show>
    </div>
  )
}
