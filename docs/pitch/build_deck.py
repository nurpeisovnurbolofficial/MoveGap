"""Build the screenshot-free Business Cup pitch as an eight-page PDF."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.pdfbase.pdfmetrics import stringWidth

OUT = Path(__file__).with_name("MoveGap_pitch.pdf")
W, H = 960, 540
NAVY = HexColor("#101127")
PURPLE = HexColor("#6F5CFF")
WHITE = HexColor("#FFFFFF")
PALE = HexColor("#E9E7FF")
GRAY = HexColor("#B8B7CB")
GREEN = HexColor("#66DDB2")

c = canvas.Canvas(str(OUT), pagesize=(W, H))
c.setTitle("MoveGap | Business Cup 2.0")

def txt(x, y, value, size=20, color=WHITE, font="Helvetica"):
    c.setFillColor(color)
    c.setFont(font, size)
    c.drawString(x, y, value)

def wrap(value, max_width, size=18, font="Helvetica"):
    words = value.split()
    lines, line = [], ""
    for word in words:
        attempt = (line + " " + word).strip()
        if stringWidth(attempt, font, size) > max_width and line:
            lines.append(line)
            line = word
        else:
            line = attempt
    if line:
        lines.append(line)
    return lines

def paragraph(x, y, value, width=820, size=19, leading=29, color=PALE):
    for line in wrap(value, width, size):
        txt(x, y, line, size, color)
        y -= leading
    return y

def slide(number, kicker, title):
    c.setFillColor(NAVY)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(PURPLE)
    c.rect(0, H-8, W, 8, fill=1, stroke=0)
    txt(54, 487, kicker.upper(), 12, PURPLE, "Helvetica-Bold")
    txt(54, 421, title, 40, WHITE, "Helvetica-Bold")
    txt(54, 28, "MOVEGAP  /  BUSINESS CUP 2.0", 10, GRAY, "Helvetica-Bold")
    txt(876, 28, f"{number:02d} / 08", 10, GRAY, "Helvetica-Bold")

def card(x, y, width, height, heading, lines, accent=PURPLE):
    c.setFillColor(HexColor("#1C1B3E"))
    c.roundRect(x, y, width, height, 10, fill=1, stroke=0)
    c.setFillColor(accent)
    c.rect(x, y+height-5, width, 5, fill=1, stroke=0)
    txt(x+19, y+height-39, heading, 19, WHITE, "Helvetica-Bold")
    cursor = y+height-73
    for line in lines:
        cursor = paragraph(x+19, cursor, line, width-38, 15, 21, PALE)-9

slide(1, "A renter's decision", "Can I afford the move?")
txt(54, 345, "On the days I must pay.", 34, PURPLE, "Helvetica-Bold")
paragraph(54, 265, "MoveGap compares real housing and moving offers against a 60-day cash timeline.", 800, 25, 36)
txt(54, 109, "Browser based. No account required for the demo.", 17, GRAY)
c.showPage()

slide(2, "The problem", "The total can look affordable")
paragraph(54, 340, "A working renter may have enough income for the month and still run short before the next paycheck.", 820, 23, 33)
card(54, 93, 255, 140, "OLD HOME", ["Rent and regular bills continue."])
card(327, 93, 255, 140, "NEW HOME", ["Deposit and first rent come due."])
card(600, 93, 306, 140, "THE MOVE", ["Transport costs arrive before an old deposit returns."])
c.showPage()

slide(3, "Fictional example", "The dates change the result")
txt(54, 349, "$4,500 opening cash", 24, WHITE, "Helvetica-Bold")
txt(54, 315, "$500 desired reserve", 18, GRAY)
card(54, 115, 410, 160, "ORIGINAL SCHEDULE", ["Lowest balance: -$1,150", "Gap to reserve: $1,650"], accent=HexColor("#ED7676"))
card(486, 115, 420, 160, "AGREED DEC 4 SCHEDULE", ["Lowest balance: $1,100", "Total expenses are unchanged."], accent=GREEN)
txt(54, 73, "Only agreed payment dates belong in the comparison.", 16, PALE)
c.showPage()

slide(4, "The product", "One focused workflow")
card(54, 139, 265, 198, "1  ENTER", ["Cash, paydays, bills, and actual offers for housing and moving."])
card(340, 139, 265, 198, "2  COMPARE", ["Compatible plans, lowest balance, first problem date, and cash gap."])
card(626, 139, 280, 198, "3  TRACK", ["Choose a plan. Record actual payments and old deposit returns."])
txt(54, 87, "All combinations use the same 60-day calculation window.", 16, PALE)
c.showPage()

slide(5, "Live demonstration", "The plan updates with facts")
steps = [
    "Change opening cash or one payment date.",
    "Compare the recalculated alternatives.",
    "Select a plan and record one actual payment.",
    "Save, reload, and check the updated minimum.",
]
for index, step in enumerate(steps):
    y = 340-index*63
    txt(56, y, f"{index+1:02d}", 24, PURPLE, "Helvetica-Bold")
    txt(112, y+2, step, 20, WHITE)
txt(54, 62, "Final product screenshots will be added after the interface is complete.", 13, GRAY)
c.showPage()

slide(6, "Positioning", "Built for this one decision")
card(54, 135, 410, 202, "EXISTING TOOLS", ["Moving calculators estimate a total.", "Budget tools track scheduled bills."])
card(486, 135, 420, 202, "MOVEGAP HYPOTHESIS", ["Compare entered offers by date.", "Explain the cash gap, then track the chosen move."], accent=GREEN)
txt(54, 87, "The focused workflow is a hypothesis to test with renters.", 16, PALE)
c.showPage()

slide(7, "Business model", "A one-time Move Pass")
txt(54, 312, "$9.99", 81, PURPLE, "Helvetica-Bold")
paragraph(366, 323, "Proposed price for extended comparison and an updateable move plan.", 510, 21, 30)
paragraph(54, 195, "People may return when a quote changes, a payment clears, or an old deposit arrives.", 820, 18, 27)
txt(54, 85, "No payment is collected in the hackathon demo. Willingness to pay is unvalidated.", 14, GRAY)
c.showPage()

slide(8, "Next step", "Real renter validation")
card(54, 132, 410, 210, "PRODUCT PROOF", ["Show a complete new-input flow.", "Save, reload, and replace a planned payment once."])
card(486, 132, 420, 210, "NEXT VALIDATION", ["Observe renters planning real moves.", "Measure completion, repeat use, and paid demand."], accent=GREEN)
txt(54, 75, "Nurbol: input + engine   Aruzhan: comparison   Sasha: plan + pitch", 15, PALE)
c.showPage()

c.save()
print(OUT)
