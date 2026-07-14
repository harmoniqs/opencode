import { For, Show, createMemo } from "solid-js"
import katex from "katex"
import { systemProjection } from "./problem"
import { formatSci } from "./facets"
import {
  systemSchematicModel,
  systemTableModel,
  systemHamiltonianLatex,
  systemIdentityLine,
  type SchematicModel,
} from "./system-render"

// AMICODE System hero (spec §6.1 / plan Task 5): schematic (nodes + coupling
// edges) + component/coupling table + Hamiltonian LaTeX. Thin — all logic is in
// the pure systemProjection / system-render models; this file just maps them to
// DOM. Styling in ./amicode.css. Katex is the fork's existing math dep.

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

const edgeLabel = (schem: SchematicModel, a: string, b: string): string | undefined =>
  schem.edges.find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a))?.label

export function SystemComposite(props: { entity: Record<string, unknown> }) {
  const proj = createMemo(() => systemProjection(props.entity))
  const schem = createMemo(() => systemSchematicModel(proj()))
  const table = createMemo(() => systemTableModel(proj()))
  const hamiltonian = createMemo(() => {
    const latex = systemHamiltonianLatex(proj())
    return latex ? katex.renderToString(latex, { throwOnError: false }) : undefined
  })

  const identity = createMemo(() => systemIdentityLine(proj()))

  return (
    <div class="amc-system" data-component="amicode-system-view">
      <Show when={identity()}>
        <div class="amc-sys-identity" data-slot="amicode-system-identity">
          {identity()}
        </div>
      </Show>
      <div class="amc-schematic" data-slot="amicode-system-schematic">
        <For each={schem().nodes}>
          {(node, i) => (
            <>
              <Show when={i() > 0}>
                <span class="amc-edge">
                  <span class="amc-edge-line" aria-hidden="true">
                    ─
                  </span>
                  <Show when={edgeLabel(schem(), schem().nodes[i() - 1].id, node.id)}>
                    {(label) => <span class="amc-edge-label">{label()}</span>}
                  </Show>
                </span>
              </Show>
              <span class="amc-node">
                <span class="amc-node-id">{node.id}</span>
                <Show when={node.levels !== undefined}>
                  <span class="amc-node-lvl">{node.levels} lvl</span>
                </Show>
              </span>
            </>
          )}
        </For>
      </div>

      <Show when={schem().looseCouplings.length > 0}>
        <div class="amc-loose">
          <For each={schem().looseCouplings}>
            {(c) => (
              <span class="amc-loose-item">
                ⇢ {c.between.join("↔")} {c.kind}
              </span>
            )}
          </For>
        </div>
      </Show>

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

      <Show when={hamiltonian()}>
        {(html) => (
          <div class="amc-ev-formula" data-slot="amicode-system-hamiltonian">
            <div class="amc-ev-formula-label">Hamiltonian</div>
            <div innerHTML={html()} />
          </div>
        )}
      </Show>
    </div>
  )
}
