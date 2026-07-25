# Composition brief — Branch launch video (bigger cut)

Full storyboard: `brag-plan.md`. This is the condensed handoff to Hyperframes.

- **Format**: 1920×1080 landscape, 45.0s total, single root timeline (`main`).
- **Palette**: `#171614` bg, `#edeae4` ink, `#9a948b` muted, borders `#34322d`;
  branch colours blue `#3987e5`, amber `#c98500`, magenta `#d55181`, green
  `#34a853` — reuse the CSS custom properties from
  `brag-output-2026-07-24-220625/composition/index.html` verbatim (same variable
  names) so the two runs are visually consistent.
- **10 scenes**, `data-track-index` alternating 1/2 for HTML crossfades plus a
  dedicated higher track index per video layer (mirrors the previous run's
  s3/s4 pattern: HTML wrapper on one track, `<video>` diagram on another,
  crossfaded together by GSAP `opacity` only).
- **Manim clips** (alpha VP9 webm, same transcode settings as the previous run:
  `libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 30 -auto-alt-ref 0 -metadata:s:v:0
  alpha_mode="1"`): `main-thread.webm` (beat 2), `graph-canvas.webm` (beat 3),
  `multi-model.webm` (beat 4), `color-law.webm` (beat 9).
- **Plain-HTML beats** (no video layer): 1, 5, 6, 7, 8, 10 — cards/chips/pickers
  styled like the previous run's `.node`/`.chip`/`.picker`/`.meter` classes.
- **Audio**: same bundled track, referenced via a symlink-free copy into
  `composition/assets/music/` (copy the file, don't relatively reference the
  other run's directory — this run must be self-contained and independently
  deletable/movable).
- **Motion discipline**: no `back`/overshoot eases except the beat-1 chip snap;
  every Manim connector anchored to real node edges, no hand-typed rotate().

Gate before render: `npm run check` (0 errors) inside this run's `composition/`.
