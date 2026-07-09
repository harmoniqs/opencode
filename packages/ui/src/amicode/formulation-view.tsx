import { For, Show, createMemo } from "solid-js"
import katex from "katex"
import { formulationProjection, type PrimaryObjectiveKey, type FormulationTerm } from "./problem"
import { modeBadges } from "./facets"

// AMICODE Formulation hero (spec §6.2 / plan Task 14): a mode-badge header over
// the derived primary objective (LaTeX) + added-terms list + typed constraints +
// solve scalars. Thin — logic lives in formulationProjection / modeBadges; this
// file maps them to DOM. Styling in ./amicode.css.

// Keyed by the DERIVED primaryKey (disjoint from ObjectiveKind). Unknown → no math.
const OBJECTIVE_LATEX: Record<PrimaryObjectiveKey, string> = {
  ket_infidelity: "\\mathcal{F} = |\\langle \\psi_g | \\psi(T) \\rangle|^2",
  unitary_infidelity: "\\mathcal{F} = \\tfrac{1}{d^2}\\,|\\mathrm{Tr}(U_{\\mathrm{goal}}^\\dagger U)|^2",
  unitary_free_phase: "\\mathcal{F} = \\tfrac{1}{d^2}\\,|\\mathrm{Tr}(U_{\\mathrm{goal}}(\\theta)^\\dagger U)|^2",
  density_infidelity: "\\mathcal{F} = \\mathrm{Tr}(\\rho_g\\, \\rho(T))",
  min_time: "\\min\\; D \\textstyle\\sum_k \\Delta t_k \\quad \\mathrm{s.t.}\\; \\mathcal{F} \\ge \\mathcal{F}_0",
}
const PRIMARY_LABEL: Record<PrimaryObjectiveKey, string> = {
  ket_infidelity: "ket infidelity",
  unitary_infidelity: "unitary infidelity",
  unitary_free_phase: "free-phase unitary infidelity",
  density_infidelity: "density infidelity",
  min_time: "min-time (D · ΣΔt)",
}
const CONSTRAINT_LABEL: Record<string, string> = {
  bounds: "amplitude bound",
  du_bound: "slew bound (du)",
  ddu_bound: "accel bound (ddu)",
  dt_bounds: "Δt bounds",
  final_fidelity: "final fidelity",
  calibration_pin: "calibration pin",
}

const paramsText = (params: Record<string, number>): string =>
  Object.entries(params)
    .map(([k, v]) => `${k} ${v}`)
    .join(" · ")
const termText = (t: FormulationTerm): string => {
  const head = t.label ?? CONSTRAINT_LABEL[t.kind] ?? t.kind
  const p = paramsText(t.params)
  return p ? `${head} · ${p}` : head
}

export function FormulationView(props: { entity: Record<string, unknown> }) {
  const proj = createMemo(() => formulationProjection(props.entity))
  const badges = createMemo(() => modeBadges(proj() as unknown as Record<string, unknown>))
  const primaryHtml = createMemo(() => {
    const latex = OBJECTIVE_LATEX[proj().primaryKey]
    return latex ? katex.renderToString(latex, { throwOnError: false }) : undefined
  })
  // Synthesized (display-only) final_fidelity constraint row for min_time.
  const constraintRows = createMemo(() => {
    const p = proj()
    const rows = [...p.constraints]
    if (p.time_mode === "min_time" && typeof p.derivedFinalFidelity === "number")
      rows.push({ kind: "final_fidelity", params: { threshold: p.derivedFinalFidelity } })
    return rows
  })

  return (
    <div class="amc-formulation" data-component="amicode-formulation-view">
      <div class="amc-modebar" data-slot="amicode-formulation-modes">
        <For each={badges()}>
          {(b) => (
            <span class="amc-badge" classList={{ active: b.tone === "active" }}>
              <Show when={b.value} fallback={<span class="v">{b.label}</span>}>
                <span class="k">{b.label}</span>
                <span class="v">{b.value}</span>
              </Show>
            </span>
          )}
        </For>
      </div>

      <div class="amc-ev-sec">Objective</div>
      <div class="amc-obj" data-slot="amicode-formulation-objective">
        <div class="amc-obj-primary">
          <span class="amc-obj-name">{PRIMARY_LABEL[proj().primaryKey]}</span>
          <span class="amc-obj-tag">primary · derived</span>
        </div>
        <Show when={primaryHtml()}>{(html) => <div class="amc-obj-latex" innerHTML={html()} />}</Show>
        <For each={proj().objectives}>{(o) => <div class="amc-obj-term">+ {termText(o)}</div>}</For>
      </div>

      <Show when={constraintRows().length > 0}>
        <div class="amc-ev-sec">Constraints</div>
        <div class="amc-constraints" data-slot="amicode-formulation-constraints">
          <For each={constraintRows()}>{(c) => <div class="amc-constraint">{termText(c)}</div>}</For>
        </div>
      </Show>

      <Show when={proj().solve}>
        {(solve) => (
          <>
            <div class="amc-ev-sec">Solve</div>
            <div class="amc-solve" data-slot="amicode-formulation-solve">
              {paramsText(solve() as Record<string, number>)}
            </div>
          </>
        )}
      </Show>
    </div>
  )
}
