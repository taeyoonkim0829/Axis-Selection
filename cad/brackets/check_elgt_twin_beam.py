"""Interference check of the ELGT twin-X Z beams (BR-ELGT-BS-<S>-ELGT-BS-<Z>-1) with the Festo STEP models.

Assembles, in beam coordinates, the beam at its reference length with: the two EHAM-AK-L9 angle kits (-ML at end A,
-MR at end B, both with their pins and screws), the two X axes ELGT-BS-<S>-500 under them (slides at the kit's
base frame), the EHAM-MA-L9 plate on the Z pad and the Z axis ELGT-BS-<Z> pinned on it (drive end up). Reports
every overlapping solid pair (mm³); kit hardware entering the beam's bores is expected (screws are modelled at
their major diameter in the tap-drill bores). Optionally writes the assembly STEP for review.

    python check_elgt_twin_beam.py [out_dir]
"""

from __future__ import annotations

import json
import sys
from itertools import product
from pathlib import Path

from cadgen import build123d as bd
from cadgen import read_step
from cadgen.geometry import overlap_volume

ROOT = Path(__file__).resolve().parents[2]
ADP = ROOT / "data/adapters/Festo/Drawings"
AX = ROOT / "data/axes/Festo/Drawings/ELGT"
CUS = ROOT / "data/adapters/Custom/Drawings"

sys.path.insert(0, str(Path(__file__).parent))
from elgt_twin_beam import SIZES  # noqa: E402

# per X size: beam id, kits (ML, MR), X axis, plate, Z axis; kit frame values from the kit JSONs
CASES = {
    90: ("BR-ELGT-BS-90-ELGT-BS-90-1", "8128210_EHAM-AK-L9-90-L9-90-ML", "8128215_EHAM-AK-L9-90-L9-90-MR",
         "8124409_ELGT-BS-90-500-10P", "8128227_EHAM-MA-L9-120-L9-90", "8124405_ELGT-BS-90-300-10P"),
    120: ("BR-ELGT-BS-120-ELGT-BS-90-1", "8128208_EHAM-AK-L9-120-L9-120-ML", "8128213_EHAM-AK-L9-120-L9-120-MR",
          "8124455_ELGT-BS-120-500-10P", "8128227_EHAM-MA-L9-120-L9-90", "8124405_ELGT-BS-90-300-10P"),
    160: ("BR-ELGT-BS-160-ELGT-BS-120-1", "8128206_EHAM-AK-L9-160-L9-160-ML", "8128211_EHAM-AK-L9-160-L9-160-MR",
          "8124517_ELGT-BS-160-500-10P", "8128226_EHAM-MA-L9-160-L9-120", "8124455_ELGT-BS-120-500-10P"),
}
END = {90: 10.5, 120: 44.5, 160: 63.5}  # data/adapters/Festo/EHAM.json carried end
MA_END = {90: -181.5, 120: -181.5, 160: -231.5}  # EHAM-MA carried end (Z drive origin from the plate base origin)
L = 1000.0


def frame(origin, x_dir, z_dir) -> bd.Location:
    return bd.Location(bd.Plane(origin=origin, x_dir=x_dir, z_dir=z_dir))


def load(path: Path) -> list[tuple[str, bd.Solid]]:
    shape = read_step(path)
    out = []
    for child in getattr(shape, "children", []) or [shape]:
        for s in child.solids():
            out.append((child.label or path.stem, s))
    if not out:
        out = [(path.stem, s) for s in shape.solids()]
    return out


def place(parts, loc: bd.Location, tag: str):
    return [(f"{tag}:{name}", loc * s) for name, s in parts]


def run(size: int, out_dir: Path | None) -> list:
    beam_id, ml, mr, xaxis, plate, zaxis = CASES[size]
    s = SIZES[size]
    kitj = json.loads((ADP / f"{ml}.json").read_text())
    base = kitj["base"]["origin"]
    xf = kitj["carried"]["origin"][0]
    z0 = base[2] - END[size]
    # kit -> beam: kit x -> -y, kit y -> +z, kit z -> -x
    loc_ml = frame((z0, xf, -s.bottom), (0, -1, 0), (-1, 0, 0))
    loc_mr = frame((L - z0, xf, -s.bottom), (0, -1, 0), (-1, 0, 0))
    # X axis -> kit: slide origin on the kit base origin, X travel along kit x, slide normal +y
    xj = json.loads((AX / f"{xaxis}.json").read_text())
    so = xj["slide"]["origin"]
    loc_x_a = frame((base[0] + so[2], -so[1], base[2] - so[0]), (0, 0, 1), (-1, 0, 0))
    mrj = json.loads((ADP / f"{mr}.json").read_text())
    bm = mrj["base"]["origin"]
    loc_x_b = frame((bm[0] + so[2], -so[1], bm[2] - so[0]), (0, 0, 1), (-1, 0, 0))
    # plate -> beam: base origin on the pad centre, plate y out of the pad (-y), plate z down
    pj = json.loads((ADP / f"{plate}.json").read_text())
    oz = pj["base"]["origin"][2]
    top = pj["carried"]["origin"][1]
    loc_p = frame((L / 2, -s.B, s.H / 2 + oz), (1, 0, 0), (0, 0, -1))
    # Z axis -> plate: profile underside on the plate top, drive end at base + MA_END, body along plate +z
    zj = json.loads((AX / f"{zaxis}.json").read_text())
    dz = zj["drive"]["origin"][2]
    loc_z = frame((0, top, oz + MA_END[size] + dz), (-1, 0, 0), (0, 0, -1))

    beam = [("beam", s_) for s_ in read_step(CUS / f"{beam_id}_{beam_id}.stp").solids()]
    groups = {
        "beam": beam,
        "kitA": place(load(ADP / f"{ml}.stp"), loc_ml, "kitA"),
        "kitB": place(load(ADP / f"{mr}.stp"), loc_mr, "kitB"),
        "xA": place(load(AX / f"{xaxis}.stp"), loc_ml * loc_x_a, "xA"),
        "xB": place(load(AX / f"{xaxis}.stp"), loc_mr * loc_x_b, "xB"),
        "plate": place(load(ADP / f"{plate}.stp"), loc_p, "plate"),
        "z": place(load(AX / f"{zaxis}.stp"), loc_p * loc_z, "z"),
    }
    pairs = [("beam", g) for g in ("kitA", "kitB", "xA", "xB", "plate", "z")] + [
        ("plate", g) for g in ("kitA", "kitB", "xA", "xB")
    ] + [("z", g) for g in ("kitA", "kitB", "xA", "xB")] + [("kitA", "kitB")]
    hits = []
    for ga, gb in pairs:
        for (na, a), (nb, b) in product(groups[ga], groups[gb]):
            ba, bb = a.bounding_box(), b.bounding_box()
            if (ba.max.X < bb.min.X or bb.max.X < ba.min.X or ba.max.Y < bb.min.Y or bb.max.Y < ba.min.Y
                    or ba.max.Z < bb.min.Z or bb.max.Z < ba.min.Z):
                continue
            v = overlap_volume(a, b)
            if v > 0.01:
                hits.append((na, nb, round(v, 2)))
    print(f"X{size}: {beam_id}")
    for h in hits:
        print("   overlap", h)
    if not hits:
        print("   no overlaps")
    if out_dir:
        solids = [sh for g in groups.values() for _, sh in g]
        bd.export_step(bd.Compound(children=solids), str(out_dir / f"assy_X{size}.step"))
    return hits


if __name__ == "__main__":
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    for size in (90, 120, 160):
        run(size, out)
