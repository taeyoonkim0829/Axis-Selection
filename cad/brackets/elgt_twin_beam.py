"""Cross beam for a Z axis carried across two ELGT-BS X axes (twin X, motor sync): XZ gantry.

Each X slide carries a standard Festo angle kit EHAM-AK-L9-<S>-L9-<S> (…-ML on the first X axis, …-MR on the
second, walls reaching inwards). The beam takes the place of the carried ELGT-BS-<S> profile on both kit walls: its
back face reproduces the profile underside's pin and threaded bores, measured from each beam end (the end = where
the ELGT profile's drive flange would sit, `end` in data/adapters/Festo/EHAM.json). Its front face carries a pad
with the hole pattern of an ELGT slide, so a standard EHAM-MA-L9 adapter plate bolts on and pins the Z axis.

Length L follows the X spacing D: L = D - 2 * end. Only the middle changes; the end patterns stay put relative to
their end, the Z pad sits at L/2 + Z_POS.

Beam coordinates (mm, right-handed): x along the beam from end A (first X axis, pinned) to end B (second X axis,
screws only); z up, bottom face at z = 0; back face (against the kit walls) at y = 0, front face at y = -B.

Interface dimensions (see reports/brackets/…-BR-ELGT-twin-X-Z.md, table "인터페이스"):
  [K] EHAM-AK-L9 kit wall fasteners into the carried profile, kit STEP data/adapters/Festo/Drawings/8128210/8/6_…:
      screws ISO 4762 (M6x12 / M6x12 / M8x16) in two rows, pins 5H7x10 / 6H7x14 / 8H7x14.
  [P] ELGT-BS profile underside bores, axis STEP data/axes/Festo/Drawings/ELGT/812440 9/55/517_…-500-10P.stp:
      threads at 81.5 (84.5) + k*100 from the drive origin, rows +-36 / +-50 / +-67; pin bore round at +50 from
      the first thread row, (120/160) second pin in a 2 mm slot 100 further.
  [S] ELGT slide top, same axis STEP: 120: pins D6 at (0, +-61), M6 at (+-30, +-55) x (+-61) (travel x across);
      160: pins D8 at (0, +-82), M8 at (+-35, +-70) x (+-82).
  [W] kit wall face (contact) heights y 20.5 … 137.2 / 167.2 / 207.2 above the X slide; kit foot top y = 20.
"""

from __future__ import annotations

from dataclasses import dataclass

from cadgen import build123d as bd


@dataclass(frozen=True)
class Size:
    """One X size. Kit-side values from [K]/[P]/[W], pad values from [S]."""

    name: str
    # tube section (finished): height, depth, wall
    H: float
    B: float
    t: float
    # beam bottom above the X slide surface (kit foot top at 20, 2 mm clear)
    bottom: float
    # profile centreline above the X slide surface (kit carried frame y) [K]
    centre: float
    # kit screw rows: +-row from the centreline; positions from the beam end [K][P]
    row: float
    screws_s: tuple[float, ...]
    thread: str
    tap_drill: float
    # end A locating pins: round bores at pin_round (both rows when pin_rows), slot 2 mm long at pin_slot [P]
    pin_d: float
    pin_round: float
    pin_slot: float | None
    pin_rows: bool
    # Z pad (ELGT slide pattern, u along the beam, v vertical) [S]
    pad_slide: str
    pad_pin_d: float
    pad_pin_v: float
    pad_thread: str
    pad_tap_drill: float
    pad_u: tuple[float, ...]
    pad_v: float
    # wall face end ahead of the beam end (kit wall reach - end) [W]
    wall_s: float


SIZES: dict[int, Size] = {
    90: Size(
        name="90", H=160, B=80, t=8, bottom=22, centre=79.5, row=36,
        screws_s=(81.5, 181.5, 281.5), thread="M6", tap_drill=5.0,
        pin_d=5, pin_round=131.5, pin_slot=None, pin_rows=True,
        pad_slide="ELGT-120", pad_pin_d=6, pad_pin_v=61, pad_thread="M6", pad_tap_drill=5.0,
        pad_u=(-55, -30, 30, 55), pad_v=61, wall_s=296.5,
    ),
    120: Size(
        name="120", H=160, B=80, t=8, bottom=22, centre=94.5, row=50,
        screws_s=(81.5, 181.5, 281.5), thread="M6", tap_drill=5.0,
        pin_d=6, pin_round=131.5, pin_slot=231.5, pin_rows=False,
        pad_slide="ELGT-120", pad_pin_d=6, pad_pin_v=61, pad_thread="M6", pad_tap_drill=5.0,
        pad_u=(-55, -30, 30, 55), pad_v=61, wall_s=296.5,
    ),
    160: Size(
        name="160", H=200, B=80, t=10, bottom=22, centre=114.5, row=67,
        screws_s=(84.5, 184.5, 284.5), thread="M8", tap_drill=6.8,
        pin_d=8, pin_round=134.5, pin_slot=234.5, pin_rows=False,
        pad_slide="ELGT-160", pad_pin_d=8, pad_pin_v=82, pad_thread="M8", pad_tap_drill=6.8,
        pad_u=(-70, -35, 35, 70), pad_v=82, wall_s=299.5,
    ),
}

# corner radii of the tube section (outer, inner)
R_OUT = 1.5
SLOT_LEN = 2.0  # end A second pin: slot length along the beam (as the ELGT profile's), width = pin D H7


def zc(s: Size) -> float:
    """Kit centreline height in beam z."""
    return s.centre - s.bottom


def holes(s: Size, length: float, z_pos: float = 0.0) -> dict[str, list[tuple[float, float]]]:
    """Hole centres: back face (x, z) and front pad (x, z), by kind."""
    c = zc(s)
    rows = (c - s.row, c + s.row)
    back_thread = [(x, z) for x0 in s.screws_s for x in (x0, length - x0) for z in rows]
    pin_z = rows if s.pin_rows else (c,)
    pins = [(s.pin_round, z) for z in pin_z]
    slots = [(s.pin_slot, z) for z in pin_z] if s.pin_slot else []
    xc = length / 2 + z_pos
    pad_thread = [(xc + u, s.H / 2 + v) for u in s.pad_u for v in (-s.pad_v, s.pad_v)]
    pad_pins = [(xc, s.H / 2 + v) for v in (-s.pad_pin_v, s.pad_pin_v)]
    return {"back_thread": back_thread, "pins": pins, "slots": slots, "pad_thread": pad_thread, "pad_pins": pad_pins}


def make_beam(s: Size, length: float, z_pos: float = 0.0) -> bd.Part:
    """The finished beam (machined from EN AW-6082-T6 rectangular tube)."""
    # section in the YZ plane (beam y in [-B, 0], z in [0, H]), extruded along +x
    plane = bd.Plane.YZ  # local x = global y, local y = global z, normal +x
    outer = bd.RectangleRounded(s.B, s.H, R_OUT)
    inner = bd.RectangleRounded(s.B - 2 * s.t, s.H - 2 * s.t, s.t / 2)
    section = plane * bd.Pos(-s.B / 2, s.H / 2) * (outer - inner)
    body = bd.extrude(section, amount=length)

    h = holes(s, length, z_pos)
    cutters = []

    def bore_y(x: float, z: float, d: float, y0: float, depth: float) -> bd.Part:
        # cylinder along y from y0 towards y0 - depth (into the beam from the back) or the reverse
        cyl = bd.Cylinder(d / 2, abs(depth), align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.MIN))
        cyl = cyl.rotate(bd.Axis.X, 90 if depth > 0 else -90)  # +z -> -y (depth > 0) or +y
        return bd.Pos(x, y0, z) * cyl

    # back wall: through the wall (tapped / reamed), 1 mm over
    for x, z in h["back_thread"]:
        cutters.append(bore_y(x, z, s.tap_drill, 1, s.t + 2))
    for x, z in h["pins"]:
        cutters.append(bore_y(x, z, s.pin_d, 1, s.t + 2))
    for x, z in h["slots"]:
        slot = bd.SlotOverall(SLOT_LEN + s.pin_d, s.pin_d)  # along local x
        slot3 = bd.extrude(bd.Plane.XZ * slot, amount=s.t + 2)  # Plane.XZ normal -y: extrude towards -y
        cutters.append(bd.Pos(x, 1, z) * slot3)
    # front wall pad: from y = -B into the beam (+y)
    for x, z in h["pad_thread"]:
        cutters.append(bore_y(x, z, s.pad_tap_drill, -s.B - 1, -(s.t + 2)))
    for x, z in h["pad_pins"]:
        cutters.append(bore_y(x, z, s.pad_pin_d, -s.B - 1, -(s.t + 2)))
    beam = body
    for c in cutters:
        beam = beam - c
    return beam
