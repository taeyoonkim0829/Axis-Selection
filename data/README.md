# Product data

The app reads every JSON file in this folder at build time. These files are the source of truth: edit them directly.

```
data/<kind>/<maker>/<family>.json      kind = axes | motors | gearboxes | kits
```

Each file is `{ "items": [ ... ] }`. A new file in the right folder is picked up automatically (restart `npm run dev`). Every item needs a unique `id`, and `family` should match its file name. Missing values are `null`. The TypeScript shapes are in `src/data/types.ts`, and `npm test` loads the real data.

## Axes (`axes/Festo/ELGT|ELGD|EGC.json`)

| Field | Unit / meaning |
|---|---|
| `family`, `variant`, `size`, `drive`, `slide`, `longSlide`, `parallelKit` | from the model name. `variant` is `""`, `HD` or `WD`. `drive` is `belt` or `spindle`. `parallelKit: true` means the data includes a parallel kit |
| `maxStroke`, `speedLimitStroke` | mm. For spindles, max speed is derated above `speedLimitStroke` |
| `maxWorkingLoad` | kg |
| `maxFeedForce`, `maxShaftRadialForce`, `shaftRadialForce5000km`, `shaftRadialForce10000km` | N |
| `noLoadTorque`, `maxDrivingTorque` | Nm (`maxDrivingTorque` is empty for spindle axes) |
| `maxSpeed` / `maxAcceleration` | m/s / m/s² |
| `repeatability` | ±mm |
| `baseMass` / `massPer10mm` / `slideMass` | kg at 0 mm stroke / kg per 10 mm stroke / kg |
| `beltPitch`, `pulleyDiameter` (effective), `spindleDiameter`, `pulleyWidth` | mm |
| `beltTensileStress` | % |
| `feedConstant` (belt), `spindlePitch` | mm/rev |
| `inertiaJ0` / `inertiaJHPerMeter` / `inertiaJLPerKg` | kg·cm² / kg·cm² per m stroke / kg·cm² per kg payload |
| `FxMax`, `FyMax`, `FzMax` / `MxMax`, `MyMax`, `MzMax` | N / Nm |
| `Iy`, `Iz` | mm⁴ |
| `baseLength` (at 0 stroke), `slideLength`, `allowableDeflection` | mm |
| `screwDynamicLoadRating` | N |
| `pulleyDensity` | kg/cm³ |
| `standardStrokes` | mm |
| `interfaceCode` | mounting kit code, e.g. `T42-60` |

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
| `inertia` / `transmissibleTorque` / `ratio` / `efficiency` / `maxSpeed` / `mass` / `length` | kg·cm² / Nm / i / – / rpm / kg / mm. Not filled in yet |
