"""Shop drawing (PDF) of BR-ELGT-BS-90-ELGT-BS-90-1; layout in elgt_twin_beam_sheet.py."""

from cadgen.eng_drawing import eng_drawing

from elgt_twin_beam_sheet import sheet_for


@eng_drawing(out="../../data/adapters/Custom/Drawings/BR-ELGT-BS-90-ELGT-BS-90-1_BR-ELGT-BS-90-ELGT-BS-90-1.pdf")
def drawing():
    return sheet_for(90, "BR-ELGT-BS-90-ELGT-BS-90-1")


if __name__ == "__main__":
    drawing()
