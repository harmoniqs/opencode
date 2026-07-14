// AMICODE built-in widget: MEET AMICO — identity hero + capabilities + the
// "Open chat" front door. Vanilla DOM, --amc-* tokens only, no backticks or
// ${} inside widgetJs (it ships inside a TS template literal).

export const manifestToml = `
id = "meet-amico"
name = "Meet Amico"
version = "1.0.0"
description = "Who your pal is and what it can do — the front door to a fresh chat"
size = "hero"
height = 250
`

export const widgetJs = `
var CAN = [
  'design pulses from a conversation',
  'optimize for fidelity, speed, or robustness',
  'warm-start from your pulse bank',
  'tune & calibrate on real hardware',
]

export default {
  mount: function (el, amico) {
    var on = function (sel, fn) {
      var n = el.querySelector(sel)
      if (n) n.onclick = fn
    }
    var bullets = CAN.map(function (line) {
      return (
        '<div style="display:flex;gap:6px;align-items:baseline;min-width:0;font-size:12px;line-height:18px;color:var(--amc-text)">' +
        '<span style="color:var(--amc-accent);flex-shrink:0">&rsaquo;</span>' +
        '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + line + '</span></div>'
      )
    }).join('')
    el.innerHTML =
      '<div data-card style="display:flex;flex-direction:column;min-width:0;border:1px solid var(--amc-border);border-radius:10px;background:var(--amc-layer);padding:var(--amc-pad);cursor:pointer">' +
      '<div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--amc-text-faint)">Meet Amico</div>' +
      '<div style="display:flex;gap:12px;align-items:center;margin-top:10px">' +
      '<div aria-hidden="true" style="width:44px;height:44px;flex-shrink:0;border-radius:10px;border:2px solid var(--amc-accent);color:var(--amc-accent);display:flex;align-items:center;justify-content:center;font-family:var(--amc-font-mono);font-size:11px;font-weight:700">&lt;o|o&gt;</div>' +
      '<div style="min-width:0">' +
      '<div style="font-size:18px;font-weight:600;color:var(--amc-text)">Amico</div>' +
      '<div style="font-size:12px;line-height:16px;color:var(--amc-text-muted)">Your friendly Quantum Computing Agent</div>' +
      '<div data-engine style="font-size:11px;line-height:16px;color:var(--amc-text-faint)">powered by the Piccolo engine</div>' +
      '</div></div>' +
      '<div style="height:1px;background:var(--amc-border);margin:12px 0"></div>' +
      '<div style="font-size:11px;color:var(--amc-text-muted);margin-bottom:6px">I can help you</div>' +
      '<div style="display:flex;flex-direction:column;gap:3px;margin-bottom:12px">' + bullets + '</div>' +
      '<button type="button" data-cta style="align-self:flex-start;display:inline-flex;align-items:center;gap:10px;margin-top:4px;padding:12px 22px;border:none;border-radius:10px;cursor:pointer;background:var(--amc-accent);color:var(--amc-bg);font-size:15px;font-weight:650">Open chat <span aria-hidden="true" style="font-size:16px;line-height:1">&#8599;</span></button>' +
      '</div>'
    on('[data-cta]', function (e) {
      e.stopPropagation()
      amico.prompt('')
    })
    on('[data-card]', function () {
      amico.prompt('')
    })
    var applyDensity = function () {
      var engine = el.querySelector('[data-engine]')
      if (engine) engine.style.display = amico.density === 'tight' ? 'none' : ''
    }
    applyDensity()
    amico.onTheme(applyDensity)
  },
}
`
