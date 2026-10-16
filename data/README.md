# Product data

The app reads every JSON file in this folder at build time, except discontinued families excluded in `src/data/index.ts` (Mitsubishi `HF-KP`/`HF-SP`, Apex `PA`); those files are kept for reference. These files are the source of truth: edit them directly.

```
data/<kind>/<maker>/<family>.json      kind = axes | motors | gearboxes | kits
```

Each file is `{ "items": [ ... ] }`. A new file in the right folder is picked up automatically (restart `npm run dev`). Every item needs a unique `id`, and `family` should match its file name. Missing values are `null`. The TypeScript shapes are in `src/data/types.ts`, and `npm test` loads the real data.

## Axes (`axes/Festo/ELGT|ELGD|EGC|ESBF.json`)

| Field | Unit / meaning |
|---|---|
| `family`, `variant`, `size`, `drive`, `slide`, `longSlide`, `parallelKit` | from the model name. `variant` is `""`, `HD` or `WD`. `drive` is `belt` or `spindle`. `parallelKit: true` means the data includes a parallel kit |
| `maxStroke`, `speedLimitStroke` | mm. For spindles, max speed is derated above `speedLimitStroke` (Excel value; only used when `speedCurve` is missing) |
| `feedForceCurve` | ELGD-BS(-WD) only: `[working stroke mm, max. feed force N]` points for a force pushing the screw towards the motor (buckling), from "Max. feed force F as a function of the working stroke l" (ELGD-BS p.16: solid curve standard slide, dash-dot-dot long slide; ELGD-BS-WD p.13), read like `speedCurve` (flat part snapped to the non-parallel `maxFeedForce`). Absolute values: the check takes the smaller of this and the item's `maxFeedForce`, so parallel-kit items keep their lower maximum |
| `speedCurve` | ball screw axes: `[working stroke mm, max. speed m/s]` points, interpolated linearly at the built stroke. Read from the vector paths of the data sheet curves "Speed v as a function of working stroke l" (ELGT-BS p.11, ELGD-BS p.17, ELGD-BS-WD p.13, EGC-BS p.19, EGC-HD-BS p.17, ESBF 203032 p.14), calibrated on the tick labels or, where those are outlines, on the grid frame, and thinned to points within 0.4 % of the curve. The curve without ball screw support (`-SU`) is used, the ordered version. The flat part is scaled to `maxSpeed` (the curves are within 1.5 %, ESBF-BS-100-5P 4 %). Long slides shift the curve by the documented stroke reduction: ELGD-…-L 42/78/101 mm (sizes 60/80/120), EGC GV 100 mm; ELGD-WD comes with the long slide and its curve applies as drawn |
| `maxWorkingLoad` | kg |
| `maxFeedForce`, `maxShaftRadialForce`, `shaftRadialForce5000km`, `shaftRadialForce10000km` | N |
| `noLoadTorque`, `maxDrivingTorque` | Nm (`maxDrivingTorque` is empty for spindle axes) |
| `maxSpeed` / `maxAcceleration` | m/s / m/s² |
| `repeatability` | ±mm |
| `baseMass` / `massPer10mm` / `slideMass` | kg at 0 mm stroke / kg per 10 mm stroke / kg |
| `slideMassPer10mm` | kg per 10 mm stroke added to the moving mass (ESBF only: the piston rod grows with the stroke) |
| `pressureForceCurve` | ESBF only: `[rod length mm, max. pressure force N]` points (buckling), interpolated linearly at the stroke |
| `rodLateralForceCurve` | ESBF only: `[stroke mm, max. lateral force on the piston rod N]` points |
| `beltPitch`, `pulleyDiameter` (effective), `spindleDiameter`, `pulleyWidth` | mm |
| `beltTensileStress` | % |
| `feedConstant` (belt), `spindlePitch` | mm/rev |
| `inertiaJ0` / `inertiaJHPerMeter` / `inertiaJLPerKg` | kg·cm² / kg·cm² per m stroke / kg·cm² per kg payload |
| `FxMax`, `FyMax`, `FzMax` / `MxMax`, `MyMax`, `MzMax` | N / Nm |
| `Iy`, `Iz` | mm⁴ |
| `baseLength` (at 0 stroke), `slideLength`, `allowableDeflection` | mm |
| `screwDynamicLoadRating` | N |
| `typeCode` | order type code with … where the stroke goes, with the base options (no stroke reserve `0H`, ELGD-TB `PU2`, EGC-BS motor left `ML`), e.g. `ELGD-BS-KF-60-…-0H-5P`. Missing on ESBF (its `model` has the …) and ELGT-TB (no documentation yet) |
| `strokePartNumbers` / `moduleNumber` | order number per standard stroke (mm as key) / module number for other strokes (modular product system). ESBF: documentation 203032 p.24–26. ELGT-BS, ELGD, EGC: the Festo data sheets (2026/09–10), ordering data and modular ordering tables. Long-slide ELGD (`-L`), EGC GV and EGC-HD have no standard strokes |
| `moduleStrokes` | mm, strokes the modular product system takes: `variable` [min, max] (any whole mm) and `fixed` extra strokes, from the ordering tables (EGC-BS/EGC-HD-BS: "Standard" and "Variable" rows; ELGT-BS: fixed strokes only). Missing on ESBF: any whole mm |
| `maxSwitchingCycles` | ESBF only: the screw life also ends after this many switching cycles (round trips), 10 million for ESBF-BS (documentation p.16) |
| `pulleyDensity` | kg/cm³ |
| `standardStrokes` | mm |
| `interfaceCode` | mounting kit code, e.g. `T42-60` |

ESBF (`ESBF.json`, electric cylinder with piston rod and plain-bearing guide): ball screw versions ESBF-BS-32…100, first extracted from the ED_Data sheet of the E-Drive workbook Ver15.04, then checked against and corrected to the Festo documentation 203032 (2025/11, data sheet p.7–9): `slideMass` = moving mass mb0 (the Excel had the lead screw basic weight for sizes 32–50), `slideMassPer10mm` = mb10, `inertiaJ0` of ESBF-BS-100-…-40P = 6.710 (Excel 6.17), `baseMass` of ESBF-BS-40 = 1.237 (Excel 1237), `FxMax` = max. cylinder force. `interfaceCode` comes from the Motor Kit_Selection workbook (`D32`, `D40`, `D50`, `D60` for size 63, `D80`, `D100`). `speedLimitStroke` is the Excel value, a little below the knee of the documentation's speed curve (the speed falls with 1/stroke² above it). `pressureForceCurve` (p.12–13) and `rodLateralForceCurve` (p.11, piston rod, log-log) are read from the vector paths of the PDF curves, calibrated on the grid lines and thinned to points within 0.5 % (pressure) / 2 % (lateral) of the curve; the flat part is snapped to the max. cylinder force. `screwDynamicLoadRating` is an equivalent value fitted to the service life curves (p.16 for sizes 32/40, p.17 for 50…100, fB = 1): the curves follow L = (C/F)³ · pitch, and C comes out the same within 0.3 % along each curve (32/40 come out near round values: about 6500, 4400, 12000, 12000, 9000 N). Guide maxima and `Iy`/`Iz` are `null`, so the guide check has no limits and deflection is skipped; the payload needs an external guide. The lead screw versions ESBF-LS are left out: their efficiency is far below the 0.9 the app uses for spindles.

## Motors (`motors/<maker>/<family>.json`)

| Field | Unit / meaning |
|---|---|
| `family` | model prefix: `EMMT`, `1FK2`, `HK-KT` |
| `brake` | brake model |
| `nominalCurrent`, `peakCurrent` | A |
| `ratedPower` | W |
| `ratedTorque`, `peakTorque`, `standstillTorque`, `brakeHoldingTorque` | Nm |
| `ratedSpeed`, `maxSpeed` | rpm |
| `torqueConstant` | Nm/A |
| `windingResistance` / `windingInductance` | Ω / mH |
| `inertia` | kg·cm², **including the brake** for brake models |
| `inertiaWithoutBrake`, `brakeInertia` | kg·cm² |
| `shaftRadialLoad`, `shaftAxialLoad` | N |
| `mass` | kg |
| `allowableInertiaRatio` | load/rotor inertia ratio |
| `capacitorEnergy` / `regenPower` | J / W |
| `interfaceCode` | mounting kit code, e.g. `60PA`. Brake and non-brake models share it |

## Gearboxes (`gearboxes/<maker>/<family>.json`)

| Field | Unit / meaning |
|---|---|
| `ratio` | i (5 = 5:1) |
| `compatibleMotors` | motor model codes the gearbox fits (e.g. `KP053`, matched against motor model names). Without it, the gearbox is never offered |
| `continuousTorque`, `maxTorque` | Nm |
| `torsionalStiffness` | Nm/arcmin |
| `inertia` | kg·cm², at the input (motor) side |
| `efficiency` | % |
| `driveCode` | interface code at the input (motor) side; equals the motor's `interfaceCode`, e.g. `60P`. Apex: taken from `compatibleMotors` (HF-KP = HG-KR codes, HF-SP = HG-SR codes); `null` where `compatibleMotors` is `null` |

Apex `compatibleMotors` lists each HF-KP / HF-SP code together with the HG-KR / HG-SR code of the same size (`KP13` + `KR13`, `SP102` + `SR102`): HG-KR has HF-KP's mounting interface and HG-SR has HF-SP's (confirmed by the user), so both series get the same gearboxes.
| `interfaceCode` | mounting kit code at the output (axis) side, e.g. `60G0` |

Apex AB/ABR (`gearboxes/Apex/AB.json`, `ABR.json`) is built from the Apex Dynamics catalog in that folder (AB p.79, ABR p.82): one item per size and ratio, including AB060A/AB090A (larger input bore, 2-stage only). `continuousTorque` is the nominal output torque T2N and `maxTorque` the max. acceleration torque T2B = 60% of T2NOT = 1.8 × T2N. `compatibleMotors` and `interfaceCode` came from the retired Excel and exist only for the sizes listed there; the rest are `null` (not in the catalog). Extra fields: `stage`, `nominalInputSpeed` / `maxInputSpeed` (rpm), `emergencyStopTorque` (T2NOT, Nm), `backlashArcmin` (`P0`/`P1`/`P2`, arcmin; `null` = not made), `radialLoad` / `axialLoad` (N), `mass` (kg). `ABR120-14` is not in the catalog and is left as it was. PA and AE still have only ratio and inertia.

Festo EMGA (`gearboxes/Festo/EMGA.json`) is built from the Festo EMGA documentation (203012, 2026/07): one item per orderable product (`id` = order type, e.g. `EMGA-60-P-G5-EAS-60`), specs from the datasheet. Where the datasheet gives a range, torque takes the lower and inertia/mass the upper bound. The `…-SAS-140` items (140A drive) come from a Festo product comparison export (`Festo product compare_13_10_2026_10_07.csv`, part numbers in the order of the comparison URL); its max torque is the upper end of the datasheet range, and the EMGA-120 shaft loads (blank there) are from the datasheet. No motor in the data has the 140A interface yet, so their `compatibleMotors` is `null`. Extra fields:

| Field | Unit / meaning |
|---|---|
| `partNumber` | Festo order number |
| `gearType` | `planetary` (P) or `right-angle` (A) |
| `flangeSize` | gear unit size, mm |
| `compatibleMotors` | motor series from the ordering table, e.g. `EMMT-AS-60` |
| `maxInputSpeed` | rpm |
| `torsionalStiffness` | Nm/arcmin (none for right-angle units) |
| `backlash` | degrees |
| `radialLoad`, `axialLoad` | permissible shaft load, N |
| `mass` | kg |

## Mounting kits (`kits/Festo/axial|parallel.json`)

A kit fits when `axisCode` equals the axis's `interfaceCode` and `motorCode` equals the motor's `interfaceCode`, or the gearbox's when a gearbox is used. A kit that fits several code pairs has one item per pair. `id` is `product|axisCode|motorCode`.

| Field | Unit / meaning |
|---|---|
| `type` (= `family`) | `axial` (EAMM-A, coupling) or `parallel` (EAMM-U, belt) |
| `window` | `true` = inspection window type (견시창) |
| `coupling` (axial) / `pulley` (parallel) | coupling type / separately ordered pulley part number |
| `special`, `sa` | SA (custom-made) kit, with project number and target motor; reference only |
| `inertia` / `transmissibleTorque` / `ratio` / `maxSpeed` / `mass` | kg·cm² / Nm / i / rpm / kg, from the "General technical data" tables of the Festo data sheets EAMM-A (2026/07, p.75–84) and EAMM-U (2026/07, p.23–28, 49, 59–60): mass moment of inertia kgmm² ÷ 100, weight g ÷ 1000, `ratio` 1 (every EAMM-U is i = 1). Merged table cells hold for every row down to the next value. `(-S1)` rows cover both names; the misprint EAMM-A-87-T46-85AA-… in the parallel table is read as EAMM-U. `null` for kits not in the data sheets (BF…/EB…/GD… inspection-window kits, older K… kits) |
| `noLoadTorque` | Nm, parallel kits: no-load driving torque |
| `dataSource` | the data sheet row used when the kit's own name is not listed but its current generation is (`EAMM-A-L38-60G` → `EAMM-A-L38-60G-G2`, same interface codes); `null` otherwise |
| `efficiency` / `length` | not filled in |
