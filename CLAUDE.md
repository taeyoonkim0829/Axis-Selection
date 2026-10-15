# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Axis Selection is a browser-only web app (React 19 + TypeScript + Vite, no backend; product data bundled as JSON). UI text is Korean only. Mounting kits are matched by interface code; kit inertia, torque and the like are not in the data yet, so kits do not enter the calculation.

## Domain

The app sizes and selects a Festo Cartesian (linear) axis, plus the matching motor mounting kit and motor, from user-entered transport conditions.

**Inputs:** stroke, velocity, acceleration, jerk, payload mass, payload center of gravity (x/y/z offsets), mounting orientation — floor (horizontal), wall (horizontal, side-mounted), or vertical.

**Selection outputs, in order (each step depends on the previous):**
1. **Axis** — Festo ELGT, ELGD, EGC (incl. EGC-HD, ELGD-WD)
2. **Motor** — Festo, Siemens, Mitsubishi
3. **Gearbox** — optional (direct drive or a compatible gearbox)
4. **Motor–axis mounting kit** — Festo, matched to the gearbox output when one is used

## Product data

The JSON files in `data/` are the source of truth and are edited by hand. The original Excel workbooks (Festo E-Drive selection Ver15.04, Motor Kit_Selection) and their export script are retired. Layout: one file per maker and product family, `data/<kind>/<maker>/<family>.json` with kind = `axes`, `motors`, `gearboxes` or `kits`. Each file is `{ "items": [...] }`. `src/data/index.ts` loads every file with `import.meta.glob`, so new files need no code change. **`data/README.md` lists every field with its unit.** Keep it in sync when adding fields.

Data gotchas:
- Units are mm, kg, N, Nm, kg·cm², m/s, rpm (per field in `data/README.md`).
- Motor `inertia` includes the brake for brake models; `inertiaWithoutBrake` excludes it.
- Gearbox `ratio` is i (5 = 5:1).
- Axis `speedLimitStroke`: for spindle axes, max speed is derated above this stroke.
- Mounting kits fit by **interface code**, not by part name. A kit matches when `axisCode` = the axis's `interfaceCode` and `motorCode` = the motor's `interfaceCode`, or the gearbox's (output side) when a gearbox sits in between. Part names often differ from the codes (`EAMM-A-T42-60P` is listed for `60PA`), and one kit has one item per code pair.
- `interfaceCode` is `null` for products whose code is unknown: about 290 motors (e.g. EMMS-AS, EMME, HK-*, HG-JR) and the Apex PA/AE gearboxes and AB/ABR sizes beyond the original Excel (AB142 and up, AB060A/AB090A, ABR). Fill it in from Festo's kit documentation; don't guess from similar products. Exception, confirmed by the user: HF-KP shares HG-KR's mounting dimensions and HF-SP shares HG-SR's, so HF-KP/HF-SP take the HG codes, and Apex `driveCode` comes from its `compatibleMotors` (all HF-KP/HF-SP).
- SA kits (`special: true`, custom-made in Korea) took their codes from the kit name, so they may not match standard motor codes. Three have axis codes that exist on no axis (`T46-60` ×2, `T42-80`).
- Kit inertia, torque, ratio, efficiency, max speed, mass and length are `null` (not filled in yet).

## Calculation reference (from the Excel)

The original E-Drive workbook (now retired) had four calc sheets — `BS_Horizontal`, `BS_Vertical`, `Belt_Horizontal`, `Belt_Vertical` — whose formulas the app's selection logic should reproduce. Wall mounting uses the "Horizontal [Sideways]" load case of the horizontal sheets. Key formulas (g = 9.81, η = drive efficiency — default 0.9 spindle / 0.8 belt, μ = friction — 0.05 spindle / 0.1 belt):

- **Travel per motor rev** dS: spindle `pitch / i`; belt `π · pulleyDiameter / i`.
- **Motion profile** (Excel is trapezoidal; jerk is a new input not in the Excel): `Tsa = v/a`, accel distance `v·Tsa/2`, constant-velocity distance `stroke − 2·accelDist`, cycle `tf = travel time + dwell`.
- **Inertia at motor** `JL = J_gear + J_brake + WL·(dS/(20π))² + (J_coupling + J_other + J_screw or z·J_pulley)/i²`, where WL = payload + slide mass; `J_screw = π·0.0078·(L/10)/32·(D/10)⁴` with L = stroke + 100.
- **Load torque** horizontal `TL = (Fc + μ(WL·g + FG))·dS / (2000π·η)`; vertical splits into unbalance `TU` and friction `TF` torques with separate up/down cases.
- **Accel/decel torque** `TMa = (JL/η + JM)·N0 / (9.55e4·Tsa) + TL`, `TMd = −(JL·η + JM)·N0 / (9.55e4·Tsa) + TL`; RMS torque over the cycle; check peak vs motor peak torque, RMS vs rated torque, `JL/JM` vs the motor's allowable inertia ratio, required speed vs rated speed.
- **Regeneration** `Pr = (ηm·Em − Ec)/tf` vs the motor's `regenPower`.
- **Festo criteria**: required force `Fc + FG + WL·a + μ·WL·g` (vertical: `+ WL·g`) ≤ `maxFeedForce`; required axis torque `F·dS/(2π·η·1000) + noLoadTorque` ≤ `maxDrivingTorque`; Festo inertia `J0 + JH·stroke/1000 + JL·payload + J_gear`.
- **Guide load**: forces/moments from payload COG offsets and inertial force `m·a`, combined `fv = Σ|F_i/F_max,i| < 1`; guide life `(1/fv)³ · 5000 km`.
- **Deflection**: simply supported beam with point load + self-weight using `Iy`/`Iz`, E = 70000 N/mm², vs `allowableDeflection`.
- **Ball screw life** (`Ball Screw 수명계산`): `L = (Ca / (fw·Fa))³ · 10⁶` rev, with load factor fw by speed (≤0.25 m/s: 1.2, ≤1: 1.5, ≤2: 2, >2: 3.5).

### Where the app deviates from the Excel (intentional)

- Load inertia uses Festo's catalog values `J0 + JH·stroke + JL·payload` instead of computing screw/pulley inertia from dimensions.
- Gearbox inertia and brake inertia are counted once on the motor side. The Excel adds them twice.
- Vertical guide moments use `m·(g + a)` once. The Excel's Mz counts gravity twice.
- Resistance is `Fc + μ·m·g + FG`. The Excel formula applies μ to FG as well.
- Jerk gives an S-curve profile. Torques, RMS and regeneration energy are integrated numerically over a full cycle: forward, dwell, back, dwell.

## Design

`PRODUCT.md` (users, purpose, principles) and `DESIGN.md` (route-sign design system: tokens, rules) are the design references; keep `DESIGN.md` in sync when changing `src/index.css`. Fonts are bundled from npm (`pretendard`, `@fontsource/barlow-semi-condensed`), imported in `main.tsx`.

## Commands

Node.js is installed at `C:\Program Files\nodejs`. In the Bash tool, run `export PATH="/c/Program Files/nodejs:$PATH"` first if `npm` is not found.

```
npm install
npm run dev            # dev server, http://localhost:5173
npm run build          # tsc -b + vite build
npm run lint           # oxlint
npm test               # vitest run
npx vitest run src/calc/motionProfile.test.ts   # single file
npx vitest run -t "guideLoads"                  # tests matching a name
```

## Architecture

- `src/data/` loads every JSON file with `import.meta.glob` (`index.ts`) and defines the types (`types.ts`). `gearboxesFor` matches Apex compatibility codes (e.g. `KP053`) against motor model names. Festo EMGA items list motor series (`EMMT-AS-60`, …) from the ordering table in Festo's documentation, so they match the same way.
- `src/calc/` contains the pure, unit-tested selection logic in SI units. Inputs use mm and kg·cm², converted at the boundaries.
  - `motionProfile.ts`: move profiles are lists of `Phase`s with linearly varying acceleration. `samplePhases` turns them into weighted samples (midpoint rule, plus zero-weight boundary points so peaks are exact).
  - `axisSelection.ts`: `evaluateAxis` builds the cycle and computes per-sample torque at the axis drive shaft (`AxisSample.torque`, efficiency not applied). It runs the motor-independent checks (stroke, speed, accel, Fx, drive torque, guide fv, deflection) and life info. `selectAxes` filters and sorts by status, then axis mass.
  - `motorSelection.ts`: `evaluateDrive` reuses the axis samples. It applies gearbox ratio and efficiency (÷η when motoring, ×η when regenerating), adds rotor/gearbox/coupling inertia, and checks peak/RMS torque, speed, inertia ratio and regeneration, plus gearbox max output torque and max input speed (`maxInputSpeed`, EMGA and Apex AB/ABR; others skip with a note). Apex `maxTorque` is T2B = 1.8 × T2N. `selectMotors` keeps one option per motor: direct drive, or the lowest passing gearbox ratio when direct drive fails. That gearbox is only a screening hint in the motor table; it is never applied automatically.
  - `kitSelection.ts`: `findKits` matches kits by interface code (gearbox output code when a gearbox is used). `kitTypeFor` gives the axis's default kit type (parallel only for `_parallel kit` axes); `kitsOf` filters by type and 일반/견시창. SA kits are returned separately as reference.
  - `types.ts`: `Requirements`, `Settings` with Excel-derived defaults, and the `Check`/`Status` model. A hard limit fails as `fail`. Deflection, rated-speed, regeneration and constant-velocity torque above the rated torque (`등속 구간 토크`; catches a long overloaded constant segment that a long dwell hides in the RMS) only `warn`; `Settings.conservative` (상세 설정 보수적 판정) makes the constant-velocity torque check `fail`. A missing data limit gives `ok` with a note.
- `src/ui/` contains the React components. `App.tsx` holds the state and auto-selects the first passing axis. `InputPanel.tsx` is two boxes: 사용 조건 (acceleration entered as 가속도 or as 가속 시간 to reach the velocity; time mode converts with `accelerationForTime`, jerk included, so `Requirements.acceleration` stays the only calc input) + 소재 무게 중심 (with the 무게 중심 입력 가이드 image), and a separate collapsible 상세 설정 box. Axis/motor filters (`Settings.families`, `makers`, …) are toggle buttons in each step's header. `RouteRail.tsx` is the sticky top rail: four route signs (selected part number, verdict, tightest check) that scroll to their step and highlight the step in view, plus BOM 복사 (tab-separated, clipboard) and PDF로 내보내기 (blocked with a notice until axis, motor and kit are selected; `App.tsx` mounts `Report.tsx` off screen in `.report-stage`, `pdfExport.ts` renders each chapter to an image with `modern-screenshot` and lays them on A4 pages with `jspdf`, both lazy-loaded, then opens the PDF in a new tab. The calculation report: 1 입력 데이터·선정 모델, 2 모션 프로파일, 3 축, 4 모터, 5 감속기, 6 연결키트, each chapter starts a new page). `MotionProfile` (chart + profile numbers; collapsing hides only the chart) sits above the steps, which render in order 축 → 모터 → 감속기 → 연결키트; step sections carry ids `step-axis`, `step-motor`, `step-gearbox`, `step-kit`. For the selected motor, `App.tsx` evaluates direct drive plus every compatible gearbox; `GearboxStep.tsx` (step 3) lists them. A gearbox is used only when the user picks one there (clicking it again drops it); otherwise the drive is direct (axis-kit-motor), and the kit is matched to the motor. Changing the axis or motor resets it to direct drive. `KitStep.tsx` (step 4) lists kits for the selected axis and drive with 직렬/병렬 and 일반/견시창 toggles; App keeps the selection and falls back to the first listed kit. `ProfileChart.tsx` (`ProfilePlot` is the bare chart, reused by the report) plots the full cycle (왕복, default) or one move (forward or return), each move followed by its dwell (shaded `.chart-dwell`) — position, velocity, acceleration, jerk and torque — from `tracePhases`, using `AxisEvaluation.driveAt` and `motorTorqueFn` for the torque (motor shaft when a motor is selected, else axis drive shaft).
