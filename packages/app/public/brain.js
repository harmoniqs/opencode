// GENERATED from amicode packages/extension/media/brain/brain.html (the canonical
// design artifact) — extracted to a separate file because the opencode server's
// CSP forbids inline scripts. Keep in sync by re-running the split, not by hand.
"use strict";
/* ================================================================
   amico is thinking — the shape of a thought
   A charted fugue over the real vault graph.
   Timing law:   every event snaps to a musical grid (default andante, q=84).
   Mechanics:    integrate-and-fire — arrival is not firing; scouts charge
                 nodes that may leak back to dark; refractory periods gate
                 re-firing; warm-start edges conduct saltatory (staccato 16ths).
   Payoff:       sharp-wave replay re-fires the committed path, then the
                 constellation is charted in first-touch order and named with
                 a plate number. The atlas keeps every charted thought.
   Brand law:    circles only; #fff676 belongs to live thought alone; four
                 fixed series hues by category; glow budget: pulse + active
                 node only.
   ================================================================ */

// live embeds render in wide frames — the layout (settle) goes natively wide
// for them, so this must be known before the graph settles
var liveWide = /[?&]mode=live/.test(location.search);

const DATA = {"nodes":[{"id":"strategy","label":"STRATEGY","type":"charter"},{"id":"philosophy","label":"PHILOSOPHY","type":"charter"},{"id":"roadmap","label":"ROADMAP","type":"charter"},{"id":"charter-research-loop","label":"charter: research loop","type":"charter"},{"id":"charter-pulse-catalog","label":"charter: pulse catalog","type":"charter"},{"id":"charter-agents-skills","label":"charter: agents & skills","type":"charter"},{"id":"insight-linear-over-cubic","label":"insight: linear>cubic spline","type":"insight"},{"id":"insight-linear51-fix","label":"insight: linear51 fix","type":"insight"},{"id":"insight-shorter-duration","label":"insight: shorter T0 helps","type":"insight"},{"id":"insight-warmstart-regression","label":"insight: warmstart regress","type":"insight"},{"id":"insight-y-coldstart-variance","label":"insight: Y coldstart var","type":"insight"},{"id":"insight-crosstalk","label":"insight: drive crosstalk","type":"insight"},{"id":"insight-free-phase-2q","label":"insight: free-phase 2q","type":"insight"},{"id":"insight-gn-hessian-fails","label":"insight: GN Hessian fails","type":"insight"},{"id":"insight-stagnation-dominant","label":"insight: stagnation dominant","type":"insight"},{"id":"insight-jit-multistart-thrash","label":"insight: JIT lock thrash","type":"insight"},{"id":"insight-warmstart-taxonomy","label":"insight: warm-start taxonomy","type":"insight"},{"id":"insight-coldstart-dominates","label":"insight: coldstart dominates","type":"insight"},{"id":"insight-free-phase-untried","label":"insight: free-phase untried","type":"insight"},{"id":"insight-mintime-2q","label":"insight: mintime improves 2q","type":"insight"},{"id":"insight-eagle-heron","label":"insight: eagle-heron OC","type":"insight"},{"id":"exp-flux-x-192727","label":"exp: fluxonium X (192727)","type":"experiment"},{"id":"exp-flux-x-193328","label":"exp: fluxonium X (193328)","type":"experiment"},{"id":"exp-flux-x-194147","label":"exp: fluxonium X (194147)","type":"experiment"},{"id":"exp-flux-y-194147","label":"exp: fluxonium Y","type":"experiment"},{"id":"exp-flux-h-194147","label":"exp: fluxonium H","type":"experiment"},{"id":"exp-flux-t-194147","label":"exp: fluxonium T","type":"experiment"},{"id":"exp-flux-y-020343","label":"exp: fluxonium Y (020343)","type":"experiment"},{"id":"exp-flux-sqrtx-020343","label":"exp: fluxonium sqrtX","type":"experiment"},{"id":"exp-flux-x-021602","label":"exp: fluxonium X (021602)","type":"experiment"},{"id":"exp-flux-y-021602","label":"exp: fluxonium Y (021602)","type":"experiment"},{"id":"exp-flux-x-v3","label":"exp: fluxonium X v3","type":"experiment"},{"id":"exp-flux-y-v3","label":"exp: fluxonium Y v3","type":"experiment"},{"id":"exp-flux-t-v3","label":"exp: fluxonium T v3","type":"experiment"},{"id":"exp-flux-y-q200k","label":"exp: fluxonium Y Q200k","type":"experiment"},{"id":"exp-flux-y-retry","label":"exp: fluxonium Y retry","type":"experiment"},{"id":"exp-rydberg-cz","label":"exp: rydberg CZ v1","type":"experiment"},{"id":"exp-flux-x-basis-comp","label":"exp: X basis comparison","type":"experiment"},{"id":"hyp-free-phase-gap","label":"hyp: free-phase flux gap","type":"note"},{"id":"hyp-dressed-goal-kets","label":"hyp: dressed kets unlock 2q","type":"note"},{"id":"hyp-augmented-gn","label":"hyp: augmented controls GN","type":"note"},{"id":"method-warm-start","label":"method: warm-start workflow","type":"note"},{"id":"method-cold-start","label":"method: cold-start 4-phase","type":"note"},{"id":"method-cubic-spline","label":"method: cubic-spline pulses","type":"note"},{"id":"method-free-phase","label":"method: free-phase 2q gates","type":"note"},{"id":"method-crosstalk-gates","label":"method: crosstalk-robust","type":"note"},{"id":"method-basis-comparison","label":"method: eigen vs fock basis","type":"note"},{"id":"method-presolve-diag","label":"method: pre-solve diag","type":"note"},{"id":"spec-analytic-derivatives","label":"spec: analytic derivatives","type":"note"},{"id":"brief-analog-magic","label":"brief: analog magic states","type":"note"},{"id":"pulse-flux-x-v1","label":"pulse: fluxonium-X-v1","type":"catalog"},{"id":"pulse-flux-x-v2","label":"pulse: fluxonium-X-v2","type":"catalog"},{"id":"pulse-flux-x-v3","label":"pulse: fluxonium-X-v3","type":"catalog"},{"id":"pulse-flux-y-v3","label":"pulse: fluxonium-Y-v3","type":"catalog"},{"id":"pulse-flux-t-v3","label":"pulse: fluxonium-T-v3","type":"catalog"},{"id":"pulse-rydberg-cz-v1","label":"pulse: rydberg-CZ-v1","type":"catalog"},{"id":"pulse-transmon-cz-v1","label":"pulse: transmon-CZ-v1","type":"catalog"},{"id":"pulse-transmon-x-v1","label":"pulse: transmon-X-v1","type":"catalog"},{"id":"local-workstation","label":"local-workstation","type":"resource"},{"id":"stanford-fluxonium-chip","label":"stanford fluxonium chip","type":"resource"},{"id":"hermes","label":"hermes","type":"resource"},{"id":"fluxonium-half-flux","label":"fluxonium @ half flux","type":"resource"},{"id":"transmon-two-qubit","label":"transmon two-qubit","type":"resource"},{"id":"rydberg-global","label":"rydberg global drive","type":"resource"},{"id":"using-amico","label":"using-amico","type":"skill"},{"id":"brainstorming","label":"brainstorming","type":"skill"},{"id":"debugging","label":"debugging","type":"skill"},{"id":"verification","label":"verification","type":"skill"},{"id":"tdd","label":"tdd","type":"skill"},{"id":"code-review","label":"code-review","type":"skill"},{"id":"setup","label":"setup","type":"skill"},{"id":"solve","label":"solve","type":"skill"},{"id":"demo","label":"demo","type":"skill"},{"id":"plot","label":"plot","type":"skill"},{"id":"analyze","label":"analyze","type":"skill"},{"id":"benchmark","label":"benchmark","type":"skill"},{"id":"ingest","label":"ingest","type":"skill"},{"id":"multistart","label":"multistart","type":"skill"},{"id":"objectives","label":"objectives","type":"skill"},{"id":"structural-analysis","label":"structural-analysis","type":"skill"},{"id":"hypothesis-review","label":"hypothesis-review","type":"skill"},{"id":"transmon","label":"transmon","type":"skill"},{"id":"fluxonium","label":"fluxonium","type":"skill"},{"id":"atoms","label":"atoms","type":"skill"},{"id":"ions","label":"ions","type":"skill"},{"id":"bosonic","label":"bosonic","type":"skill"},{"id":"amico-vault","label":"amico-vault","type":"skill"},{"id":"amico-catalog","label":"amico-catalog","type":"skill"},{"id":"amico-lab","label":"amico-lab","type":"skill"},{"id":"amico-strategy","label":"amico-strategy","type":"skill"},{"id":"amico-route","label":"amico-route","type":"skill"},{"id":"piccolo-dev","label":"piccolo-dev","type":"skill"},{"id":"piccolissimo-dev","label":"piccolissimo-dev","type":"skill"},{"id":"intonato-dev","label":"intonato-dev","type":"skill"},{"id":"stretto-dev","label":"stretto-dev","type":"skill"},{"id":"pr","label":"pr","type":"skill"},{"id":"test","label":"test","type":"skill"},{"id":"dream","label":"dream","type":"skill"},{"id":"dream-distill","label":"dream-distill","type":"skill"},{"id":"dream-connect","label":"dream-connect","type":"skill"},{"id":"dream-prune","label":"dream-prune","type":"skill"},{"id":"dream-synthesize","label":"dream-synthesize","type":"skill"},{"id":"dream-reflect","label":"dream-reflect","type":"skill"},{"id":"meeting","label":"meeting","type":"skill"},{"id":"hopper","label":"hopper","type":"skill"},{"id":"researcher","label":"researcher","type":"agent"},{"id":"experimenter","label":"experimenter","type":"agent"},{"id":"orchestrator","label":"orchestrator","type":"agent"},{"id":"dispatcher","label":"dispatcher","type":"agent"},{"id":"librarian","label":"librarian","type":"agent"},{"id":"engineer","label":"engineer","type":"agent"},{"id":"dreamer","label":"dreamer","type":"agent"},{"id":"piccolo-jl","label":"Piccolo.jl","type":"package"},{"id":"piccolissimo-jl","label":"Piccolissimo.jl","type":"package"},{"id":"intonato-jl","label":"Intonato.jl","type":"package"},{"id":"stretto-jl","label":"Stretto.jl","type":"package"},{"id":"namedtrajectories-jl","label":"NamedTrajectories.jl","type":"package"},{"id":"directtrajopt-jl","label":"DirectTrajOpt.jl","type":"package"},{"id":"altissimo-jl","label":"Altissimo.jl","type":"package"}],"edges":[{"s":"insight-linear-over-cubic","t":"exp-flux-x-192727","kind":"wikilink"},{"s":"insight-linear-over-cubic","t":"exp-flux-x-193328","kind":"wikilink"},{"s":"insight-linear-over-cubic","t":"exp-flux-x-194147","kind":"wikilink"},{"s":"insight-linear-over-cubic","t":"pulse-flux-x-v1","kind":"wikilink"},{"s":"insight-linear-over-cubic","t":"pulse-flux-x-v2","kind":"wikilink"},{"s":"insight-linear51-fix","t":"exp-flux-x-193328","kind":"wikilink"},{"s":"insight-linear51-fix","t":"exp-flux-x-194147","kind":"wikilink"},{"s":"insight-linear51-fix","t":"exp-flux-y-194147","kind":"wikilink"},{"s":"insight-linear51-fix","t":"exp-flux-y-020343","kind":"wikilink"},{"s":"insight-linear51-fix","t":"exp-flux-sqrtx-020343","kind":"wikilink"},{"s":"insight-linear51-fix","t":"insight-linear-over-cubic","kind":"wikilink"},{"s":"insight-shorter-duration","t":"exp-flux-y-020343","kind":"wikilink"},{"s":"insight-shorter-duration","t":"exp-flux-sqrtx-020343","kind":"wikilink"},{"s":"insight-shorter-duration","t":"exp-flux-y-v3","kind":"wikilink"},{"s":"insight-shorter-duration","t":"insight-linear51-fix","kind":"wikilink"},{"s":"insight-warmstart-regression","t":"exp-flux-x-021602","kind":"wikilink"},{"s":"insight-warmstart-regression","t":"exp-flux-y-021602","kind":"wikilink"},{"s":"insight-y-coldstart-variance","t":"exp-flux-y-q200k","kind":"wikilink"},{"s":"insight-y-coldstart-variance","t":"exp-flux-y-retry","kind":"wikilink"},{"s":"insight-y-coldstart-variance","t":"exp-flux-y-v3","kind":"wikilink"},{"s":"insight-y-coldstart-variance","t":"exp-flux-y-021602","kind":"wikilink"},{"s":"insight-crosstalk","t":"insight-eagle-heron","kind":"wikilink"},{"s":"insight-crosstalk","t":"method-crosstalk-gates","kind":"wikilink"},{"s":"insight-free-phase-2q","t":"method-free-phase","kind":"wikilink"},{"s":"insight-free-phase-2q","t":"transmon-two-qubit","kind":"wikilink"},{"s":"insight-gn-hessian-fails","t":"hyp-augmented-gn","kind":"wikilink"},{"s":"insight-gn-hessian-fails","t":"spec-analytic-derivatives","kind":"wikilink"},{"s":"insight-stagnation-dominant","t":"exp-flux-h-194147","kind":"wikilink"},{"s":"insight-stagnation-dominant","t":"exp-flux-t-v3","kind":"wikilink"},{"s":"insight-stagnation-dominant","t":"exp-flux-x-v3","kind":"wikilink"},{"s":"insight-stagnation-dominant","t":"exp-flux-y-q200k","kind":"wikilink"},{"s":"insight-stagnation-dominant","t":"exp-flux-y-retry","kind":"wikilink"},{"s":"insight-stagnation-dominant","t":"exp-flux-y-v3","kind":"wikilink"},{"s":"insight-stagnation-dominant","t":"insight-y-coldstart-variance","kind":"wikilink"},{"s":"insight-stagnation-dominant","t":"insight-warmstart-regression","kind":"wikilink"},{"s":"insight-stagnation-dominant","t":"insight-coldstart-dominates","kind":"wikilink"},{"s":"insight-stagnation-dominant","t":"insight-free-phase-untried","kind":"wikilink"},{"s":"insight-stagnation-dominant","t":"insight-warmstart-taxonomy","kind":"wikilink"},{"s":"exp-flux-x-194147","t":"strategy","kind":"wikilink"},{"s":"exp-flux-x-194147","t":"exp-flux-x-192727","kind":"wikilink"},{"s":"exp-flux-x-194147","t":"exp-flux-x-193328","kind":"wikilink"},{"s":"exp-flux-x-194147","t":"pulse-flux-x-v1","kind":"wikilink"},{"s":"exp-flux-x-194147","t":"pulse-flux-x-v2","kind":"wikilink"},{"s":"exp-flux-x-194147","t":"fluxonium-half-flux","kind":"wikilink"},{"s":"exp-flux-x-194147","t":"local-workstation","kind":"wikilink"},{"s":"exp-flux-x-v3","t":"strategy","kind":"wikilink"},{"s":"exp-flux-x-v3","t":"pulse-flux-x-v2","kind":"wikilink"},{"s":"exp-flux-x-v3","t":"pulse-flux-x-v3","kind":"wikilink"},{"s":"exp-flux-x-v3","t":"fluxonium-half-flux","kind":"wikilink"},{"s":"exp-flux-x-v3","t":"local-workstation","kind":"wikilink"},{"s":"exp-flux-y-v3","t":"strategy","kind":"wikilink"},{"s":"exp-flux-y-v3","t":"exp-flux-y-194147","kind":"wikilink"},{"s":"exp-flux-y-v3","t":"exp-flux-y-020343","kind":"wikilink"},{"s":"exp-flux-y-v3","t":"pulse-flux-y-v3","kind":"wikilink"},{"s":"exp-flux-y-v3","t":"fluxonium-half-flux","kind":"wikilink"},{"s":"exp-flux-y-v3","t":"local-workstation","kind":"wikilink"},{"s":"exp-flux-t-v3","t":"strategy","kind":"wikilink"},{"s":"exp-flux-t-v3","t":"exp-flux-t-194147","kind":"wikilink"},{"s":"exp-flux-t-v3","t":"pulse-flux-t-v3","kind":"wikilink"},{"s":"exp-flux-t-v3","t":"fluxonium-half-flux","kind":"wikilink"},{"s":"exp-flux-t-v3","t":"local-workstation","kind":"wikilink"},{"s":"exp-rydberg-cz","t":"pulse-rydberg-cz-v1","kind":"wikilink"},{"s":"exp-rydberg-cz","t":"rydberg-global","kind":"wikilink"},{"s":"exp-flux-x-basis-comp","t":"fluxonium-half-flux","kind":"wikilink"},{"s":"exp-flux-x-basis-comp","t":"method-basis-comparison","kind":"wikilink"},{"s":"hyp-free-phase-gap","t":"insight-free-phase-2q","kind":"wikilink"},{"s":"researcher","t":"amico-strategy","kind":"dispatch"},{"s":"researcher","t":"hypothesis-review","kind":"dispatch"},{"s":"researcher","t":"structural-analysis","kind":"dispatch"},{"s":"researcher","t":"brainstorming","kind":"dispatch"},{"s":"researcher","t":"objectives","kind":"dispatch"},{"s":"experimenter","t":"setup","kind":"dispatch"},{"s":"experimenter","t":"solve","kind":"dispatch"},{"s":"experimenter","t":"transmon","kind":"dispatch"},{"s":"experimenter","t":"fluxonium","kind":"dispatch"},{"s":"experimenter","t":"atoms","kind":"dispatch"},{"s":"experimenter","t":"ions","kind":"dispatch"},{"s":"experimenter","t":"bosonic","kind":"dispatch"},{"s":"experimenter","t":"multistart","kind":"dispatch"},{"s":"experimenter","t":"benchmark","kind":"dispatch"},{"s":"experimenter","t":"demo","kind":"dispatch"},{"s":"experimenter","t":"plot","kind":"dispatch"},{"s":"librarian","t":"amico-vault","kind":"dispatch"},{"s":"librarian","t":"amico-catalog","kind":"dispatch"},{"s":"librarian","t":"analyze","kind":"dispatch"},{"s":"librarian","t":"ingest","kind":"dispatch"},{"s":"librarian","t":"hopper","kind":"dispatch"},{"s":"dreamer","t":"dream","kind":"dispatch"},{"s":"dreamer","t":"dream-distill","kind":"dispatch"},{"s":"dreamer","t":"dream-connect","kind":"dispatch"},{"s":"dreamer","t":"dream-prune","kind":"dispatch"},{"s":"dreamer","t":"dream-synthesize","kind":"dispatch"},{"s":"dreamer","t":"dream-reflect","kind":"dispatch"},{"s":"engineer","t":"piccolo-dev","kind":"dispatch"},{"s":"engineer","t":"piccolissimo-dev","kind":"dispatch"},{"s":"engineer","t":"intonato-dev","kind":"dispatch"},{"s":"engineer","t":"stretto-dev","kind":"dispatch"},{"s":"engineer","t":"tdd","kind":"dispatch"},{"s":"engineer","t":"test","kind":"dispatch"},{"s":"engineer","t":"pr","kind":"dispatch"},{"s":"engineer","t":"code-review","kind":"dispatch"},{"s":"engineer","t":"debugging","kind":"dispatch"},{"s":"engineer","t":"verification","kind":"dispatch"},{"s":"orchestrator","t":"using-amico","kind":"dispatch"},{"s":"orchestrator","t":"amico-route","kind":"dispatch"},{"s":"orchestrator","t":"meeting","kind":"dispatch"},{"s":"dispatcher","t":"amico-lab","kind":"dispatch"},{"s":"dispatcher","t":"solve","kind":"dispatch"},{"s":"dispatcher","t":"multistart","kind":"dispatch"},{"s":"piccolo-dev","t":"piccolo-jl","kind":"uses"},{"s":"piccolissimo-dev","t":"piccolissimo-jl","kind":"uses"},{"s":"intonato-dev","t":"intonato-jl","kind":"uses"},{"s":"stretto-dev","t":"stretto-jl","kind":"uses"},{"s":"solve","t":"piccolo-jl","kind":"uses"},{"s":"solve","t":"piccolissimo-jl","kind":"uses"},{"s":"setup","t":"piccolo-jl","kind":"uses"},{"s":"benchmark","t":"piccolo-jl","kind":"uses"},{"s":"objectives","t":"piccolo-jl","kind":"uses"},{"s":"plot","t":"piccolo-jl","kind":"uses"},{"s":"piccolo-jl","t":"namedtrajectories-jl","kind":"uses"},{"s":"piccolo-jl","t":"directtrajopt-jl","kind":"uses"},{"s":"directtrajopt-jl","t":"namedtrajectories-jl","kind":"uses"},{"s":"piccolissimo-jl","t":"altissimo-jl","kind":"uses"},{"s":"intonato-jl","t":"piccolo-jl","kind":"uses"},{"s":"amico-strategy","t":"strategy","kind":"uses"},{"s":"amico-strategy","t":"roadmap","kind":"uses"},{"s":"using-amico","t":"philosophy","kind":"uses"},{"s":"amico-route","t":"charter-agents-skills","kind":"uses"},{"s":"amico-catalog","t":"charter-pulse-catalog","kind":"uses"},{"s":"dream","t":"charter-research-loop","kind":"uses"},{"s":"dream","t":"dream-distill","kind":"uses"},{"s":"dream","t":"dream-reflect","kind":"uses"},{"s":"dream","t":"dream-connect","kind":"uses"},{"s":"dream","t":"dream-prune","kind":"uses"},{"s":"dream","t":"dream-synthesize","kind":"uses"},{"s":"amico-lab","t":"local-workstation","kind":"uses"},{"s":"amico-lab","t":"hermes","kind":"uses"},{"s":"amico-lab","t":"stanford-fluxonium-chip","kind":"uses"},{"s":"fluxonium","t":"fluxonium-half-flux","kind":"uses"},{"s":"fluxonium","t":"stanford-fluxonium-chip","kind":"uses"},{"s":"transmon","t":"transmon-two-qubit","kind":"uses"},{"s":"atoms","t":"rydberg-global","kind":"uses"},{"s":"setup","t":"method-cold-start","kind":"uses"},{"s":"setup","t":"method-cubic-spline","kind":"uses"},{"s":"amico-catalog","t":"method-warm-start","kind":"uses"},{"s":"structural-analysis","t":"method-presolve-diag","kind":"uses"},{"s":"structural-analysis","t":"insight-stagnation-dominant","kind":"uses"},{"s":"debugging","t":"method-presolve-diag","kind":"uses"},{"s":"multistart","t":"insight-jit-multistart-thrash","kind":"uses"},{"s":"multistart","t":"method-cold-start","kind":"uses"},{"s":"hypothesis-review","t":"hyp-free-phase-gap","kind":"uses"},{"s":"hypothesis-review","t":"hyp-dressed-goal-kets","kind":"uses"},{"s":"hypothesis-review","t":"hyp-augmented-gn","kind":"uses"},{"s":"amico-catalog","t":"pulse-flux-x-v2","kind":"uses"},{"s":"amico-catalog","t":"pulse-flux-y-v3","kind":"uses"},{"s":"amico-catalog","t":"pulse-transmon-cz-v1","kind":"uses"},{"s":"amico-catalog","t":"pulse-transmon-x-v1","kind":"uses"},{"s":"exp-flux-x-194147","t":"insight-linear-over-cubic","kind":"produces"},{"s":"exp-flux-y-q200k","t":"insight-y-coldstart-variance","kind":"produces"},{"s":"exp-flux-y-retry","t":"insight-y-coldstart-variance","kind":"produces"},{"s":"exp-flux-x-021602","t":"insight-warmstart-regression","kind":"produces"},{"s":"exp-flux-y-021602","t":"insight-warmstart-regression","kind":"produces"},{"s":"exp-flux-y-020343","t":"insight-linear51-fix","kind":"produces"},{"s":"exp-flux-y-v3","t":"insight-shorter-duration","kind":"produces"},{"s":"exp-flux-x-v3","t":"pulse-flux-x-v3","kind":"produces"},{"s":"exp-flux-y-v3","t":"pulse-flux-y-v3","kind":"produces"},{"s":"exp-flux-t-v3","t":"pulse-flux-t-v3","kind":"produces"},{"s":"exp-rydberg-cz","t":"pulse-rydberg-cz-v1","kind":"produces"},{"s":"ingest","t":"exp-rydberg-cz","kind":"produces"},{"s":"ingest","t":"exp-flux-x-basis-comp","kind":"produces"},{"s":"dream-synthesize","t":"insight-stagnation-dominant","kind":"produces"},{"s":"dream-synthesize","t":"insight-warmstart-taxonomy","kind":"produces"},{"s":"dream-synthesize","t":"insight-coldstart-dominates","kind":"produces"},{"s":"dream-synthesize","t":"insight-free-phase-untried","kind":"produces"},{"s":"dream-distill","t":"insight-jit-multistart-thrash","kind":"produces"},{"s":"dream-distill","t":"hyp-dressed-goal-kets","kind":"produces"},{"s":"analyze","t":"insight-y-coldstart-variance","kind":"produces"},{"s":"researcher","t":"brief-analog-magic","kind":"produces"}],"traces":[{"id":"fluxonium-x-gate","title":"optimize a fluxonium X gate","steps":[{"node":"using-amico","status":"loading using-amico: skill map + conventions","fanout":["amico-route"]},{"node":"brainstorming","status":"clarifying target: X gate, 99.99% fidelity goal","fanout":["objectives","demo"]},{"node":"fluxonium","status":"loading fluxonium hamiltonian + drive selection","fanout":["transmon","stanford-fluxonium-chip"]},{"node":"amico-catalog","status":"warm-start lookup: catalog/pulses/fluxonium-X\u2026","fanout":["pulse-flux-x-v1","charter-pulse-catalog"]},{"node":"pulse-flux-x-v2","status":"found fluxonium-X-v2: best prior pulse","fanout":["pulse-flux-x-v1","pulse-flux-x-v3"]},{"node":"insight-linear-over-cubic","status":"reading insight: linear splines beat cubic","fanout":["insight-linear51-fix","method-cubic-spline"]},{"node":"insight-shorter-duration","status":"checking insight: shorter T0 improves fidelity","fanout":["insight-warmstart-regression"]},{"node":"setup","status":"building SplinePulseProblem: linear, 51 knots","fanout":["method-cold-start","objectives"]},{"node":"piccolo-jl","status":"assembling Piccolo problem + GL4 integrator","fanout":["namedtrajectories-jl","directtrajopt-jl"]},{"node":"solve","status":"solving: iter 120, inf_pr 3.2e-9, fid 99.99%","fanout":["local-workstation"]},{"node":"analyze","status":"analyzing run: no stagnation, clean convergence","fanout":["plot","benchmark"]},{"node":"librarian","status":"dispatching librarian to record results","fanout":["amico-vault"]},{"node":"exp-flux-x-v3","status":"writing experiments/exp-\u2026-fluxonium-X-v3","fanout":["strategy"]},{"node":"amico-catalog","status":"ingesting pulse: fluxonium-X-v3 into catalog","fanout":["pulse-flux-x-v3","ingest"]}]},{"id":"debug-stagnation","title":"debug solver stagnation","steps":[{"node":"debugging","status":"reproducing: inf_pr stuck at 0.289 after 200 it","fanout":["verification"]},{"node":"structural-analysis","status":"predicting: free-phase? warm-start? integrator?","fanout":["method-presolve-diag"]},{"node":"insight-stagnation-dominant","status":"reading synthesis: stagnation dominant failure","fanout":["insight-warmstart-taxonomy","insight-coldstart-dominates"]},{"node":"insight-y-coldstart-variance","status":"matching pattern: Y-gate cold-start variance","fanout":["exp-flux-y-q200k","exp-flux-y-retry"]},{"node":"insight-warmstart-regression","status":"ruling out warm-start regression path","fanout":["exp-flux-x-021602"]},{"node":"multistart","status":"dispatching K=8 parallel cold starts","fanout":["dispatcher","insight-jit-multistart-thrash"]},{"node":"insight-jit-multistart-thrash","status":"checking JIT cache-lock thrash mitigation","fanout":["local-workstation"]},{"node":"piccolissimo-jl","status":"inspecting Piccolissimo GL4 jacobian path","fanout":["altissimo-jl"]},{"node":"solve","status":"re-solving best seed: inf_pr 1.1e-8, converged","fanout":["local-workstation"]},{"node":"verification","status":"verifying fidelity claim against rollout","fanout":["analyze"]}]},{"id":"dream-cycle","title":"dream cycle","steps":[{"node":"dreamer","status":"waking dreamer: nightly consolidation","fanout":["dream"]},{"node":"dream","status":"orchestrating distill, connect, prune, synth","fanout":["charter-research-loop"]},{"node":"dream-distill","status":"distilling 14 session transcripts into notes","fanout":["amico-vault"]},{"node":"dream-reflect","status":"writing retrospectives for solver sessions","fanout":["insight-jit-multistart-thrash"]},{"node":"dream-connect","status":"densifying graph: scanning insights for links","fanout":["insight-linear-over-cubic","insight-shorter-duration","insight-crosstalk","insight-free-phase-2q"]},{"node":"dream-connect","status":"linking exp notes to pulse catalog entries","fanout":["exp-flux-y-v3","exp-flux-t-v3","pulse-flux-y-v3","pulse-flux-t-v3"]},{"node":"dream-connect","status":"cross-linking hypotheses to evidence","fanout":["hyp-free-phase-gap","hyp-augmented-gn","insight-gn-hessian-fails","spec-analytic-derivatives"]},{"node":"dream-prune","status":"resolving TBDs, fixing frontmatter drift","fanout":["exp-flux-y-retry","exp-flux-y-q200k"]},{"node":"dream-synthesize","status":"hunting cross-platform patterns in 40+ runs","fanout":["insight-mintime-2q","insight-eagle-heron","exp-rydberg-cz"]},{"node":"insight-coldstart-dominates","status":"new insight: cold start dominates fluxonium","fanout":["insight-free-phase-untried"]},{"node":"insight-warmstart-taxonomy","status":"new insight: warm-start failure taxonomy","fanout":["insight-stagnation-dominant"]},{"node":"amico-vault","status":"committing vault: 3 new notes, 12 new links","fanout":["librarian"]}]},{"id":"morning-briefing","title":"morning research briefing","steps":[{"node":"amico-strategy","status":"loading current research strategy","fanout":["roadmap"]},{"node":"strategy","status":"reading STRATEGY: P2 fluxonium gate suite","fanout":["philosophy","roadmap"]},{"node":"hypothesis-review","status":"ranking open hypotheses by testability","fanout":["researcher"]},{"node":"hyp-free-phase-gap","status":"checking hyp: free-phase fluxonium gap","fanout":["insight-free-phase-2q"]},{"node":"hyp-dressed-goal-kets","status":"checking hyp: dressed kets unlock 2q gates","fanout":["hyp-augmented-gn"]},{"node":"exp-flux-x-v3","status":"scanning recent runs: X v3 hit 99.99%","fanout":["exp-flux-y-v3","exp-flux-t-v3"]},{"node":"insight-stagnation-dominant","status":"surfacing blocker: stagnation on cold starts","fanout":["multistart"]},{"node":"researcher","status":"drafting briefing with researcher agent","fanout":["amico-vault"]},{"node":"brief-analog-magic","status":"writing research-briefs entry for today","fanout":["strategy"]}]},{"id":"benchmark-rydberg-cz","title":"benchmark a rydberg CZ pulse","steps":[{"node":"using-amico","status":"loading skill map + path conventions","fanout":["amico-route"]},{"node":"atoms","status":"loading rydberg physics: blockade, global drive","fanout":["ions","bosonic"]},{"node":"amico-catalog","status":"warm-start lookup: catalog/pulses/rydberg-CZ-v1","fanout":["pulse-rydberg-cz-v1","pulse-transmon-cz-v1"]},{"node":"exp-rydberg-cz","status":"reading exp: rydberg CZ v1 provenance","fanout":["rydberg-global"]},{"node":"benchmark","status":"recomputing fidelity with current Piccolo","fanout":["piccolo-jl"]},{"node":"piccolo-jl","status":"rebuilding system: rydberg global drive","fanout":["namedtrajectories-jl"]},{"node":"solve","status":"rollout: fidelity matches recorded to 1e-4","fanout":["local-workstation"]},{"node":"plot","status":"plotting pulse + population transfer","fanout":["demo"]},{"node":"amico-vault","status":"appending benchmark table to exp note","fanout":["librarian"]}]}]};

/* ---------- category mapping (fixed, never cycled) ---------- */
const CAT_OF_TYPE = {
  note: "knowledge", insight: "knowledge", charter: "knowledge",
  experiment: "results", catalog: "results",
  skill: "skills",
  package: "code", resource: "code",
  agent: "agents",
  core: "core",
};
const CAT_LABEL = {
  knowledge: "knowledge — notes · insights · charter",
  skills: "skills — procedures amico follows",
  results: "results — experiments · pulse catalog",
  code: "code — Piccolo stack packages",
  agents: "agents — the actors",
  thought: "live thought",
};

/* ---------- tokens (re-read on theme change) ---------- */
const css = {};
function readTokens() {
  const s = getComputedStyle(document.documentElement);
  const g = (n) => s.getPropertyValue(n).trim();
  css.surface = g("--surface"); css.fg = g("--fg"); css.muted = g("--muted");
  css.edgeRest = g("--edge-rest"); css.nodeFill = g("--node-rest-fill");
  css.nodeBorder = g("--node-rest-border"); css.thought = g("--thought");
  // Light-only (unset on dark → ""): the dark hairline that bounds the lemon
  // signal — yellow is a fill, never a bare line on paper.
  css.thoughtEdge = g("--thought-edge");
  css.ember = g("--ember"); css.vignette = g("--vignette");
  css.labelHalo = g("--label-halo"); css.accent = g("--accent") || "#fff676";
  css.cat = {
    knowledge: g("--cat-knowledge"), results: g("--cat-results"),
    skills: g("--cat-skills"), code: g("--cat-code"), agents: g("--cat-agents"),
    core: css.thought,
  };
  buildSprites();
}
const mqDark = matchMedia("(prefers-color-scheme: dark)");
mqDark.addEventListener("change", readTokens);
new MutationObserver(readTokens).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(hex, a) {
  if (hex.startsWith("rgba") || hex.startsWith("rgb")) return hex;
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function mix(hexA, hexB, t) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}

/* ---------- square-bloom sprites (glow budget: live things only) ---------- */
const sprites = {};
function makeBloom(color) {
  const S = 64, c = document.createElement("canvas");
  c.width = c.height = S;
  const x = c.getContext("2d");
  // stacked circles, not a radial gradient: the bloom keeps the (now round) motif
  const steps = [[30, 0.28], [22, 0.35], [14, 0.5]];
  for (const [half, a] of steps) {
    x.fillStyle = rgba(color, a * 0.35);
    x.beginPath();
    x.arc(S / 2, S / 2, half, 0, Math.PI * 2);
    x.fill();
  }
  return c;
}
function buildSprites() {
  sprites.thought = makeBloom(css.thought);
  for (const k of ["knowledge", "results", "skills", "code", "agents"]) sprites[k] = makeBloom(css.cat[k]);
}

/* ---------- graph construction ---------- */
const nodes = [], byId = new Map(), edges = [], adj = new Map();
function addNode(n) {
  if (byId.has(n.id)) return byId.get(n.id);
  const node = {
    id: n.id, label: n.label, type: n.type, cat: CAT_OF_TYPE[n.type] || "knowledge",
    x: 0, y: 0, fx: 0, fy: 0, deg: 0,
    claimed: false, flash: 0, charge: 0, consider: 0, labelA: 0,
    refractUntil: -1, ringT: -1, touchedAt: -1, uses: 0, breathe: Math.random() * 6.28,
  };
  nodes.push(node); byId.set(n.id, node);
  return node;
}
function addEdge(s, t, kind) {
  if (s === t || !byId.has(s) || !byId.has(t)) return null;
  const key = s < t ? s + "|" + t : t + "|" + s;
  if (addEdge.seen.has(key)) return addEdge.seen.get(key);
  const e = { s: byId.get(s), t: byId.get(t), kind: kind || "wikilink", passes: 0, ember: 0, myelin: false, liveT: -1, ghost: kind === "thought" };
  addEdge.seen.set(key, e); edges.push(e);
  byId.get(s).deg++; byId.get(t).deg++;
  if (!adj.has(s)) adj.set(s, []);
  if (!adj.has(t)) adj.set(t, []);
  adj.get(s).push({ to: t, e }); adj.get(t).push({ to: s, e });
  return e;
}
addEdge.seen = new Map();

for (const n of DATA.nodes) addNode(n);
addNode({ id: "amico", label: "amico", type: "core" });
for (const n of DATA.nodes) if (n.type === "agent") addEdge("amico", n.id, "dispatch");
if (byId.has("using-amico")) addEdge("amico", "using-amico", "dispatch");
for (const e of DATA.edges) addEdge(e.s, e.t, e.kind);
// a thought may connect notes the vault has not linked yet: consecutive trace
// steps without a vault edge get a dashed "thought edge", invisible until used
for (const tr of DATA.traces) {
  let prev = "amico";
  for (const st of tr.steps) {
    if (!byId.has(st.node)) continue;
    const hasPath = bfs(prev, st.node, 4);
    if (!hasPath) addEdge(prev, st.node, "thought");
    prev = st.node;
  }
}
function bfs(a, b, maxHops) {
  if (a === b) return [a];
  const q = [[a]], seen = new Set([a]);
  while (q.length) {
    const path = q.shift();
    if (path.length > (maxHops || 6)) continue;
    for (const { to } of adj.get(path[path.length - 1]) || []) {
      if (seen.has(to)) continue;
      const np = path.concat(to);
      if (to === b) return np;
      seen.add(to); q.push(np);
    }
  }
  return null;
}

/* size classes — atlas magnitudes, quantized, never continuous */
for (const n of nodes) {
  n.half = n.type === "core" ? 8 : n.cat === "agents" ? 6.5 : n.deg > 9 ? 6 : n.deg > 5 ? 5 : n.deg > 2 ? 4 : 3;
}

/* ---------- layout: cluster-anchored force settle, then frozen ---------- */
const CLUSTER_ANGLE = { knowledge: -Math.PI / 2, skills: Math.PI * 0.05, results: Math.PI / 2, code: Math.PI * 0.95, agents: 0, core: 0 };
function settle() {
  // live embeds live in wide frames: lay the graph out natively wide (wide
  // anchor ellipse + anisotropic gravity) so distances stay isotropic — a
  // warped projection reads as squashed, a wide LAYOUT reads as a landscape
  const AX = liveWide ? 2.3 : 1;
  const AY = liveWide ? 0.75 : 1;
  const R = 340;
  let i = 0;
  for (const n of nodes) {
    const ang = CLUSTER_ANGLE[n.cat] + (Math.sin(i * 12.9898) * 0.55);
    const rad = n.cat === "agents" ? 90 + (i % 5) * 18 : n.type === "core" ? 0 : R * (0.55 + ((i * 0.618) % 0.45));
    n.x = Math.cos(ang) * rad * AX + Math.sin(i * 78.233) * 40;
    n.y = Math.sin(ang) * rad * AY + Math.cos(i * 37.719) * 40;
    i++;
  }
  const core = byId.get("amico"); core.x = 0; core.y = 0;
  for (let it = 0; it < 380; it++) {
    for (const n of nodes) { n.fx = 0; n.fy = 0; }
    for (let a = 0; a < nodes.length; a++) {
      for (let b = a + 1; b < nodes.length; b++) {
        const A = nodes[a], B = nodes[b];
        let dx = A.x - B.x, dy = A.y - B.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { d2 = 1; dx = Math.sin(a * 7 + b); dy = Math.cos(a - b * 3); }
        const f = 1900 / d2;
        const d = Math.sqrt(d2);
        A.fx += (dx / d) * f; A.fy += (dy / d) * f;
        B.fx -= (dx / d) * f; B.fy -= (dy / d) * f;
      }
    }
    for (const e of edges) {
      const dx = e.t.x - e.s.x, dy = e.t.y - e.s.y;
      const d = Math.max(Math.sqrt(dx * dx + dy * dy), 0.01);
      const rest = e.kind === "dispatch" ? 95 : 70;
      const f = (d - rest) * 0.015 * (e.ghost ? 0.25 : 1);
      e.s.fx += (dx / d) * f * d * 0.02; e.s.fy += (dy / d) * f * d * 0.02;
      e.t.fx -= (dx / d) * f * d * 0.02; e.t.fy -= (dy / d) * f * d * 0.02;
    }
    for (const n of nodes) {
      const ang = CLUSTER_ANGLE[n.cat];
      const ax = n.type === "core" ? 0 : Math.cos(ang) * (n.cat === "agents" ? 100 : 300) * AX;
      const ay = n.type === "core" ? 0 : Math.sin(ang) * (n.cat === "agents" ? 100 : 300) * AY;
      n.fx += (ax - n.x) * 0.004; n.fy += (ay - n.y) * 0.004;
      n.fx += -n.x * (liveWide ? 0.0008 : 0.0012); n.fy += -n.y * (liveWide ? 0.0034 : 0.0012);
      if (n.type !== "core") { n.x += Math.max(-6, Math.min(6, n.fx)); n.y += Math.max(-6, Math.min(6, n.fy)); }
    }
  }
  if (liveWide) {
    // stretch-then-relax: pull the settled layout wide, then let springs
    // restore natural local distances inside a vertically-contained envelope
    // — locally isotropic structure, globally wide silhouette
    for (const n of nodes) if (n.type !== "core") n.x *= 3.1;
    for (let it = 0; it < 150; it++) {
      for (const n of nodes) { n.fx = 0; n.fy = 0; }
      for (let a = 0; a < nodes.length; a++) {
        for (let b = a + 1; b < nodes.length; b++) {
          const A = nodes[a], B = nodes[b];
          let dx = A.x - B.x, dy = A.y - B.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) { d2 = 1; dx = Math.sin(a * 7 + b); dy = Math.cos(a - b * 3); }
          const f = 1900 / d2;
          const d = Math.sqrt(d2);
          A.fx += (dx / d) * f; A.fy += (dy / d) * f;
          B.fx -= (dx / d) * f; B.fy -= (dy / d) * f;
        }
      }
      for (const e of edges) {
        const dx = e.t.x - e.s.x, dy = e.t.y - e.s.y;
        const d = Math.max(Math.sqrt(dx * dx + dy * dy), 0.01);
        const rest = e.kind === "dispatch" ? 95 : 70;
        const f = (d - rest) * 0.015 * (e.ghost ? 0.25 : 1);
        e.s.fx += (dx / d) * f * d * 0.02; e.s.fy += (dy / d) * f * d * 0.02;
        e.t.fx -= (dx / d) * f * d * 0.02; e.t.fy -= (dy / d) * f * d * 0.02;
      }
      for (const n of nodes) {
        n.fx += -n.x * 0.0004; // gentle horizontal containment
        n.fy += -n.y * 0.009; // firm vertical envelope
        if (n.type !== "core") { n.x += Math.max(-6, Math.min(6, n.fx)); n.y += Math.max(-6, Math.min(6, n.fy)); }
      }
    }
  }
  // normalize into a unit box we can fit to any viewport
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, sx = 0, sy = 0;
  for (const n of nodes) { minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x); minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y); sx += n.x; sy += n.y; }
  // the amico core IS the center of the world — everything references it
  const core0 = byId.get("amico");
  const cx = core0.x, cy = core0.y, span = Math.max(maxX - minX, maxY - minY);
  for (const n of nodes) { n.x = (n.x - cx) / span; n.y = (n.y - cy) / span; }
}
settle();

/* ---------- canvas & camera ---------- */
const stage = document.getElementById("stage");
const ctx = stage.getContext("2d");
let W = 0, H = 0, DPR = 1, worldScale = 1;
var xSpread = 1;
function resize() {
  DPR = Math.min(devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  stage.width = W * DPR; stage.height = H * DPR;
  stage.style.width = W + "px"; stage.style.height = H + "px";
  worldScale = Math.min(W, H) * 0.86;
  xSpread = 1; // the wide shape lives in the LAYOUT (settle), never in a warped projection
}
addEventListener("resize", resize);
resize();

const cam = { x: 0, y: 0, k: 1, tx: 0, ty: 0, tk: 1, manualUntil: -1 };
function nx(n) { return (n.x * xSpread * worldScale - cam.x) * cam.k + W / 2; }
function ny(n) { return (n.y * worldScale - cam.y) * cam.k + H / 2; }

/* ---------- musical clock ---------- */
const TEMPI = [
  { bpm: 42, name: "largo" }, { bpm: 84, name: "andante" },
  { bpm: 126, name: "allegro" }, { bpm: 168, name: "presto" },
];
const clock = { beat: 0, tempoIx: 1, rubato: 0, stretto: 0, lastMs: 0 };
function bpmNow() {
  const base = TEMPI[clock.tempoIx].bpm * (1 + clock.stretto * 0.33);
  return base * (1 + clock.rubato * 0.08 * Math.sin(clock.beat * 0.9));
}
const queue = [];
function at(beatsFromNow, fn) { queue.push({ t: clock.beat + beatsFromNow, fn }); }
function runDue() {
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].t <= clock.beat) { const q = queue.splice(i, 1)[0]; q.fn(); }
  }
}
function beatsToMs(b) { return (b * 60000) / bpmNow(); }

/* ---------- pulses ---------- */
const pulses = [];
function firePulse(e, from, kind, durBeats, onArrive) {
  const rev = e.s !== from;
  pulses.push({ e, rev, kind, t0: clock.beat, dur: durBeats, onArrive, trail: [], done: false });
  e.liveT = clock.beat;
}
function pulsePos(p, tNorm) {
  let q = tNorm;
  if (p.e.myelin) { // saltatory: three staccato leaps, dwell between
    const seg = Math.min(2, Math.floor(q * 3));
    const local = q * 3 - seg;
    const eased = local < 0.55 ? (local / 0.55) : 1; // fast leap, brief dwell
    q = (seg + eased) / 3;
  } else if (p.kind === "commit") {
    q = q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2; // on-beat depart/arrive
  } // scouts stay linear: constant conduction velocity, feel the geometry
  const a = p.rev ? p.e.t : p.e.s, b = p.rev ? p.e.s : p.e.t;
  return { x: nx(a) + (nx(b) - nx(a)) * q, y: ny(a) + (ny(b) - ny(a)) * q, q };
}

/* ---------- thought player ---------- */
const atlas = []; // charted constellations, permanent for the session
let plate = 0;
const ROMAN = ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII","XIII","XIV","XV","XVI","XVII","XVIII","XIX","XX"];
const player = {
  trace: null, stepIx: 0, cur: "amico", touched: [], routeEdges: [],
  running: false, paused: false, phase: "idle",
  chart: null, drain: 1,
};

function claim(node) {
  node.claimed = true;
  node.flash = 1;
  node.ringT = clock.beat;
  node.labelA = 1;
  node.touchedAt = clock.beat;
  node.uses++;
  node.refractUntil = clock.beat + 2;
}
function conduct(node) { // pass-through: signal conducts, node does not claim
  node.consider = Math.max(node.consider, 0.55);
}
function potentiate(e) {
  e.passes++;
  e.ember = Math.min(0.15 + 0.175 * e.passes, 0.5);
}

function setStatus(text, instant) {
  const el = document.getElementById("status-text");
  const pretty = text.replace(/([\w./~-]+\/[\w./~-]+|\/[a-z-]+|[\w-]+\.(md|jl|json))/g, '<span class="path">$1</span>');
  if (reduceMotion || instant) { el.innerHTML = pretty; return; }
  el.innerHTML = "";
  let i = 0;
  const plain = text;
  const iv = setInterval(() => {
    i += 2;
    if (i >= plain.length) { el.innerHTML = pretty; clearInterval(iv); }
    else el.textContent = plain.slice(0, i);
  }, 18);
}
function setTempoMark(txt) { document.getElementById("tempo-mark").innerHTML = txt; }

function startTrace(trace) {
  // reset live state; the atlas (charted constellations + myelin) persists
  for (const n of nodes) { n.flash = 0; n.consider = 0; n.charge = 0; if (!n.atlasKeep) { n.claimed = false; n.labelA = Math.min(n.labelA, 0.45); } }
  for (const e of edges) { if (!e.atlasKeep) e.ember = Math.min(e.ember, e.myelin ? 0.25 : 0); }
  pulses.length = 0; queue.length = 0;
  player.trace = trace; player.stepIx = 0; player.cur = "amico";
  player.touched = []; player.routeEdges = []; player.running = true;
  player.phase = "wake"; player.drain = 1; clock.stretto = 0; clock.rubato = 0;
  const core = byId.get("amico");
  core.flash = 1; core.ringT = clock.beat; core.labelA = 1;
  setStatus("reading task: " + trace.title + "&hellip;");
  setTempoMark(TEMPI[clock.tempoIx].name + " &middot; &#9833;= " + TEMPI[clock.tempoIx].bpm);
  document.querySelector("#wordmark .verb").textContent = "is thinking";
  at(reduceMotion ? 0.1 : 2, nextStep);
}

function nextStep() {
  // pausing freezes the clock, which freezes the queue — no guard needed here
  if (!player.running) return;
  const tr = player.trace;
  if (player.stepIx >= tr.steps.length) return completeTrace();
  const step = tr.steps[player.stepIx];
  const target = byId.get(step.node);
  if (!target) { player.stepIx++; return nextStep(); }

  // rubato breathes during the middle of the thought; stretto compresses the end
  const frac = player.stepIx / tr.steps.length;
  clock.rubato = frac > 0.25 && frac < 0.75 ? 1 : 0;
  clock.stretto = frac > 0.8 ? 1 : 0;
  if (clock.stretto) setTempoMark("stretto &middot; &#9833;= " + Math.round(bpmNow()));
  else if (!clock.rubato) setTempoMark(TEMPI[clock.tempoIx].name + " &middot; &#9833;= " + TEMPI[clock.tempoIx].bpm);

  setStatus(step.status);

  if (reduceMotion) { // static narrative: fades only, no travel
    const path = bfs(player.cur, step.node) || [player.cur, step.node];
    for (let i = 0; i + 1 < path.length; i++) {
      const rec = (adj.get(path[i]) || []).find(a => a.to === path[i + 1]);
      if (rec) { potentiate(rec.e); player.routeEdges.push(rec.e); }
    }
    claim(target); player.touched.push(target); player.cur = step.node;
    player.stepIx++;
    at(0.9, nextStep);
    return;
  }

  // scout fan: broken chord on 16ths — considered, dimmer, may die dark
  const fans = (step.fanout || []).filter(id => byId.has(id)).slice(0, 4);
  fans.forEach((fid, k) => {
    at(0.25 * k, () => {
      const rec = (adj.get(player.cur) || []).find(a => a.to === fid);
      const fnode = byId.get(fid);
      if (rec) firePulse(rec.e, byId.get(player.cur), "scout", 0.5, () => { fnode.consider = 1; });
      else fnode.consider = 0.7;
    });
  });

  // commit traverse departs on the next downbeat, one beat per hop
  const path = bfs(player.cur, step.node) || [player.cur, step.node];
  const departIn = Math.max(1, Math.ceil(fans.length * 0.25) + 0.75);
  at(departIn, () => hop(path, 0, target, step));
  player.stepIx++;
}

function hop(path, i, target, step) {
  if (i + 1 >= path.length) return;
  const from = byId.get(path[i]);
  const rec = (adj.get(path[i]) || []).find(a => a.to === path[i + 1]);
  if (!rec) return arriveAt(target, step);
  const isLast = i + 2 >= path.length;
  const warm = /warm|catalog|cached/.test(step.status) && isLast;
  if (warm) rec.e.myelin = true;
  const dur = rec.e.myelin ? 0.5 : 1;
  firePulse(rec.e, from, "commit", dur, () => {
    potentiate(rec.e);
    player.routeEdges.push(rec.e);
    if (isLast) arriveAt(target, step);
    else { conduct(byId.get(path[i + 1])); hop(path, i + 1, target, step); }
  });
}
function arriveAt(target, step) {
  if (target.refractUntil > clock.beat && target.claimed) {
    target.ringT = clock.beat; target.uses++; // refractory: ring, no re-flare
  } else claim(target);
  player.touched.push(target);
  player.cur = target.id;
  const breather = player.stepIx % 6 === 0 && player.stepIx > 0;
  at(breather ? 2 : 0.5, nextStep);
}

function completeTrace() {
  player.phase = "quiesce";
  clock.stretto = 0; clock.rubato = 0;
  setStatus("consolidating&hellip;");
  for (const n of nodes) n.consider = 0; // unfired tissue leaks to rest
  const seq = [];
  const seen = new Set();
  for (const n of player.touched) if (!seen.has(n.id)) { seen.add(n.id); seq.push(n); }

  const doChart = () => {
    player.phase = "chart";
    plate++;
    const con = {
      pts: seq, title: player.trace.title,
      plate: ROMAN[(plate - 1) % ROMAN.length],
      progress: 0, alpha: 1, born: clock.beat,
    };
    atlas.push(con);
    player.chart = con;
    for (const n of seq) { n.atlasKeep = true; n.labelA = Math.max(n.labelA, 0.8); }
    for (const e of player.routeEdges) e.atlasKeep = true;
    const segs = Math.max(seq.length - 1, 1);
    const chartBeats = reduceMotion ? 0.1 : Math.min(segs * 0.28, 6);
    const t0 = clock.beat;
    const tickChart = () => {
      con.progress = Math.min((clock.beat - t0) / chartBeats, 1);
      if (con.progress < 1) at(0.05, tickChart);
      else {
        player.phase = "named";
        setStatus("charted: " + player.trace.title + " &middot; " + seq.length + " nodes &middot; plate " + con.plate, true);
        document.querySelector("#wordmark .verb").textContent = "thought complete";
        setTempoMark("fermata &#119056;");
        // accent drains: yellow belongs only to live thought
        const d0 = clock.beat;
        const drainTick = () => {
          player.drain = Math.max(1 - (clock.beat - d0) / 3, 0);
          if (player.drain > 0) at(0.08, drainTick);
          else {
            player.phase = "idle"; player.running = false;
            if (document.getElementById("auto").checked) at(6, autoAdvance);
          }
        };
        drainTick();
      }
    };
    tickChart();
    // frame the constellation
    let mnX = 1e9, mxX = -1e9, mnY = 1e9, mxY = -1e9;
    for (const n of seq) { mnX = Math.min(mnX, n.x); mxX = Math.max(mxX, n.x); mnY = Math.min(mnY, n.y); mxY = Math.max(mxY, n.y); }
    cam.tx = ((mnX + mxX) / 2) * worldScale; cam.ty = ((mnY + mxY) / 2) * worldScale;
    cam.tk = Math.min(1.5, 0.72 / Math.max(mxX - mnX, mxY - mnY, 0.35));
  };

  if (reduceMotion) { at(0.2, doChart); return; }

  // sharp-wave replay: one fast sweep re-fires the committed path in order
  at(1.5, () => {
    player.phase = "replay";
    setStatus("replaying committed path&hellip;", true);
    const route = player.routeEdges.slice();
    let cur = "amico";
    const replayNext = (k) => {
      if (k >= route.length) { at(1, doChart); return; }
      const e = route[k];
      const from = (e.s.id === cur) ? e.s : (e.t.id === cur ? e.t : e.s);
      firePulse(e, from, "replay", 0.22, () => {
        cur = (from === e.s) ? e.t.id : e.s.id;
        replayNext(k + 1);
      });
    };
    replayNext(0);
  });
}

function autoAdvance() {
  if (isLiveEmbed || player.running || !document.getElementById("auto").checked) return;
  const sel = document.getElementById("scenario");
  const ix = (DATA.traces.findIndex(t => t.id === sel.value) + 1) % DATA.traces.length;
  sel.value = DATA.traces[ix].id;
  startTrace(DATA.traces[ix]);
}

/* ---------- ambient: tacet, not silence ---------- */
let nextTwinkle = 2, nextGhost = 8;
function ambient() {
  if (player.running || reduceMotion) return;
  if (clock.beat > nextTwinkle) {
    nextTwinkle = clock.beat + (isLiveEmbed ? 1.5 + Math.random() * 2.5 : 3 + Math.random() * 4);
    const n = nodes[(Math.random() * nodes.length) | 0];
    n.consider = Math.max(n.consider, 0.3); // scintillation
  }
  if (clock.beat > nextGhost) {
    nextGhost = clock.beat + (isLiveEmbed ? 4 + Math.random() * 4 : 10 + Math.random() * 8);
    const e = edges[(Math.random() * edges.length) | 0];
    if (!e.ghost) firePulse(e, e.s, "ghost", 1.5, () => {});
  }
}

/* ---------- render ---------- */
let unfurl = reduceMotion ? 1 : 0;
function draw(nowMs) {
  if (haltBrain) return; // host said stop (loader dismissed) — end the rAF chain
  const dt = Math.min(nowMs - (clock.lastMs || nowMs), 50);
  clock.lastMs = nowMs;
  if (!player.paused) clock.beat += (dt / 60000) * bpmNow();
  runDue(); ambient();
  if (unfurl < 1) unfurl = Math.min(unfurl + dt / 1400, 1);
  const uf = 1 - Math.pow(1 - unfurl, 3);

  // camera easing (manual interaction wins for 6s)
  if (clock.beat > cam.manualUntil) {
    if (isLiveEmbed) {
      if (H < 120) {
        // condensed = a CLOSE-UP on where amico is (never a miniature map);
        // glances steer the eye since most nodes live outside this window
        const glanced = live.glance && live.glance.until > clock.beat ? byId.get(live.glance.id) : null;
        const cur = glanced || byId.get(live.cur);
        if (cur) {
          cam.tx = cur.x * xSpread * worldScale;
          cam.ty = cur.y * worldScale;
          cam.tk = Math.min(8, Math.max(1.05, 320 / worldScale));
        }
      } else {
        // expanded = the WHOLE network with the AMICO CORE dead center (the
        // core is the world origin); zoom fits the farthest node from it so
        // nothing clips. Recomputed per frame so grafts never fall outside.
        let hw = 0.01, hh = 0.01;
        for (const n of nodes) {
          const ax = Math.abs(n.x), ay = Math.abs(n.y);
          if (ax > hw) hw = ax;
          if (ay > hh) hh = ay;
        }
        cam.tx = 0;
        cam.ty = 0;
        cam.tk = Math.min((W - 28) / (2 * hw * xSpread * worldScale), (H - 14) / (2 * hh * worldScale));
      }
    } else if (player.running && player.touched.length && player.phase !== "chart" && player.phase !== "named") {
      const last = player.touched.slice(-3);
      let ax = 0, ay = 0;
      for (const n of last) { ax += n.x; ay += n.y; }
      cam.tx = (ax / last.length) * worldScale * 0.45; cam.ty = (ay / last.length) * worldScale * 0.45;
      cam.tk = 1.04;
    } else if (!player.running && player.phase === "idle") { cam.tx = 0; cam.ty = 0; cam.tk = 1; }
  }
  // a hover glance deserves a brisk look, not a two-second pan
  const camEase = isLiveEmbed && live.glance && live.glance.until > clock.beat ? 0.14 : 0.035;
  cam.x += (cam.tx - cam.x) * camEase; cam.y += (cam.ty - cam.y) * camEase; cam.k += (cam.tk - cam.k) * camEase;

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (isTransparentEmbed) ctx.clearRect(0, 0, W, H); // transparent ground — host shows through
  else { ctx.fillStyle = css.surface; ctx.fillRect(0, 0, W, H); }

  const breathe = reduceMotion ? 0 : Math.sin(nowMs / 4800) * 0.04; // 0.1 Hz field respiration

  // vignette: darkness has texture; the fog pools away from center
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, css.vignette);

  // ---- charted constellations (the atlas — survey lines + cartouche)
  for (const con of atlas) {
    const live = con === player.chart && (player.phase === "chart" || player.phase === "named");
    const drain = live ? player.drain : 0;
    const lineCol = drain > 0 ? mix(css.fg, css.thought, drain) : css.fg;
    const total = con.pts.length - 1;
    const upto = con.progress * total;
    ctx.lineWidth = 1;
    for (let i = 0; i < total; i++) {
      const a = con.pts[i], b = con.pts[i + 1];
      const segT = Math.max(Math.min(upto - i, 1), 0);
      if (segT <= 0) break;
      ctx.strokeStyle = rgba(lineCol.startsWith("rgb") ? css.fg : lineCol, (0.16 + drain * 0.5) * con.alpha);
      if (drain > 0) ctx.strokeStyle = rgba(css.thought, (0.2 + drain * 0.5) * con.alpha);
      ctx.beginPath();
      ctx.moveTo(nx(a), ny(a));
      ctx.lineTo(nx(a) + (nx(b) - nx(a)) * segT, ny(a) + (ny(b) - ny(a)) * segT);
      if (drain > 0 && css.thoughtEdge) {
        // two-pass: dark under-stroke, lemon core (the fill+edge model as a line)
        ctx.strokeStyle = rgba(css.thoughtEdge, (0.25 + drain * 0.5) * con.alpha);
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.strokeStyle = rgba(css.thought, (0.2 + drain * 0.5) * con.alpha);
      }
      ctx.stroke();
    }
  }

  // ---- edges
  for (const e of edges) {
    const x1 = nx(e.s), y1 = ny(e.s), x2 = nx(e.t), y2 = ny(e.t);
    if ((x1 < -40 && x2 < -40) || (x1 > W + 40 && x2 > W + 40) || (y1 < -40 && y2 < -40) || (y1 > H + 40 && y2 > H + 40)) continue;
    let alpha, color = css.ember, width = 1;
    if (e.ember > 0) {
      alpha = e.ember * (0.55 + breathe);
      if (e.passes >= 3) width = 2;
    } else {
      alpha = null; // skeleton: every latent path stays visible — ghosts too, just dimmer
    }
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    if (alpha === null) {
      // live embeds show ALL possible pathways clearly, not as a whisper
      ctx.strokeStyle = isTransparentEmbed ? rgba(css.fg, 0.2) : css.edgeRest;
      if (e.ghost) ctx.globalAlpha = 0.55;
    } else ctx.strokeStyle = rgba(color, alpha);
    ctx.lineWidth = width;
    if (e.ghost) ctx.setLineDash([3, 4]);
    else if (e.myelin) ctx.setLineDash([7, 2]); // segmented sheath: nodes of Ranvier
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // ---- pulses (heads are squares; trails are the last six 32nd positions)
  for (let i = pulses.length - 1; i >= 0; i--) {
    const p = pulses[i];
    const tN = (clock.beat - p.t0) / p.dur;
    if (tN >= 1) {
      pulses.splice(i, 1);
      if (p.onArrive) p.onArrive();
      continue;
    }
    const pos = pulsePos(p, Math.max(tN, 0));
    const dim = p.kind === "scout" ? 0.5 : p.kind === "ghost" ? 0.14 : 1;
    const size = p.kind === "replay" ? 5 : p.kind === "scout" ? 3 : 4;
    // trail: sample on the 32nd grid
    if (!p.lastSample || clock.beat - p.lastSample >= 0.125) {
      p.lastSample = clock.beat;
      p.trail.unshift({ x: pos.x, y: pos.y });
      if (p.trail.length > 6) p.trail.pop();
    }
    p.trail.forEach((tp, k) => {
      const a = dim * 0.4 * (1 - k / 6);
      const s = size * (1 - k / 8);
      ctx.fillStyle = rgba(css.thought, a);
      ctx.beginPath(); ctx.arc(tp.x, tp.y, s / 2, 0, Math.PI * 2); ctx.fill();
    });
    if (p.kind !== "ghost") {
      const spr = sprites.thought;
      ctx.globalAlpha = 0.5 * dim;
      ctx.drawImage(spr, pos.x - 16, pos.y - 16, 32, 32);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = rgba(css.thought, Math.min(dim + 0.15, 1));
    ctx.beginPath(); ctx.arc(pos.x, pos.y, size / 2, 0, Math.PI * 2); ctx.fill();
    if (css.thoughtEdge) {
      // the lemon pulse gets a hairline ring so it reads on paper
      ctx.strokeStyle = rgba(css.thoughtEdge, Math.min(dim + 0.15, 1));
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // ---- nodes
  ctx.textBaseline = "middle";
  for (const n of nodes) {
    const x = nx(n), y = ny(n);
    if (x < -60 || x > W + 60 || y < -60 || y > H + 60) continue;
    // embeds are monochrome + brand yellow (Kate): every claimed node wears
    // the thought color — the categorical palette lives only in the
    // standalone demo, where the legend explains it
    const catColor = isTransparentEmbed ? css.thought : css.cat[n.cat] || css.fg;
    let half = n.half * (0.6 + 0.4 * uf) * (n.uses > 1 ? 1 + Math.min(n.uses, 4) * 0.08 : 1);
    if (n.flash > 0) { half *= 1 + n.flash * 0.35; n.flash = Math.max(n.flash - dt / 420, 0); }
    if (n.consider > 0) n.consider = Math.max(n.consider - dt / 2600, 0);
    const isCore = n.type === "core";
    const coreBr = isCore && !reduceMotion ? (Math.sin(nowMs / 2500 + 1) * 0.5 + 0.5) * 0.35 : 0;

    // glow budget: flash or live-considered only
    if (n.flash > 0.02) {
      ctx.globalAlpha = n.flash;
      ctx.drawImage(sprites.thought, x - half * 4, y - half * 4, half * 8, half * 8);
      ctx.globalAlpha = 1;
    } else if (n.claimed && player.running && sprites[n.cat]) {
      ctx.globalAlpha = 0.35 + breathe;
      ctx.drawImage(sprites[n.cat], x - half * 3, y - half * 3, half * 6, half * 6);
      ctx.globalAlpha = 1;
    }

    ctx.beginPath();
    ctx.arc(x, y, half, 0, Math.PI * 2);

    if (n.flash > 0.55) {
      ctx.fillStyle = css.thought; // all-or-nothing: the attack is pure accent
      ctx.fill();
      if (css.thoughtEdge) {
        // bounded lemon: the flash fill takes the light-mode hairline
        ctx.strokeStyle = rgba(css.thoughtEdge, 0.9);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    } else if (n.claimed) {
      const sustain = n.atlasKeep && !player.running ? 0.55 : 0.85;
      ctx.fillStyle = rgba(catColor, sustain * (n.flash > 0 ? 1 : 0.9) + coreBr);
      ctx.fill();
      // light: a lemon node can't bound itself — the edge goes dark (hairline)
      ctx.strokeStyle = css.thoughtEdge ? rgba(css.thoughtEdge, 0.9) : rgba(catColor, 0.9);
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      // untraversed tissue recedes in embeds — the traversed path owns the
      // contrast; anything live (considered, charging, the core) stays bright
      const chargeGlow = Math.max(n.consider, isCore ? 0.5 + coreBr : 0);
      const restDim = isTransparentEmbed && chargeGlow <= 0.05 ? 0.42 : 1;
      ctx.globalAlpha = restDim;
      ctx.fillStyle = css.nodeFill;
      ctx.fill();
      ctx.strokeStyle = chargeGlow > 0
        ? rgba(isCore ? css.thought : catColor, 0.25 + chargeGlow * 0.6)
        : css.nodeBorder;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (n.cat === "agents") { // agents wear a double border — same circle, framed
      ctx.beginPath();
      ctx.arc(x, y, half + 2.5, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(catColor, n.claimed ? 0.8 : isTransparentEmbed ? 0.16 : 0.3);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // survey ring: an expanding circle, emitted on fire
    if (n.ringT >= 0) {
      const rt = (clock.beat - n.ringT) / 0.7;
      if (rt < 1) {
        const rh = half + rt * half * 2.6;
        ctx.beginPath();
        ctx.arc(x, y, rh, 0, Math.PI * 2);
        if (css.thoughtEdge) {
          // two-pass ring: dark under-stroke keeps the lemon visible on paper
          ctx.strokeStyle = rgba(css.thoughtEdge, (1 - rt) * 0.85);
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
        ctx.strokeStyle = rgba(css.thought, (1 - rt) * 0.8);
        ctx.lineWidth = 1;
        ctx.stroke();
      } else n.ringT = -1;
    }
    // labels: LOD — touched, considered, or hovered; halo for legibility
    let la = n.labelA;
    if (hover === n) la = 1;
    else if (n.consider > 0.4) la = Math.max(la, 0.5);
    if (n.labelA > 0 && !player.running && !n.atlasKeep) n.labelA = Math.max(n.labelA - dt / 9000, 0);
    if (n.atlasKeep && !player.running) n.labelA = Math.max(n.labelA - dt / 12000, 0.5);
    if (la > 0.03) {
      ctx.font = "10px JuliaMono, monospace";
      const tw = ctx.measureText(n.label).width;
      const lx = x + half + 6, ly = y;
      ctx.fillStyle = css.labelHalo;
      ctx.fillRect(lx - 2, ly - 7, tw + 4, 14);
      ctx.fillStyle = rgba(css.fg, Math.min(la, 1) * (n.atlasKeep ? 0.8 : 0.65));
      ctx.fillText(n.label, lx, ly);
    }
  }

  // where-we-are cursor: an always-visible ring on the current node — the
  // flare fades and glows are faint on the light surface, so position gets
  // its own explicit marker in the thought color (legible in both themes)
  const curNode = isLiveEmbed ? byId.get(live.cur) : player.running ? byId.get(player.cur) : null;
  if (curNode) {
    const cxp = nx(curNode), cyp = ny(curNode);
    const rr = curNode.half + 5 + (reduceMotion ? 0 : Math.sin(nowMs / 600) * 1.5);
    ctx.beginPath();
    ctx.arc(cxp, cyp, rr, 0, Math.PI * 2);
    if (css.thoughtEdge) {
      // the position marker must actually be legible on paper: dark under-ring
      ctx.strokeStyle = rgba(css.thoughtEdge, 0.9);
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.strokeStyle = rgba(css.thought, 0.85);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cxp, cyp, rr + 3.5, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(css.thought, 0.3);
    ctx.lineWidth = 1;
    ctx.stroke();
    curNode.labelA = 1; // the name of where we are stays readable
  }

  if (!isTransparentEmbed) { ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H); } // no fog on a transparent ground

  // cartouches ride above the vignette: the naming is chrome, not territory —
  // and in an embedded strip that chrome is clutter (Kate 2026-07-14): the
  // constellation lines stay, the names stay as data, the chips don't draw
  if (!isTransparentEmbed) for (const con of atlas) {
    if (con.progress >= 1) {
      const live = con === player.chart && (player.phase === "chart" || player.phase === "named");
      drawCartouche(con, live ? player.drain : 0);
    }
  }

  // wordmark integrate-and-fire ellipsis: fills on the beat while thinking
  const cells = document.querySelectorAll("#ifire i");
  if (player.running && !reduceMotion) {
    const ph = Math.floor(clock.beat % 3);
    cells.forEach((c, k) => c.classList.toggle("lit", k <= ph));
  } else cells.forEach(c => c.classList.remove("lit"));
  const caret = document.getElementById("caret");
  if (!reduceMotion) caret.classList.toggle("off", Math.floor(clock.beat * 2) % 2 === 1);

  requestAnimationFrame(draw);
}

function drawCartouche(con, drain) {
  // the naming: an accent chip beside the constellation, black JuliaMono text
  let cx0 = 0, cy0 = 0, mnY = 1e9;
  for (const n of con.pts) { cx0 += nx(n); cy0 += ny(n); mnY = Math.min(mnY, ny(n)); }
  cx0 /= con.pts.length;
  const pad = 8, lh = 15;
  ctx.font = "11px JuliaMono, monospace";
  const title = con.title;
  const meta = "plate " + con.plate + " · " + con.pts.length + " nodes";
  const w = Math.max(ctx.measureText(title).width, ctx.measureText(meta).width) + pad * 2;
  const h = lh * 2 + pad * 1.6;
  let bx = Math.min(Math.max(cx0 - w / 2, 12), W - w - 12);
  let by = Math.max(mnY - h - 26, 12);
  const liveA = 0.92;
  const restA = 0.55 * con.alpha;
  const a = drain > 0 ? liveA : restA;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(bx, by, w, h, 4); else ctx.rect(bx, by, w, h);
  if (drain > 0.05) {
    ctx.fillStyle = rgba(css.accent, a);
    ctx.fill();
    ctx.fillStyle = "#000";
  } else {
    ctx.fillStyle = css.labelHalo;
    ctx.fill();
    ctx.strokeStyle = css.nodeBorder;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = rgba(css.fg, 0.85);
  }
  ctx.fillText(title, bx + pad, by + pad + 4);
  ctx.globalAlpha = drain > 0.05 ? 0.75 : 0.6;
  ctx.fillText(meta, bx + pad, by + pad + 4 + lh);
  ctx.globalAlpha = 1;
}

/* ---------- interaction ---------- */
let hover = null, dragging = false, dragMoved = false, px0 = 0, py0 = 0;
const tooltip = document.getElementById("tooltip");
stage.addEventListener("pointermove", (ev) => {
  if (dragging) {
    cam.x -= (ev.clientX - px0) / cam.k; cam.y -= (ev.clientY - py0) / cam.k;
    cam.tx = cam.x; cam.ty = cam.y; cam.manualUntil = clock.beat + 8;
    px0 = ev.clientX; py0 = ev.clientY; dragMoved = true;
    return;
  }
  hover = null;
  let best = 14;
  for (const n of nodes) {
    const d = Math.hypot(nx(n) - ev.clientX, ny(n) - ev.clientY);
    if (d < best) { best = d; hover = n; }
  }
  stage.classList.toggle("overnode", !!hover);
  if (hover) {
    tooltip.style.display = "block";
    tooltip.style.left = Math.min(ev.clientX + 14, W - 240) + "px";
    tooltip.style.top = Math.min(ev.clientY + 14, H - 60) + "px";
    tooltip.innerHTML = hover.label + '<div class="type">' + hover.type + " · " + hover.deg + " links" + (hover.uses ? " · touched ×" + hover.uses : "") + "</div>";
  } else tooltip.style.display = "none";
});
stage.addEventListener("pointerdown", (ev) => { dragging = true; dragMoved = false; px0 = ev.clientX; py0 = ev.clientY; stage.classList.add("dragging"); stage.setPointerCapture(ev.pointerId); });
stage.addEventListener("pointerup", (ev) => {
  dragging = false; stage.classList.remove("dragging");
  if (!dragMoved && hover) { hover.labelA = 1; hover.consider = 1; }
});
stage.addEventListener("wheel", (ev) => {
  ev.preventDefault();
  const k0 = cam.k;
  cam.k = Math.min(Math.max(cam.k * (ev.deltaY < 0 ? 1.1 : 0.9), 0.45), 3);
  cam.tk = cam.k;
  // zoom about the pointer
  const wx = (ev.clientX - W / 2) / k0 + cam.x, wy = (ev.clientY - H / 2) / k0 + cam.y;
  cam.x = wx - (ev.clientX - W / 2) / cam.k; cam.y = wy - (ev.clientY - H / 2) / cam.k;
  cam.tx = cam.x; cam.ty = cam.y;
  cam.manualUntil = clock.beat + 8;
}, { passive: false });
stage.addEventListener("pointerleave", () => { tooltip.style.display = "none"; hover = null; });

/* ---------- controls ---------- */
const selScenario = document.getElementById("scenario");
for (const tr of DATA.traces) {
  const o = document.createElement("option");
  o.value = tr.id; o.textContent = tr.title;
  selScenario.appendChild(o);
}
selScenario.addEventListener("change", () => {
  const tr = DATA.traces.find(t => t.id === selScenario.value);
  if (tr) startTrace(tr);
});
document.getElementById("replay").addEventListener("click", () => {
  const tr = DATA.traces.find(t => t.id === selScenario.value) || DATA.traces[0];
  startTrace(tr);
});
const playBtn = document.getElementById("play");
playBtn.addEventListener("click", () => {
  player.paused = !player.paused;
  playBtn.textContent = player.paused ? "play" : "pause";
});
document.getElementById("tempo").addEventListener("click", () => {
  clock.tempoIx = (clock.tempoIx + 1) % TEMPI.length;
  const t = TEMPI[clock.tempoIx];
  document.getElementById("tempo").innerHTML = "&#9833;=" + t.bpm;
  setTempoMark(t.name + " &middot; &#9833;= " + t.bpm);
});
document.getElementById("clear").addEventListener("click", () => {
  atlas.length = 0; plate = 0; player.chart = null;
  for (const n of nodes) { n.atlasKeep = false; n.claimed = false; n.labelA = 0; n.uses = 0; }
  for (const e of edges) { e.atlasKeep = false; e.ember = 0; e.passes = 0; e.myelin = false; }
  setStatus("atlas cleared &middot; resting", true);
});
addEventListener("keydown", (ev) => {
  if (ev.key === " " && document.activeElement.tagName !== "SELECT") { ev.preventDefault(); playBtn.click(); }
  if (ev.key === "r") document.getElementById("replay").click();
});

/* ---------- legend ---------- */
const legend = document.getElementById("legend");
const counts = {};
for (const n of nodes) counts[n.cat] = (counts[n.cat] || 0) + 1;
for (const cat of ["knowledge", "skills", "results", "code", "agents", "thought"]) {
  const row = document.createElement("div");
  row.className = "row";
  const sw = document.createElement("span");
  sw.className = "sw " + cat;
  if (cat !== "agents" && cat !== "thought") sw.style.background = `var(--cat-${cat})`;
  row.appendChild(sw);
  const lbl = document.createElement("span");
  lbl.textContent = CAT_LABEL[cat];
  row.appendChild(lbl);
  if (counts[cat]) {
    const c = document.createElement("span");
    c.className = "count"; c.textContent = counts[cat];
    row.appendChild(c);
  }
  legend.appendChild(row);
}

/* ---------- embedding hooks ----------
   Standalone, none of this fires. A host embedding the page as a LOADER sets
   window.__AMICO_BRAIN_MODE__ = "loader" in a prior script (chrome hides; the
   map is the whole show) and dispatches "amico-brain-stop" when its content is
   ready (halts the render loop before the host removes the DOM). */
let haltBrain = false;
window.addEventListener("amico-brain-stop", () => { haltBrain = true; });
const EMBED_PARAMS = new URLSearchParams(location.search);
const EMBED_MODE = EMBED_PARAMS.get("mode") || window.__AMICO_BRAIN_MODE__ || "";
const isLoaderEmbed = EMBED_MODE === "loader";
const isInlineEmbed = EMBED_MODE === "inline";
const isLiveEmbed = EMBED_MODE === "live"; // event-driven: the host streams the REAL session
const isTransparentEmbed = isInlineEmbed || isLiveEmbed;
function applyEmbedTheme(cs) {
  if (cs !== "dark" && cs !== "light") return;
  document.documentElement.dataset.theme = cs;
  // a transparent iframe stays transparent ONLY if its color-scheme matches
  // the parent's — a mismatch makes the browser paint an opaque white backdrop
  document.documentElement.style.colorScheme = cs;
}
applyEmbedTheme(EMBED_PARAMS.get("colorScheme"));
if (isLoaderEmbed || isTransparentEmbed) {
  clock.tempoIx = 2; // allegro — an embedded moment earns a brisker thought
  for (const id of ["controls", "legend", "colophon"]) {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  }
}
if (isTransparentEmbed) {
  // inline/live = a living element inside a host UI (the chat's thinking state):
  // no chrome at all, transparent ground — the host surface shows through.
  for (const id of ["mast", "tooltip"]) {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  }
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
}

/* ---------- live mode: the thought is real ----------
   A same-origin host streams the session's actual tool events:
     postMessage({ source: "amico-brain", kind: "touch",
                   label, type, consider }, origin)
   Reads and skill invocations COMMIT — a pulse travels the skeleton and the
   node claims its color. Searches/globs CONSIDER — a scout flash that may
   leak back to dark. Labels matching skeleton nodes (skills match exactly)
   light the real graph; unknown files graft new nodes beside the current
   position over dashed thought-edges. The page answers {kind:"ready"} so a
   late-mounting host can replay the path so far. */
const live = { cur: "amico", queue: [], pumping: false, recent: new Map(), sinceChart: [], pendingChart: null, glance: null };
function maybeChart() {
  // charts wait for the queue to drain so a plate never misses its own
  // in-flight commits
  if (!live.pendingChart || live.pumping || live.queue.length) return;
  const { title, replay } = live.pendingChart;
  live.pendingChart = null;
  const pts = live.sinceChart.slice();
  live.sinceChart = [];
  if (pts.length >= 2) liveChart(pts, title, replay);
}
function liveChart(pts, title, instant) {
  // the quiet ceremony: survey lines draw at rest tone, the cartouche names
  // the thought "plate N · <prompt excerpt>" — no camera theatrics
  plate++;
  const con = {
    pts,
    title: title || "thought",
    plate: ROMAN[(plate - 1) % ROMAN.length],
    progress: instant || reduceMotion ? 1 : 0,
    alpha: 1,
    born: clock.beat,
  };
  atlas.push(con);
  for (const n of pts) {
    n.atlasKeep = true;
    n.labelA = Math.max(n.labelA, 0.7);
  }
  if (con.progress >= 1) return;
  for (const n of pts) n.consider = Math.max(n.consider, 0.4); // collective acknowledgment
  const t0 = clock.beat;
  const dur = Math.min(pts.length * 0.3, 3);
  const tick = () => {
    con.progress = Math.min((clock.beat - t0) / dur, 1);
    if (con.progress < 1) at(0.06, tick);
  };
  tick();
}
function spreadActivation(n) {
  // activation ripples: a real touch charges its skeleton neighbors — most
  // leak back to dark, some flash a sub-threshold scout. One event reads as
  // tissue responding, not a lone blip.
  if (reduceMotion) return;
  let fired = 0;
  for (const rec of adj.get(n.id) || []) {
    if (fired >= 4) break;
    if (Math.random() < 0.45) continue;
    const nb = byId.get(rec.to);
    if (!nb || nb.id === live.cur) continue;
    nb.consider = Math.max(nb.consider, 0.45 + Math.random() * 0.35);
    if (Math.random() < 0.7) firePulse(rec.e, n, "scout", 0.4 + Math.random() * 0.4, () => {});
    fired++;
  }
}
function findLiveNode(label) {
  const norm = label.toLowerCase().replace(/\.(md|jl|json|toml)$/, "");
  const id = "live-" + norm.replace(/[^a-z0-9]+/g, "-").slice(0, 48);
  return byId.get(norm) || byId.get(id) || nodes.find((x) => x.label.toLowerCase() === norm);
}
function liveNode(label, type) {
  const norm = label.toLowerCase().replace(/\.(md|jl|json|toml)$/, "");
  const id = "live-" + norm.replace(/[^a-z0-9]+/g, "-").slice(0, 48);
  let n = findLiveNode(label);
  if (n) return n;
  const src = byId.get(live.cur) || byId.get("amico");
  n = addNode({ id, label: label.slice(0, 28), type: type || "resource" });
  n.half = 4;
  const a = Math.random() * Math.PI * 2, r = 0.07 + Math.random() * 0.05;
  n.x = src.x + Math.cos(a) * r;
  n.y = src.y + Math.sin(a) * r;
  addEdge(src.id, n.id, "thought");
  return n;
}
function liveTouch(msg) {
  const label = String(msg.label || "").trim();
  if (!label) return;
  if (msg.replay) {
    // a prior turn's step: restore it to the atlas instantly and quietly —
    // the session's whole thought-path persists across turns
    const n = liveNode(label, msg.type);
    if (!msg.consider) {
      let path = bfs(live.cur, n.id, 4);
      if (!path) {
        addEdge(live.cur, n.id, "thought");
        path = [live.cur, n.id];
      }
      for (let i = 0; i + 1 < path.length; i++) {
        const rec = (adj.get(path[i]) || []).find((a) => a.to === path[i + 1]);
        if (rec) potentiate(rec.e);
      }
      if (!n.claimed) {
        claim(n);
        n.flash = 0.25; // an ember of a past firing, not a live one
      } else n.uses++;
      if (!live.sinceChart.includes(n)) live.sinceChart.push(n);
      live.cur = n.id;
    } else n.consider = Math.max(n.consider, 0.3);
    return;
  }
  const key = label + (msg.consider ? "?" : "!");
  if ((live.recent.get(key) ?? -9) > clock.beat - 2) return; // debounce repeats
  live.recent.set(key, clock.beat);
  const n = liveNode(label, msg.type);
  if (msg.consider) {
    n.consider = 1; // the flash itself is a fade — fine under reduced motion
    const rec = (adj.get(live.cur) || []).find((a) => a.to === n.id);
    if (rec && !reduceMotion) firePulse(rec.e, byId.get(live.cur), "scout", 0.5, () => {});
    return;
  }
  live.queue.push(n);
  livePump();
}
function livePump() {
  if (live.pumping) return;
  const n = live.queue.shift();
  if (!n) return;
  live.pumping = true;
  let path = bfs(live.cur, n.id, 4);
  if (path && path.length === 1) {
    // re-touching where we already are: make the repeat visible — a pulse
    // from the core out to the node (amico consulting it again)
    path = bfs("amico", n.id, 4);
  }
  if (!path) {
    addEdge(live.cur, n.id, "thought");
    path = [live.cur, n.id];
  }
  if (reduceMotion) { // no traveling pulses — the path still potentiates, fades only
    for (let i = 0; i + 1 < path.length; i++) {
      const rec = (adj.get(path[i]) || []).find((a) => a.to === path[i + 1]);
      if (rec) potentiate(rec.e);
    }
    const done0 = () => {
      if (n.refractUntil > clock.beat && n.claimed) { n.ringT = clock.beat; n.uses++; }
      else claim(n);
      live.cur = n.id;
      live.pumping = false;
      at(0.25, livePump);
    };
    done0();
    return;
  }
  const done = () => {
    if (n.refractUntil > clock.beat && n.claimed) {
      n.ringT = clock.beat;
      n.uses++;
    } else claim(n);
    if (!live.sinceChart.includes(n)) live.sinceChart.push(n);
    spreadActivation(n);
    live.cur = n.id;
    live.pumping = false;
    at(0.25, () => {
      livePump();
      maybeChart();
    });
  };
  const hop = (i) => {
    if (i + 1 >= path.length) return done();
    const rec = (adj.get(path[i]) || []).find((a) => a.to === path[i + 1]);
    if (!rec) return done();
    firePulse(rec.e, byId.get(path[i]), "commit", rec.e.myelin ? 0.5 : 1, () => {
      potentiate(rec.e);
      if (i + 2 >= path.length) done();
      else {
        conduct(byId.get(path[i + 1]));
        hop(i + 1);
      }
    });
  };
  hop(0);
}
if (isLiveEmbed) {
  window.addEventListener("message", (e) => {
    if (e.origin !== location.origin) return; // same-origin host only
    const d = e.data;
    if (!d || d.source !== "amico-brain") return;
    if (d.kind === "touch") liveTouch(d);
    else if (d.kind === "theme") applyEmbedTheme(d.colorScheme); // live theme flips flow through
    else if (d.kind === "highlight") {
      // a glance from the log: ring the node AND turn the camera to look at
      // it — in the collapsed close-up most nodes are outside the window, so
      // an unsteered ring is invisible
      const n = findLiveNode(String(d.label || ""));
      if (n) {
        n.ringT = clock.beat;
        n.consider = Math.max(n.consider, 0.9);
        n.labelA = 1;
        live.glance = { id: n.id, until: clock.beat + 3.5 };
      }
    } else if (d.kind === "chart") {
      live.pendingChart = { title: String(d.title || ""), replay: !!d.replay };
      maybeChart();
    } else if (d.kind === "pause") haltBrain = true; // folded away — stop burning frames
    else if (d.kind === "resume" && haltBrain) {
      haltBrain = false;
      clock.lastMs = 0; // dt is capped, so the gap doesn't lurch the clock
      requestAnimationFrame(draw);
    }
  });
  const core = byId.get("amico");
  core.flash = 1;
  core.ringT = clock.beat; // waking — the thought begins here
  try {
    window.parent.postMessage({ source: "amico-brain", kind: "ready" }, location.origin);
  } catch {}
}

/* ---------- go ---------- */
readTokens();
setStatus("waking&hellip;", true);
requestAnimationFrame(draw);
if (!isLiveEmbed) setTimeout(() => {
  selScenario.value = DATA.traces[0].id;
  startTrace(DATA.traces[0]);
}, reduceMotion || isLoaderEmbed || isInlineEmbed ? 400 : 1800); // embedded: think immediately
