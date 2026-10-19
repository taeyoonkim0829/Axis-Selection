# Festo CAD models

Tools for filling `data/<kind>/Festo/Drawings/` with Festo STEP models (step 5, 조합 도면).

Source for now: the Festo PARTdataManager (CADENAS, `C:\Program Files\Festo\CAD\software`) with the `festo.cip`
catalog installed locally (`C:\ProgramData\Festo\CAD\data\23d-libs\festo`). Its scripting (cscripthost / VBS)
needs a licence the free Festo edition does not have ("VBS 라이센스 누락"), so `export-gui.ps1` drives the program's
window instead, like a user: search the part number, open the first result, export STEP (about 15 s per part).
An official CADENAS API (PARTcommunity / 3Dfindit) can replace that step later; `import.mjs` only needs the STEP
files in a folder.

```
node scripts/festo-cad/list.mjs missing.csv          # parts still without a drawing (--all: every part)
powershell -File scripts/festo-cad/export-gui.ps1 -List missing.csv -Priority 1   # export into Documents\FestoCAD
node scripts/festo-cad/import.mjs <folder> --dry-run # show where each exported file would go
node scripts/festo-cad/import.mjs <folder>           # copy them (--move to move)
```

- `export-gui.ps1`: needs PARTdataManager open and maximised, and STEP chosen once in 파일로 내보내기 ▸
  3D 시스템 중립 ▸ STEP so the toolbar button exports STEP directly. Screen positions are for a 3440×1440 screen at
  100 % scaling (`$pos` at the top; the export dialog is found by UI Automation). Files already in the output
  folder are skipped, so a stopped run resumes. `export-log.csv` records each part: `ok`, `other part` (the
  file's first PRODUCT is another part number, e.g. a module number that opened a default configuration) or
  `failed: …`. Options: `-Kind axes|motors|gearboxes|kits`, `-Max n`, `-OpenWait ms` (time to load a part).

- `list.mjs`: one row per wanted file, priority 1 first: every axis type (one stroke, the standard stroke with its
  own part number closest to 500 mm; the app stretches it to other strokes), every Festo motor (base order code;
  another option variant of the same motor fits as well), every EMGA gearbox, and the standard kits between a
  Festo axis and a Festo motor / EMGA with data sheet values and no inspection window. Priority 2: the other kits.
  SA kits (custom-made in Korea) are left out.
- `import.mjs`: reads each STEP file's first `PRODUCT` name (`<partNumber> <model>---(…)`, as CADENAS writes it),
  else its `FILE_NAME` or file name, matches it to a part in `data/` and saves it as `<partNumber>_<model>.stp`.
  A file already in `data/` keeps its place. It does not write the frame JSON: axes, kits and gearboxes need one
  before step 5 can place them (format in `data/README.md`); the report lists them, and `frames.mjs` writes them
  from the geometry for Festo axes, EAMM-A/-U kits and EMGA gearboxes. Motors work without one when
  the flange is at z = 0 with the shaft along +z (Festo convention).
- Module numbers (configurable products without a part number per stroke/option, e.g. EGC GV slides, ELGD -L)
  open in their default configuration. Configure them in the part view's 수직 (vertical) table — options are
  buttons there (GK/GV, 5P/10P, L, PU2), the stroke a number field — then export; the file is named after the
  configured type (`556809 EGC-120-500-BS-10P-KF-0H-ML-GV_(0)`), which `import.mjs` reads.
- ELGT-TB-…-CS (customer solution) is not in the catalog.
- Export as STEP AP214 or AP242 with the default (CADENAS) file name; only `.stp`/`.step` is read.
