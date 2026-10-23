# Product data

The app reads every JSON file in this folder at build time, except discontinued families excluded in `src/data/index.ts` (Mitsubishi `HF-KP`/`HF-SP`, Apex `PA`); those files are kept for reference. These files are the source of truth: edit them directly.

```
data/<kind>/<maker>/<family>.json      kind = axes | motors | gearboxes | kits | drives | brakingResistors | cables | shafts | adapters
```

Each file is `{ "items": [ ... ] }`. A new file in the right folder is picked up automatically (restart `npm run dev`). Every item needs a unique `id`, and `family` should match its file name. Missing values are `null`. The TypeScript shapes are in `src/data/types.ts`, and `npm test` loads the real data.

## Axes (`axes/Festo/ELGT|ELGD|EGC|ESBF.json`)

| Field | Unit / meaning |
|---|---|
| `family`, `variant`, `size`, `drive`, `slide`, `longSlide` | from the model name. `variant` is `""`, `HD` or `WD`. `drive` is `belt` or `spindle`. |
| `maxStroke`, `speedLimitStroke` | mm. For spindles, max speed is derated above `speedLimitStroke` (Excel value; only used when `speedCurve` is missing) |
| `feedForceCurve` | ELGD-BS(-WD) only: `[working stroke mm, max. feed force N]` points for a force pushing the screw towards the motor (buckling), from "Max. feed force F as a function of the working stroke l" (ELGD-BS p.16: solid curve standard slide, dash-dot-dot long slide; ELGD-BS-WD p.13), read like `speedCurve` (flat part snapped to `maxFeedForce`). The check takes the smaller of this and `maxFeedForce` |
| `maxFeedForceParallel` | N, ELGD-BS(-WD) only: max. feed force with a parallel kit (data sheets p.6, "With parallel kit"): ELGD-80-10P 1771, -20P 873, ELGD-120 2520; the others equal `maxFeedForce`. Checked in the kit step when a parallel kit is selected. Replaces the Excel's `_parallel kit` axis entries (ELGD-WD-100 had 575 N there; the data sheet says 1100 N) |
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
| `baseLength` (at 0 stroke), `slideLength`, `allowableDeflection` | mm; ELGT-BS `baseLength` (drive flange to the far end) measured on the CAD models (ELGD's data sheet value matches its model the same way) |
| `screwDynamicLoadRating` | N |
| `typeCode` | order type code with … where the stroke goes, with the base options (no stroke reserve `0H`, ELGD-TB `PU2`, EGC-BS motor left `ML`), e.g. `ELGD-BS-KF-60-…-0H-5P`. Missing on ESBF (its `model` has the …). ELGT-TB: `ELGT-TB-120-…-CS` (customer solution, CS3186566A) |
| `strokePartNumbers` / `moduleNumber` | order number per standard stroke (mm as key) / module number for other strokes (modular product system). ESBF: documentation 203032 p.24–26. ELGT-BS, ELGD, EGC: the Festo data sheets (2026/09–10), ordering data and modular ordering tables. ELGT-TB: the CS catalogue (FEHA numbers for 50…1000 mm in 50 mm steps and 1100…2700 mm in 100 mm steps; the CP1 coated versions are left out), no module number. Long-slide ELGD (`-L`), EGC GV and EGC-HD have no standard strokes |
| `moduleStrokes` | mm, strokes the modular product system takes: `variable` [min, max] (any whole mm) and `fixed` extra strokes, from the ordering tables (EGC-BS/EGC-HD-BS: "Standard" and "Variable" rows; ELGT-BS: fixed strokes only). Missing on ESBF: any whole mm |
| `additionalSlide` | ELGD-TB(-WD) and EGC-TB-KF: the additional (passive, standard) slide of the modular product system. `left`/`right`: type codes (ELGD `ZL`/`ZR`, EGC `KL`/`KR`), `both`: both sides at once (EGC only), `length` and `gap` mm (slide length, distance to the main slide: the working stroke loses both per slide, so the ordered stroke is that much longer; EGC per its data sheet, ELGD the same, confirmed by the user), `mass` kg, `inertia` kg·cm² at the drive shaft per slide (EGC JW; null = `inertiaJLPerKg` × mass). From ELGD-TB 2025/03 (L2, L3 = 50; standard slide mass), ELGD-TB-WD 2025/09 (only the long slide: taken as the additional one), EGC-TB-KF 2025/06 (L17, mass, JW; L18 = 20 mm from the catalog example for every size, to be confirmed) |
| `beltMaterials` | toothed belt materials, the one in `typeCode` first: `code` (`PU2` coated PU, `PU1` uncoated FDA PU; null = EGC chloroprene rubber, no code) and `noLoadTorque` Nm (null = not in the data sheet, the axis value is used) |
| `maxSwitchingCycles` | ESBF only: the screw life also ends after this many switching cycles (round trips), 10 million for ESBF-BS (documentation p.16) |
| `pulleyDensity` | kg/cm³ |
| `standardStrokes` | mm |
| `interfaceCode` | mounting kit code, e.g. `T42-60` |
| `driveWidth` | mm, belt axes: distance between the drive cover faces at both shaft ends, from the CAD frame JSONs (twice the drive frame's offset from the profile centre). A connecting shaft's nominal length LN = axis spacing − `driveWidth` |
| `mountingPosition` | `horizontal` = released for horizontal mounting only (ELGT-TB catalogue, "Mounting position: Horizontal"); absent = any |

ESBF (`ESBF.json`, electric cylinder with piston rod and plain-bearing guide): ball screw versions ESBF-BS-32…100, first extracted from the ED_Data sheet of the E-Drive workbook Ver15.04, then checked against and corrected to the Festo documentation 203032 (2025/11, data sheet p.7–9): `slideMass` = moving mass mb0 (the Excel had the lead screw basic weight for sizes 32–50), `slideMassPer10mm` = mb10, `inertiaJ0` of ESBF-BS-100-…-40P = 6.710 (Excel 6.17), `baseMass` of ESBF-BS-40 = 1.237 (Excel 1237), `FxMax` = max. cylinder force. `interfaceCode` comes from the Motor Kit_Selection workbook (`D32`, `D40`, `D50`, `D60` for size 63, `D80`, `D100`). `speedLimitStroke` is the Excel value, a little below the knee of the documentation's speed curve (the speed falls with 1/stroke² above it). `pressureForceCurve` (p.12–13) and `rodLateralForceCurve` (p.11, piston rod, log-log) are read from the vector paths of the PDF curves, calibrated on the grid lines and thinned to points within 0.5 % (pressure) / 2 % (lateral) of the curve; the flat part is snapped to the max. cylinder force. `screwDynamicLoadRating` is an equivalent value fitted to the service life curves (p.16 for sizes 32/40, p.17 for 50…100, fB = 1): the curves follow L = (C/F)³ · pitch, and C comes out the same within 0.3 % along each curve (32/40 come out near round values: about 6500, 4400, 12000, 12000, 9000 N). Guide maxima and `Iy`/`Iz` are `null`, so the guide check has no limits and deflection is skipped; the payload needs an external guide. The lead screw versions ESBF-LS are left out: their efficiency is far below the 0.9 the app uses for spindles.

## Motors (`motors/<maker>/<family>.json`)

| Field | Unit / meaning |
|---|---|
| `family` | product family: Festo series (`EMMT-AS`, `EMMT-ST` …), Siemens `1FK2`, Mitsubishi `HK-KT` |
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
| `mass` | kg; so far Mitsubishi HK-* and Siemens 1FK2 (brake models: weight with brake). The gantry adds it to the load of the axis carrying the motor (an input value stands in when it is missing) |
| `allowableInertiaRatio` | load/rotor inertia ratio |
| `capacitorEnergy` / `regenPower` | J / W |
| `interfaceCode` | mounting kit code, e.g. `60PA`. Brake and non-brake models share it |
| `controller` | Festo: drive range the motor runs on, `CMMT-AS-3A` (1-phase 230 V: EMMT-AS LS, EMMB-AS), `CMMT-AS-11A` (3-phase 400 V: EMMT-AS HS/HV/HT, EMMH-AS) or `CMMT-ST` (48 V DC: EMMT-EC, steppers). `null`/absent for other makers |
| `preferredController` | EMMT-AS: Festo's preferred drive from "Servo motors EMMT-AS and motor controllers CMMT-AS" (2023/02); `null` where that table has no row |
| `winding` | Festo servo winding code (`LS`, `HS`, `HV`, `HT`, `ES`) |
| `stepper` / `openLoop` | stepper motor / open-loop stepper (EMMS-ST, no encoder: runs at nominal current) |
| `orderCode` / `partNumber` | Festo: order type and part number of the base configuration from the data sheets' ordering data: smooth shaft without shaft seal, single-turn encoder (EMMT-AS `-R…S`, EMMT-EC `-R1SC`, EMMB-AS `-S30S`, EMMT-ST `-RS`, EMMB-ST `-SS`), EMMH-AS without featherkey with its multi-turn encoder (`-<length>A-HS-S1M-T`), EMMS-ST without encoder (`-S`, `-G2` for 42/57/87); `B` for the brake. Other options (multi-turn, featherkey, safety encoder …) are ordered by their own code |
| `torqueCurve` | steppers: `[rpm, Nm]` max. torque at 48 V DC, read from the vector paths of the data sheet curves "Torque M as a function of rotational speed n" (EMMT-ST p.11–13: envelope of peak torque [2] and field-weakened peak torque [4]; EMMB-ST p.10–12, same curves; EMMS-ST p.7–8, log speed axis, 48 V curve), thinned to points within 0.4 % of the plateau |

Festo motors (`motors/Festo/`) come from the Festo data sheets in `Drive & Motor` (2025–2026), "General technical data" and brake tables, one item per size, length, winding and brake: EMMT-AS/EC (`EMMT.json`, rebuilt from the 2026/09 data sheet: EMMT-AS-80 inertia and the HS max. speeds were outdated), EMMB-AS, EMMH-AS (`<size>-<M|H>-HS`), EMMT-ST and EMMB-ST (closed loop: the encoder versions, which carry a nominal torque; inertia of the single-turn encoder version), EMMS-ST (open loop; `ratedTorque` = `peakTorque` = holding torque, `ratedSpeed` = max. speed, the curve limits the torque). `interfaceCode` comes from the EAMM-A interface overview (EMMH-AS `68C`…`138C`, EMMT-ST/EMMB-ST `42A`/`57A`/`87A`, EMMS-ST-28 `28A`; EMMS-ST-42/57/87 are not listed there, so `null`). `allowableInertiaRatio` 15 is the Excel value kept for EMMT and EMMB-AS; the new families leave it `null` (the setting's default applies). EMCA, EMME-AS and EMMS-AS were removed (no data sheet).

Siemens 1FK2 (`motors/Siemens/1FK2.json`) is checked against "SINAMICS S210 servo drive system with SIMOTICS S-1FK2 and S-1FT2", Operating Instructions, edition 03/2023, FW V6.1, A5E52380168B AA (folder `Drive & Motor/Siemens`): one item per model up to the brake digit (`…0` without, `…1` with brake). The rated values are those of the item's `series`: "단상 230V" items from section 12.2.15 (1 AC 230 V / 3 AC 240 V, p.405–434), "3상 400V" items from 12.2.16 (3 AC 400 V / 480 V, p.435–462); the same motor on the other supply has other rated/max. speeds and is not a separate item. From each model's table: `standstillTorque` = M0, `maxSpeed` = nmax, `peakTorque` / `peakCurrent` = Mmax / Imax, `nominalCurrent` = rated current Irated (not the stall current I0), `inertiaWithoutBrake` = Jmot, `inertia` = Jmot br for brake models, `brakeInertia` = Jmot br − Jmot, `mass` = mmot / mmot br. `brakeHoldingTorque` = M4 from "Holding brake data" (12.2.13, p.394–395), `shaftAxialLoad` = static axial force FA stat from 12.2.11 (p.387). `shaftRadialLoad` is the smallest value of the radial force diagrams (p.388–392, L10h = 25000 h; 1FK2x02/x03/x04/x06 share one, 2105 and 2205 have their own): the force at the end of the chart's x range (the shaft length) on its highest-speed curve (6000 rpm for frames 02–04, 4500 rpm above). The diagrams are bitmaps, so they were read from the pixels of the pages rendered at 300 dpi, calibrated on the grid lines (residual under 1 N). The manual gives no torque constant, winding resistance/inductance or permissible inertia ratio: `torqueConstant`, `windingResistance` and `windingInductance` stay `null`, `allowableInertiaRatio` stays the Excel value 15. `interfaceCode` comes from the retired Excel; 1FK2106, 1FK2205, 1FK2206, 1FK2208 and 1FK2210 have none (`null`) until Festo's kit documentation lists them.

## Drives (`drives/Festo/CMMT.json`)

Festo servo drives CMMT-AS (documentation 2026/04: electrical data p.6–7, ordering p.15, braking resistors p.17–18; standard safety `-S1`) and CMMT-ST (2026/02, p.6, 10–11).

| Field | Unit / meaning |
|---|---|
| `voltageClass` | `3A` (1-phase 230 V AC), `11A` (3-phase 400 V AC) or `ST` (24/48 V DC) |
| `nominalCurrent` / `peakCurrent` | A rms per phase |
| `peakDuration` | s, max. time at peak current (2 s CMMT-AS, 3 s CMMT-ST) |
| `nominalPower` / `peakPower` | W |
| `maxCableLength` | m, motor cable without external mains filter |
| `internalResistor` | integrated braking resistor: `resistance` Ω, `pulsePower` W, `pulseEnergy` Ws, `nominalPower` W; `null` for CMMT-ST |
| `externalResistance` / `externalMaxPower` | Ω [min, max] / W max. continuous power of an external resistor |
| `resistorVoltage` | V, intermediate circuit the CACR ratings are read at (380 for 230 V drives, 780 for 400 V, 48 for CMMT-ST) |
| `brakingResistors` | matching CACR models (CMMT-AS p.17–18; CMMT-ST p.11) |

## Braking resistors (`brakingResistors/Festo/CACR.json`)

CACR documentation 2023/10 (p.3, 8): `resistance` Ω, `power35` W at 35 % duty cycle, `ratedPower` W, `pulseEnergy380`/`nominalPower380` and `pulseEnergy780`/`nominalPower780` (Ws / W at 380 V and 780 V). CACR-KL2-21-W3600 (for C25-11A) comes from the CMMT-AS accessories table and has the 780 V values only.

## Cables (`cables/Festo/NEBM.json`)

One item per cable option: a `role` (`motor`, `encoder`, `adapter`, `brake`) for the motors matching `motors` (regular expression on the model) on a drive range (`controller`), for cable lengths in `range` (m, (min, max]). `code`/`crossSection` is the cross-section (Q7 = 0.75 mm² …), `type` has `{L}` for the length, `partNumbers` lists the standard lengths. `configurable` orders the other lengths (Connecting cable NEBM documentation 2026/05, p.29–33): `kind: variable` has a part number of its own for any length (M23/M40 per cross-section: Q7N 5251373, Q9N 5251380, Q10N 5251387, Q11N 5251394, Q12N 5251401, 0.5…100 m; Sub-D/M12 1…25 m), `kind: modular` is configured in the modular product system and ordered by the module number (`module` NEBM-LX/M17 8181663 for the M17/L5/L10 patterns, 0.5…20 m; NEBM-M23/40 8190874 for EMMH-AS, 0.5…29.9 m); `step` is the length increment the length is rounded up to, `min`/`max` the range, and `type` gets the length. Without `configurable` (EMMB-AS H6/H7/RE cables, adapter) the next standard length is ordered. `brakeOnly` items go only with brake motors; `fixedLength` marks a fixed-length part (EMMB-AS encoder adapter). Sources: the motor data sheets' accessories and "Recommended cable cross-section as a function of cable length" tables (EMMT-AS p.53–55, read up to 30 m: longer cables need technical clarification; EMMT-ST p.17–18; EMMB-ST p.15–16; EMMB-AS p.11–12; EMMH-AS p.19; EMMS-ST p.13–14, straight plug).

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

## Connecting shafts (`shafts/Festo/KSK.json`)

Festo KSK: two drive shafts, two couplings and a tube joining the drive shafts of two parallel toothed belt axes driven by one motor (2축 · 기구 동기). From the KSK operating instructions (8239742, 2025-12: rated torque, compatibility table, speed curves) and the data sheets 563710, 562520, 2261462, 562521, 562522, 562523 (2026/10: length range, inertia, weight).

| Field | Unit / meaning |
|---|---|
| `typeCode` / `partNumber` | order type with … for the nominal length LN in mm (`KSK-80-1000`) / the size's part number |
| `bore` | mm, coupling bore |
| `lengthRange` | mm, nominal length LN [min, max] (the gap between the drive covers) |
| `ratedTorque` | Nm (instructions, table after step 13) |
| `maxAxialOffset` | ±mm |
| `inertiaJ0` / `inertiaJLPerMeter` | kg·cm² at LN = 0 / per m of LN (kgmm² ÷ 100) |
| `baseMass` / `massPerMeter` | kg at LN = 0 / per m of LN |
| `axes` | the belt axes it fits (`family`, `variant`, `size`, from the tightening torque table: EGC-…-TB-KF 50/70/80/120/185 → KSK-50/-70/-80/-120/-185, ELGD-TB-KF 60/80 → KSK-80, 120 → KSK-120, ELGD-TB-KF-WD 100 → KSK-70, 120 → KSK-80), each with `speedCurve` `[LN mm, rpm]`: "max. permissible speed n as a function of LN" (figures 8 and 11), read from the PDF's vector paths on a 50 mm grid and thinned to points within 8 rpm. ELGD-80 and ELGD-WD-120 follow their own flat line, then the KSK-80 curve of ELGD-60. KSK-A-70 fits only ELGA (not in the app) |

The slide offset curves (figures 15–18) are not used. Drawings: `shafts/Festo/Drawings/<partNumber>_KSK-<size>-<LN>.stp`, exported from PARTdataManager at the default (shortest) nominal length, see "Drawings".

## Gantry kits (`adapters/Festo/EHAM.json`, `EAHF.json`)

Festo parts joining a carried axis's profile to the slide of the axis below it in a gantry (조합축), from the combination tables of the ELGT-BS catalog (2026/09, p. 28–43: EHAM-AK-L9 angle kits X–Y, EHAM-MA-L9 adapter plates Y–Z, types B/C; type D for ELGC/EGSC is left out) and the ELGD-BS / ELGD-TB catalogs (2026/09: EHAM-AK-E24 angle kits, EAHF-E24-60-P-D… profile mountings for ELGD on ELGD). The EGC catalogs list no axis/axis kit. One item per kit and fit (`EAHF-E24-60-P-D6` fits two pairs, so two items).

| Field | Meaning |
|---|---|
| `family` / `model` / `partNumber` | `EHAM-AK`, `EHAM-MA` or `EAHF` / order type / part number |
| `joint` | `angle`: the carried slide faces across the base slide's normal (X on the floor, Y on its side); `plate`: both slides face the same way (Y crossed on X, Z on a wall-mounted Y) |
| `base` / `carried` | the axes it fits: `family`, `variant` (`WD` or null), `size`, `drive` (`spindle`/`belt`; ELGT kits list ELGT-BS only), `longSlide: true` when the base axis needs the long slide (ELGD …-L). A `carried` entry also says where the kit holds that axis (assembly instructions, measured on the STEP models by `scripts/festo-cad/adapter-frames.mjs`): `end` (mm from the base slide centre along the carried body — angle kits: the wall's reach; plates: away from the drive end — to the axis's near end), `pinned: true` when the kit's pins and screws go into the profile's pin and threaded bores at its drive end (EHAM-AK-L9, EHAM-MA-L9 on ELGT: the near end is the drive flange, `baseLength` measured from it; `threads` = first threaded row from the flange and pitch, `screws` = the kit's screws into the profile, nearest and farthest from the base slide centre along the body), else the profile is clamped (EHAM-AK-E24 on ELGD: resting on the console's pin, its end at clearance A 77.5 mm from the console end) |
| `hand` | `left`/`right` for the mirror-image angle kits (…-ML / …-MR), else null. They differ in the side the wall reaches to from the foot on the base slide (assembly instructions EHAM-AK-L9 8140647, EHAM-AK-E24 8238670): seen facing the carried slide, ML to the right, MR to the left. The app takes the hand whose wall reaches towards the carried axis (two X axes: a mirrored pair, both inwards; carried axis centred on the slide: ML) |
| `layout` | ELGD angle kits: `cantilever` (…-L) or `gantry` (…-S, three-dimensional gantry), else null |
| `wall` | angle kits: mm the bracket wall spans along its reach from the base slide centre, `[behind, ahead]` (STEP models, `adapter-frames.mjs`); two mirrored kits under two X axes collide unless the X spacing is at least twice `ahead`, else null |
| `carriedStroke` | mm `[min, max]` of the carried axis's working stroke (ELGT: angle kits up to 600/700 mm Y; plates type C up to 100/200 mm Z, type B above it up to 500 mm), or null |
| `mass` | kg |
| `accessories` | parts ordered with it (`model`, `partNumber`, `quantity` per kit, `note`): EAHF-E24-60-P-B4 holding the ELGD axis on an EHAM-AK-E24, 4 on E24-80-E24-60 and 2 on E24-80-E24-80 (assembly instructions 8238670) |
| `dataSource` | catalog and pages |

Drawings: `adapters/Festo/Drawings/<partNumber>_<model>.stp` with frame JSONs (see "Drawings").

## Drawings (`<kind>/<maker>/Drawings/…/<partNumber>_<model>.stp`)

Manufacturer CAD models (STEP) for step 5 (조합 도면), next to the product data of their kind (`axes`, `motors`, `gearboxes`, `kits`, `shafts`, `adapters`); subfolders below `Drawings/` are free. The file name is `<partNumber>_<model>` as Festo's CAD download names it (`8124427_ELGT-BS-90-500-20P.stp`), or the maker's own name, read as the model up to the first `_` in upper case (Mitsubishi `hg-kr13b_.stp` = HG-KR13B, `hg-ak0136_b_.stp` = HG-AK0136, `hk-kt13wb_.stp` = HK-KT13WB, which matches the data's `HK-KT13WB (200V)`: a voltage class in brackets is left out when matching; `(4)` stands for both names, `hg-jr12k1(4)_.stp` = HG-JR12K1 and HG-JR12K14). Only STEP files are read; the DWG/DXF/IGES/ZIP downloads may sit next to them but are not committed (`.gitignore`). The files are copied unchanged into the assembly (the CADENAS files carry `License CC BY-ND 4.0`; the exported STEP repeats it in its header). Each STEP file has a JSON file of the same name with its mating frames, in the file's own coordinates (mm). A frame is `{ "origin": [x, y, z], "axis": [x, y, z], "up": [x, y, z] }`: `axis` points from the axis side towards the motor side, `up` is perpendicular to it and is turned onto the parent's `up` (motor connector, kit and axis "up" line up).

Matching: axes by `typeCode` (or `model`) with the stroke in place of `…`, the file with the stroke closest to the ordered one; kits by `product` or `partNumber`; gearboxes by `model` or `partNumber`; motors by `model`, `orderCode` or `partNumber`, else (Festo) another option variant of the same motor (`EMMT-AS-60-S-HS-RMY` for `EMMT-AS-60-S-HS`, a `B` in the options only for brake motors), or (Siemens, `siemensVariant`) the full order number: 1FK2 models stop at the brake digit (`1FK2102-1AG1` = with brake), so any file starting with the model fits (`1FK2102-1AG10-0MA0_3D_en.STP`; the first in file order), and a 1FL6 plain-shaft model (`…-1LG1`, `…-1LH1` with brake) takes the featherkey file of the same motor (`…-1LA1`, `…-1LB1`).

| Kind | JSON fields |
|---|---|
| axis | `stroke` (mm, of the model in the file); `drive` (frame on the drive shaft at the axis end face the kit sits on — not the shaft tip or the centering collar, which go into the kit — `axis` pointing out to the motor); `slide` (`origin` = centre of the slide mounting surface at the start position, `normal` = mounting surface normal, `travel` = direction away from the motor; belt axes with an off-centre slide (EGC-TB-KF) also `front` = the side across the profile the slide stands out to, which names the 우측 shaft end in the motor position choice); `profile` (`origin` = centre of the profile's mounting face, the underside, in the middle of its length; `normal` = out of that face; where a gantry kit holds the axis, its middle moving with half the length change; written by `frames.mjs --profile`); `stretch` (optional, for other strokes, in the file's coordinates like the frames: `part` = text in the PRODUCT name of the profile body, `also` = further parts stretched the same way (ESBF piston rod), `axis` = coordinate index 0/1/2 of the length direction, `dir` = ±1 the side that moves (the far end; ESBF: the motor end, so the rod end stays), `range` = [min, max] where the cut may go, between the end features, `move` = placement ids (second AXIS2_PLACEMENT_3D of the ITEM_DEFINED_TRANSFORMATION) of the parts at the moving end — end caps, fittings, the slide when it sits there — moved along; a `drive` or `slide` origin beyond the range moves too) |
| kit | `axisFace`, `motorFace`: frames of the axis-side and motor-side flange faces. Parallel kits (EAMM-U) have both faces on the same side of the belt housing: `axisFace.axis` points into the housing, `motorFace.axis` back along the axis into the motor; `axisFace.up` points away from the motor so the motor sits below the axis (opposite the slide), and `motorFace.up` points away from the axis so the motor connector does not run into the profile |
| gearbox | `output` (axis/kit side), `input` (motor side) flange frames |
| adapter | `base` (on the base axis's slide: `origin` = centre of the kit's pins into it, which go into the slide's pin bores at its centre (else of the fasteners), `axis` from the slide into the kit, `up` across the carried travel); `carried` (where the carried axis's profile underside sits, across its travel on the profile's centreline — pinned kits: where the pins put it; EHAM-AK-E24: the profile's lower edge on the console's pin: `axis` from the kit towards the carried axis's slide side, `up` along its travel). Written by `scripts/festo-cad/adapter-frames.mjs` |
| shaft | `length` (mm, nominal length LN of the model in the file); `end` (end face on the motor-side axis, at −LN/2, `axis` along the shaft towards the other end; it is placed on that axis's free drive shaft end, whose cover cap is taken off); `stretch` (the tube part `…_P` between the couplings, cut in the middle, the far drive shaft moved along; only lengthened, the file has the shortest LN) |
| motor | `flange` (flange face, `axis` pointing into the motor body). Optional: without a JSON the Festo convention is used (origin at the flange face, shaft along +z, `up` +y). Mitsubishi's flange motors (HG-KR/MR/SR/JR/RR/UR/AK and HK-KT/MT/RT/ST, all 237 files checked) use the same convention, connectors towards −y, so they need no JSON; their gear motors (`…G1_…`, `G5`, `G7`, `G1H`) do not, and match no motor in the data. Siemens 1FK2 / 1FL6 (CADClick downloads, `motors/Siemens/Drawings/<family>/<order number>/<order number>_3D_en.STP`) have the shaft along −y and the connector towards +z, the flange face at y = 0 (1FK2) or elsewhere (1FL6): each has a JSON written by `scripts/festo-cad/motor-frames.mjs` (shaft, flange face and connector side found in the geometry; `flange.up` = connector side) |

The length change (`src/cad/stretch.ts`) moves everything beyond a cut plane of the profile body; it places the cut where only edges along the length cross it. Shortening removes the features (holes, slots) that lie entirely in the cut-out window. A profile with mounting holes at a fixed pitch (ELGT: 100 mm, EGC-HD: 40/60 mm, found in the geometry: same-shaped features repeating three or more times) keeps the pattern: whole pitches go in or out at a cut inside it (lengthening copies the holes of the pitch before the cut into the gap; shortening only removes pattern, so a one-off feature such as the ELGT-160 centring slot near the moving end stays in place), and the rest of the change goes between the pattern and the moving end, so only that end distance differs from Festo's (which centres the pattern). Profiles without such a pattern (ELGD, EGC, ESBF) are cut once as before; lengthening leaves a plain gap. The Festo axis, kit and gearbox JSONs are generated from the geometry by `scripts/festo-cad/frames.mjs` (rules in its header). An angle gearbox (EMGA-…-A-) can point the motor shaft to the side chosen for the connector; the motor then keeps its turn.

