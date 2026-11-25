"""Build Catch's original demo attachments with ReportLab, Poppler and Pillow."""

from decimal import Decimal
from json import loads
from pathlib import Path
from subprocess import run
from tempfile import TemporaryDirectory

from PIL import Image
from reportlab.lib.colors import HexColor
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
CATALOG = loads((ROOT / "research/showcase-library.json").read_text(encoding="utf-8"))
OUTPUT = ROOT / "public/assets/showcase-v1"
OUTPUT.mkdir(parents=True, exist_ok=True)
INK, MUTE, PAPER = "#1c2424", "#465552", "#fcfbf6"
RULE, ACCENT = "#cdd3cf", "#ab4628"


def rect(page, x, y, w, h, color):
    page.setFillColor(HexColor(color))
    page.rect(x, y, w, h, stroke=0, fill=1)


def line(page, left, y, right, color=RULE):
    page.setStrokeColor(HexColor(color))
    page.setLineWidth(0.7)
    page.line(left, y, right, y)


def label(page, value, x, y, *, size=10, font="Helvetica", color=INK, right=False):
    page.setFont(font, size)
    page.setFillColor(HexColor(color))
    (page.drawRightString if right else page.drawString)(x, y, value)


def paragraph(page, value, x, y, width, *, size=11, leading=16, font="Helvetica", color=INK):
    words = value.split()
    while words:
        count = 1
        while count < len(words) and stringWidth(" ".join(words[: count + 1]), font, size) <= width:
            count += 1
        label(page, " ".join(words[:count]), x, y, size=size, font=font, color=color)
        words = words[count:]
        y -= leading
    return y


def document(path, entry, size):
    page = canvas.Canvas(str(path), pagesize=size, invariant=1, pageCompression=1)
    page.setTitle(entry["title"])
    page.setAuthor("Catch showcase")
    page.setSubject("Original demonstration material")
    return page


def study_page(page, title, subtitle, sections, number):
    rect(page, 0, 0, 550, 740, PAPER)
    rect(page, 46, 670, 33, 4, ACCENT)
    label(page, "CATCH SHOWCASE  /  STUDY GUIDE", 46, 688, size=9, font="Courier-Bold", color=ACCENT)
    y = paragraph(page, title, 46, 632, 452, size=31, leading=34, font="Helvetica-Bold")
    label(page, subtitle, 47, y - 1, size=11, color=MUTE)
    line(page, 46, y - 21, 504)
    y -= 54
    for index, (heading, copy) in enumerate(sections, 1):
        label(page, f"{index:02d}", 46, y, size=10, font="Courier-Bold", color=ACCENT)
        label(page, heading, 77, y, size=14, font="Helvetica-Bold")
        y = paragraph(page, copy, 77, y - 21, 424) - 20
    assert y > 49, title
    line(page, 46, 51, 504)
    label(page, "Original learning material. Worked examples are synthetic.", 46, 32, size=8, color=MUTE)
    label(page, f"PAGE {number:02d}", 504, 32, size=8, font="Courier-Bold", color=MUTE, right=True)
    page.showPage()


def study(path, entry):
    page = document(path, entry, (550, 740))
    study_page(page, entry["title"], entry["subtitle"], entry["sections"], 1)
    if "appendix" in entry:
        study_page(page, "Worked examples", entry["title"], entry["appendix"], 2)
    page.save()


def money(value, currency):
    western = f"{value:,.2f}"
    if currency != "INR" or value < 100000:
        return western
    whole, cents = f"{value:.2f}".split(".")
    left, tail = whole[:-3], whole[-3:]
    groups = [left[max(0, end - 2):end] for end in range(len(left), 0, -2)]
    return ",".join([*reversed(groups), tail]) + "." + cents


def record_frame(page, kind, issuer, reference, date):
    rect(page, 0, 0, 550, 492, PAPER)
    rect(page, 0, 453, 550, 39, "#22302d")
    label(page, kind, 42, 468, size=10, font="Courier-Bold", color="#fffdf7")
    label(page, "FICTIONAL DEMO", 508, 468, size=9, font="Courier-Bold", color="#fffdf7", right=True)
    label(page, issuer, 42, 400, size=24, font="Helvetica-Bold")
    label(page, "Reference: " + reference, 43, 370, size=11, font="Courier-Bold")
    label(page, "Date " + date, 508, 370, size=11, color=MUTE, right=True)
    line(page, 42, 349, 508)


def receipt(path, entry):
    page = document(path, entry, (550, 492))
    record_frame(page, "PURCHASE RECEIPT", entry["issuer"], entry["reference"], entry["date"])
    label(page, "DESCRIPTION", 43, 320, size=9, font="Courier-Bold", color=MUTE)
    label(page, "QTY", 369, 320, size=9, font="Courier-Bold", color=MUTE, right=True)
    label(page, "AMOUNT", 505, 320, size=9, font="Courier-Bold", color=MUTE, right=True)
    currency, total = entry["currency"], Decimal("0")
    for i, (item, quantity, unit) in enumerate(entry["items"]):
        y = 283 - i * 38
        amount = Decimal(unit) * quantity
        total += amount
        label(page, item, 43, y, size=13)
        label(page, str(quantity), 369, y, size=11, font="Courier", right=True)
        label(page, money(amount, currency), 505, y, size=12, font="Courier", right=True)
        line(page, 42, y - 15, 508)
    rect(page, 42, 106, 466, 54, "#edf1e9")
    label(page, "TOTAL", 54, 126, size=11, font="Courier-Bold")
    label(page, currency + " " + money(total, currency), 495, 125, size=21, font="Helvetica-Bold", right=True)
    paragraph(page, entry["footnote"], 43, 60, 455, size=10, color=MUTE)
    page.save()


def trip(path, entry):
    page = document(path, entry, (550, 492))
    record_frame(page, "TRAVEL CONFIRMATION", entry["issuer"], entry["reference"], entry["date"])
    for x, role, place, time in ((43, "FROM / ARRIVAL", entry["from"], entry["depart"]),
                                 (300, "TO / DEPARTURE", entry["to"], entry["arrive"])):
        if entry["from"] != "Check-in":
            role = "DEPARTURE" if x == 43 else "ARRIVAL"
        else:
            role = "STAY START" if x == 43 else "STAY END"
        label(page, role, x, 317, size=9, color=ACCENT, font="Courier-Bold")
        label(page, place, x, 283, size=21, font="Helvetica-Bold")
        label(page, time, x, 255, size=16, color=MUTE)
    line(page, 42, 232, 508)
    for i, (name, value) in enumerate(entry["details"]):
        y = 204 - 34 * i
        label(page, name, 43, y, size=11, font="Helvetica-Bold")
        label(page, value, 224, y, size=12)
    rect(page, 42, 43, 466, 39, "#edf1e9")
    paragraph(page, entry["footnote"], 52, 57, 445, size=10, color=MUTE)
    page.save()


def screen(path, entry):
    page = document(path, entry, (720, 411))
    dark = entry["style"] == "terminal"
    bg, chrome, fg = ("#1d2523", "#293531", "#f0f3ec") if dark else ("#f6f6ef", "#e3e9e2", INK)
    muted, rule = ("#b8cbbd", "#405650") if dark else (MUTE, RULE)
    rect(page, 0, 0, 720, 411, bg)
    rect(page, 0, 372, 720, 39, chrome)
    for x, color in ((23, "#b36348"), (39, "#ae9665"), (55, "#749283")):
        page.setFillColor(HexColor(color))
        page.circle(x, 391, 4, fill=1, stroke=0)
    label(page, entry["app"], 75, 387, size=13, font="Helvetica-Bold", color=fg)
    label(page, "DEMO SCREEN", 692, 386, size=11, font="Courier-Bold", color=muted, right=True)
    label(page, entry["subtitle"], 42, 326, size=20, font="Helvetica-Bold", color=fg)
    line(page, 42, 301, 678, rule)
    for index, (key, value) in enumerate(entry["rows"]):
        y = 266 - 48 * index
        label(page, key, 44, y, size=15, color=muted)
        label(page, value, 310, y, size=16, font="Courier-Bold" if dark else "Helvetica-Bold", color=fg)
        line(page, 42, y - 15, 678, rule)
    label(page, entry["footnote"], 43, 39, size=11, color=muted)
    page.save()


def raster(source, destination, *, density=126, webp=False):
    with TemporaryDirectory() as temp:
        prefix = Path(temp) / "page"
        run(["pdftoppm", "-f", "1", "-l", "1", "-r", str(density), "-singlefile", "-png",
             str(source), str(prefix)], check=True)
        with Image.open(prefix.with_suffix(".png")) as image:
            if webp:
                image.save(destination, format="WEBP", quality=87, method=6)
            else:
                image.save(destination, format="PNG", optimize=True)


for group, draw in (("documents", study), ("receipts", receipt), ("travel", trip)):
    for row in CATALOG[group]:
        file = OUTPUT / (row["id"] + ".pdf")
        draw(file, row)
        raster(file, OUTPUT / (row["id"] + ".webp"), density=100, webp=True)

with TemporaryDirectory() as temp:
    for row in CATALOG["screens"]:
        file = Path(temp) / "source.pdf"
        screen(file, row)
        raster(file, OUTPUT / (row["id"] + ".png"))

print("Rendered 14 PDFs, 14 PDF previews and 6 demonstration screenshots.")
