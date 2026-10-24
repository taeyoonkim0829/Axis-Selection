"""BR-ELGT-BS-90-ELGT-BS-90-1: cross beam carrying a Z axis ELGT-BS-90 across two ELGT-BS-90 X axes (twin X, motor sync) on a pair of
EHAM-AK-L9-90-L9-90-ML/-MR angle kits; Z on a standard EHAM-MA-L9 plate. Geometry and interface sources in
elgt_twin_beam.py. Reference length L_REF; for another X spacing D: L = D - 2 * end (see the drawing)."""

from cadgen import step

from elgt_twin_beam import SIZES, make_beam

SIZE = SIZES[90]
L_REF = 1000.0  # mm, reference length of the STEP / drawing
Z_POS = 0.0  # mm, Z pad centre from the beam centre (+ towards end B)


@step(out="../../data/adapters/Custom/Drawings/BR-ELGT-BS-90-ELGT-BS-90-1_BR-ELGT-BS-90-ELGT-BS-90-1.stp")
def beam():
    part = make_beam(SIZE, L_REF, Z_POS)
    part.label = "BR-ELGT-BS-90-ELGT-BS-90-1"
    return part


if __name__ == "__main__":
    beam()
