# Festo CAD models

Tools for filling `data/<kind>/Festo/Drawings/` with Festo STEP models (step 5, 조합 도면).

Source for now: the Festo PARTdataManager (CADENAS, `C:\Program Files\Festo\CAD\software`) with the `festo.cip`
catalog installed locally (`C:\ProgramData\Festo\CAD\data\23d-libs\festo`). Its scripting (cscripthost / VBS)
needs a licence the free Festo edition does not have ("VBS 라이센스 누락"), so the STEP files are exported by hand
in the program. An official CADENAS API (PARTcommunity / 3Dfindit) can replace that step later; `import.mjs`
only needs the STEP files in a folder.

```
node scripts/festo-cad/list.mjs missing.csv          # parts still without a drawing (--all: every part)
node scripts/festo-cad/import.mjs <folder> --dry-run # show where each exported file would go
node scripts/festo-cad/import.mjs <folder>           # copy them (--move to move)
```

- `list.mjs`: one row per wanted file, priority 1 first: every axis type (one stroke, the standard stroke with its
  own part number closest to 500 mm; the app stretches it to other strokes), every Festo motor (base order code;
  another option variant of the same motor fits as well), every EMGA gearbox, and the standard kits between a
  Festo axis and a Festo motor / EMGA with data sheet values and no inspection window. Priority 2: the other kits.
  SA kits (custom-made in Korea) are left out.
- `import.mjs`: reads each STEP file's first `PRODUCT` name (`<partNumber> <model>---(…)`, as CADENAS writes it),
  else its `FILE_NAME` or file name, matches it to a part in `data/` and saves it as `<partNumber>_<model>.stp`.
  A file already in `data/` keeps its place. It does not write the frame JSON: axes, kits and gearboxes need one
  before step 5 can place them (format in `data/README.md`); the report lists them. Motors work without one when
  the flange is at z = 0 with the shaft along +z (Festo convention).
- Export as STEP AP214 or AP242 with the default (CADENAS) file name; only `.stp`/`.step` is read.
