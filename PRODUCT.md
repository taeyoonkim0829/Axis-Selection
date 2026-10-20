# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Internal sales/application engineers** (primary): take a customer inquiry, enter the transport conditions on an office PC, and pick an axis, motor, optional gearbox and mounting kit to quote.
- **Customers' machine designers**: sometimes use it directly, or look at the screen together with an engineer in a meeting. They need to see *why* a combination passes, not just that it does.

## Product Purpose

Size and select a Festo Cartesian axis, then a matching motor (Festo, Siemens, Mitsubishi), optional gearbox and Festo motor–axis mounting kit, from stroke, velocity, acceleration, jerk, payload, payload center of gravity and mounting orientation. Success: a defensible, orderable combination in minutes, with the calculation evidence visible.

## Positioning

Vendor tools (Festo Electric Motion Sizing, Rexroth LinSelect, SigmaSelect, Motorizer) each stay inside one maker's catalog. This tool sizes Festo mechanics against motors from three makers and resolves the mounting kit by interface code, which no single-vendor tool does.

## Operating Context

- Browser-only, runs locally (Vite dev server via `AxisPilot.bat`); no backend, product data bundled as JSON.
- Used at a desk on a wide screen; also shown on screen during customer meetings.
- Results leave the app as: a part-number list (BOM) pasted into quotes/orders, a printed/PDF calculation sheet for the customer, or simply read on screen.

## Capabilities and Constraints

- Selection order is strict: axis → motor → gearbox (optional, only when the user picks one) → kit. Each step depends on the previous.
- Check statuses: `ok`, `warn` (deflection, rated speed, regeneration), `fail` (hard limits). Missing data limits pass with a note.
- Kit inertia/torque data is not available yet; kits do not enter the calculation.
- Calculation logic in `src/calc/` is out of scope for UI work and must stay unchanged.
- UI text is Korean only.

## Brand Commitments

- Name: "AxisPilot" (formerly "Axis Selection"). Logo: `public/axispilot-logo.svg` (light backgrounds), `axispilot-logo-dark.svg` (dark backgrounds, used on the sign-blue rail), icon `axispilot-icon.svg`. The logo files are cropped to the artwork (viewBox `0 16 256 48`). Footer credit: © Kim Taeyoon.
- Domain terms in Korean as already used (직교 축, 모터, 감속기, 연결키트, 적합/주의/부적합).

## Evidence on Hand

- Real product data in `data/` (Festo ELGT/ELGD/EGC/ESBF axes, motors, gearboxes, kits).
- `images/center_of_gravity.png` (COG coordinate explanation).
- No customer testimonials, logos or case studies; none should be invented.

## Product Principles

1. Evidence over verdicts: every pass/fail shows the computed value, the limit and the margin.
2. The chain stays legible: the user always sees which axis, motor, gearbox and kit are selected and why the next step depends on them.
3. Fast for experts, explainable for customers: dense, keyboard-friendly input, with results readable by someone looking over the shoulder.
4. What leaves the app must be orderable as-is: part numbers exact, nothing truncated in exports.
