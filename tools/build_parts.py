"""Turn the page transcriptions in ./wcp-raw/ into wcp-parts.json.

The transcriptions were read from individual wcproducts.com product pages on 2026-09-30.
Run: python3 tools/build_parts.py  (from the repo root)
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "tools" / "wcp-raw"
BASE_URL = "https://wcproducts.com/products/"


def bore_of(label):
    l = label.lower()
    if "splinexl" in l:
        return "splinexl"
    if "splinexs" in l:
        return "splinexs"
    if "1/2\" rounded hex" in l or "1/2\" rounded" in l:
        return "1/2hex-r"
    if "1/2\" hex" in l or "1/2\" hex" in l.replace("  ", " "):
        return "1/2hex"
    if "3/8\" rounded hex" in l:
        return "3/8hex-r"
    if "3/8\" hex" in l:
        return "3/8hex"
    if "8mm key" in l:
        return "8mmkey"
    if "8mm round" in l:
        return "8mmround"
    if "falcon" in l:
        return "falcon"
    if "rs550/775" in l:
        return "rs550/775"
    if "rs550" in l:
        return "rs550"
    if "rs775" in l:
        return "rs775"
    if "bag" in l:
        return "bag"
    return None


def expand(label):
    """Undo the abbreviations used while reading the pages."""
    reps = [("Pkt ", "Pocketed "), ("St ", "Steel "), ("Al ", "Aluminum "), ("SG", "Spur Gear"), ("Pul", "Pulley"),
            ("MX", "with MotionX"), ("CD", "Center Distance"), ("hex", "Hex Bore"), ("Spr", "Sprocket"), ("Pl ", "Plate ")]
    out = label
    for a, b in reps:
        out = out.replace(a, b)
    return out


def gear_rows(handle, default_label):
    text = (RAW / f"{handle}.txt").read_text()
    rows = []
    for line in text.splitlines():
        m = re.match(r"^(\d{4})\s+(\d+)\s+([\d.]+)(?:\s+\{(.*)\})?\s*$", line.strip())
        if not m:
            continue
        num, teeth, price, lab = m.groups()
        rows.append((f"WCP-{num}", int(teeth), float(price), lab or default_label))
    return rows


def gear_from(handle, default_label, material_default):
    out = []
    for sku, teeth, price, lab in gear_rows(handle, default_label):
        dp = 20
        mdp = re.search(r"\b(10|32) DP\b", lab)
        if mdp:
            dp = int(mdp.group(1))
        cd = re.search(r"(\d+)t CD", lab)
        material = "Steel" if re.search(r"\bSt\b|Steel", lab) else "Aluminum" if re.search(r"\bAl\b|Aluminum", lab) else material_default
        bore = bore_of(lab.replace("hex", "Hex").replace("Hex", "hex").replace('" hex', '" hex'))
        if bore is None:
            bore = bore_of(default_label)
        wide = "1/2\" Wide" in lab or "x 1/2\" Wide" in lab
        name = f"{teeth}t {expand(lab).strip()}"
        name = re.sub(r"^\d+t x ", f"{teeth}t x ", name)
        out.append({
            "sku": sku, "kind": "gear", "teeth": teeth, "dp": dp,
            "cdTeeth": int(cd.group(1)) if cd else None,
            "bore": bore, "material": material,
            "pocketed": bool(re.search(r"\bPkt\b|Pocketed", lab)) or handle == "aluminum-hex-bore-pocketed-gears",
            "motionX": "MX" in lab or "MotionX" in lab,
            "width": "0.5in" if (wide or handle not in ("splinexs-bore-gears", "20dp-motor-gears")) else ("thin" if handle == "splinexs-bore-gears" else None),
            "price": price, "url": BASE_URL + handle, "name": name,
        })
    return out


def pulley_rows():
    out = []
    # aluminum HTD + SplineXS HTD (same format)
    for handle in ("htd-timing-pulleys", "splinexs-htd-timing-pulleys"):
        base = 'x 9mm Wide Al Pul (HTD 5mm, 1/2" hex)' if handle == "htd-timing-pulleys" else "x 9mm Wide Al Pul (HTD 5mm, 8mm SplineXS Bore)"
        for sku, teeth, price, lab in gear_rows(handle, base):
            w = 15 if "15mm" in lab else 9
            out.append({"sku": sku, "kind": "pulley", "profile": "HTD5", "pitchMm": 5, "widthMm": w, "teeth": teeth,
                        "bore": bore_of(lab), "material": "Aluminum", "price": price, "url": BASE_URL + handle,
                        "name": f"{teeth}t x {w}mm Wide Aluminum Pulley (HTD 5mm, {bore_label(bore_of(lab))})"})
    out.append({"sku": "WCP-1444", "kind": "pulley", "profile": "HTD5", "pitchMm": 5, "widthMm": 9, "teeth": 24, "bore": "1/2hex",
                "material": "Nylon", "price": 6.49, "url": BASE_URL + "plastic-htd-timing-pulleys",
                "name": '24t x 9mm Wide Plastic Pulley (HTD 5mm, 1/2" Hex Bore)'})
    # GT2
    text = (RAW / "gt2-timing-pulleys-belts.txt").read_text()
    for line in text.splitlines():
        m = re.match(r"^(\d{4}) ([\d.]+) (\d+)t x (\d+)mm Wide Aluminum Pulley \(GT2 3mm, (.*)\)$", line.strip())
        if m:
            num, price, teeth, w, b = m.groups()
            out.append({"sku": f"WCP-{num}", "kind": "pulley", "profile": "GT2", "pitchMm": 3, "widthMm": int(w), "teeth": int(teeth),
                        "bore": bore_of(b), "material": "Aluminum", "price": float(price), "url": BASE_URL + "gt2-timing-pulleys-belts",
                        "name": f"{teeth}t x {w}mm Wide Aluminum Pulley (GT2 3mm, {b})"})
    # de-dup (SplineXS pulleys appear on two pages)
    seen, uniq = set(), []
    for p in out:
        if p["sku"] in seen:
            continue
        seen.add(p["sku"])
        uniq.append(p)
    return uniq


def bore_label(b):
    return {"1/2hex": '1/2" Hex Bore', "1/2hex-r": '1/2" Rounded Hex Bore', "3/8hex": '3/8" Hex Bore', "3/8hex-r": '3/8" Rounded Hex Bore',
            "splinexs": "8mm SplineXS Bore", "splinexl": "SplineXL Bore", "8mmkey": "8mm Key Bore", "8mmround": "8mm Round Bore",
            "falcon": "Falcon Bore", "rs550": "RS550 Bore", "rs775": "RS775 Bore", "rs550/775": "RS550/775 Bore", "bag": "BAG Bore"}.get(b, b)


def belt_rows():
    out = []
    for handle, w in (("htd-timing-belts-9mm-width", 9), ("htd-timing-belts-15mm-width", 15)):
        text = (RAW / f"{handle}.txt").read_text()
        for line in text.splitlines():
            for kind in ("SINGLE", "DOUBLE"):
                if line.startswith(kind + ":"):
                    for tok in line.split(":", 1)[1].split():
                        num, teeth, price = tok.split(":")
                        out.append({"sku": f"WCP-{num}", "kind": "belt", "profile": "HTD5", "pitchMm": 5, "widthMm": w, "teeth": int(teeth),
                                    "double": kind == "DOUBLE", "price": float(price), "url": BASE_URL + handle,
                                    "name": f"{teeth}t x {w}mm Wide {'Double Sided ' if kind == 'DOUBLE' else ''}Timing Belt (HTD 5mm)"})
    text = (RAW / "gt2-timing-pulleys-belts.txt").read_text()
    grab = False
    for line in text.splitlines():
        if line.startswith("BELTS"):
            grab = True
            continue
        if grab and line.strip():
            for tok in line.split():
                num, teeth, price = tok.split(":")
                out.append({"sku": f"WCP-{num}", "kind": "belt", "profile": "GT2", "pitchMm": 3, "widthMm": 9, "teeth": int(teeth),
                            "double": False, "price": float(price), "url": BASE_URL + "gt2-timing-pulleys-belts",
                            "name": f"{teeth}t x 9mm Wide Timing Belt (GT2 3mm)"})
    return out


def sprocket_rows():
    out = []
    for handle, chain in (("25-sprockets", "25"), ("35-sprockets", "35")):
        text = (RAW / f"{handle}.txt").read_text()
        body = "\n".join(text.splitlines()[1:])
        for tok in body.replace("\n", " | ").split(" | "):
            tok = tok.strip()
            m = re.match(r"^(\d{4}):([\d.]+):(\d+)t (.*)$", tok)
            if not m:
                continue
            num, price, teeth, lab = m.groups()
            material = "Steel" if lab.startswith("St ") else "Aluminum"
            style = "plate" if " Pl Spr" in lab else "hub"
            b = bore_of(lab.replace("hex", 'hex').replace("SplineXL )", "SplineXL"))
            out.append({"sku": f"WCP-{num}", "kind": "sprocket", "chain": chain, "teeth": int(teeth), "bore": b, "material": material,
                        "style": style, "price": float(price), "url": BASE_URL + handle,
                        "name": f"{teeth}t {material} {'Plate Sprocket' if style == 'plate' else lab.split(' ', 1)[1].split(' (')[0].replace('Spr', 'Sprocket')} (#{chain} Chain, {bore_label(b)})"})
    return out


def chain_rows():
    return [
        {"sku": "WCP-0764", "kind": "chain", "chain": "25", "item": "chain", "name": "#25 Roller Chain (10 feet)", "price": 12.99},
        {"sku": "WCP-0765", "kind": "chain", "chain": "25", "item": "master", "name": "#25 Master Link (5 Pack)", "price": 4.99},
        {"sku": "WCP-0766", "kind": "chain", "chain": "25", "item": "half", "name": "#25 Half Link (5 Pack)", "price": 8.99},
        {"sku": "WCP-0888", "kind": "chain", "chain": "25", "item": "onehalf", "name": "#25 1.5 Link (2 Pack)", "price": 3.99},
        {"sku": "WCP-0767", "kind": "chain", "chain": "25H", "item": "chain", "name": "#25H Roller Chain (10 Feet)", "price": 13.99},
        {"sku": "WCP-0768", "kind": "chain", "chain": "25H", "item": "master", "name": "#25H Master Link (5 Pack)", "price": 4.99},
        {"sku": "WCP-0769", "kind": "chain", "chain": "25H", "item": "half", "name": "#25H Half Link (5 Pack)", "price": 8.99},
        {"sku": "WCP-0770", "kind": "chain", "chain": "35", "item": "chain", "name": "#35 Roller Chain (10 feet)", "price": 12.99},
        {"sku": "WCP-0771", "kind": "chain", "chain": "35", "item": "master", "name": "#35 Master Link (5 Pack)", "price": 3.99},
        {"sku": "WCP-0772", "kind": "chain", "chain": "35", "item": "half", "name": "#35 Half Link (5 Pack)", "price": 8.99},
        {"sku": "WCP-0051", "kind": "chain", "chain": "25", "item": "tensioner", "name": "Spartan #25 Chain Tensioner", "price": 14.99},
        {"sku": "WCP-0052", "kind": "chain", "chain": "35", "item": "tensioner", "name": "Spartan #35 Chain Tensioner", "price": 14.99},
        {"sku": "WCP-0247", "kind": "chain", "chain": "25", "item": "turnbuckle", "name": "#25 Chain TurnBuckle", "price": 14.99},
        {"sku": "WCP-2027", "kind": "chain", "chain": "25", "item": "turnbuckle", "name": "#25 Chain Mini TurnBuckle", "price": 14.99},
        {"sku": "WCP-0963", "kind": "chain", "chain": "35", "item": "turnbuckle", "name": "#35 Chain TurnBuckle V2", "price": 14.99},
    ]


def bearing_rows():
    # flanged bearings for plate holes (from the Imperial Bearings page)
    return [
        {"sku": "WCP-0783", "kind": "bearing", "bore": "1/2hex", "od": 1.125, "width": 0.313, "flanged": True, "price": 2.99, "name": '0.500" Hex ID x 1.125" OD x 0.313" WD Flanged Bearing'},
        {"sku": "WCP-0785", "kind": "bearing", "bore": "1/2hex-r", "od": 1.125, "width": 0.313, "flanged": True, "price": 2.99, "name": '13.75mm (1/2" Rounded Hex) ID x 1.125" OD x 0.313" WD Flanged Bearing'},
        {"sku": "WCP-2058", "kind": "bearing", "bore": "1/2hex-r", "od": 1.000, "width": 0.281, "flanged": True, "price": 2.99, "name": '13.75mm (1/2" Rounded Hex) ID x 1.000" OD x 0.281" WD Flanged Bearing'},
        {"sku": "WCP-2057", "kind": "bearing", "bore": "1/2hex-r", "od": 0.875, "width": 0.281, "flanged": True, "price": 2.99, "name": '13.75mm (1/2" Rounded Hex) ID x 0.875" OD x 0.281" WD Flanged Bearing'},
        {"sku": "WCP-1507", "kind": "bearing", "bore": "3/8hex", "od": 1.125, "width": 0.313, "flanged": True, "price": 2.99, "name": '0.375" Hex ID x 1.125" OD x 0.313" WD Flanged Bearing'},
        {"sku": "WCP-0784", "kind": "bearing", "bore": "3/8hex-r", "od": 0.875, "width": 0.280, "flanged": True, "price": 1.99, "name": '10.25mm (3/8" Rounded Hex) ID x 0.875" OD x 0.280" WD Flanged Bearing'},
        {"sku": "WCP-2061", "kind": "bearing", "bore": "3/8hex-r", "od": 1.000, "width": 0.281, "flanged": True, "price": 2.99, "name": '10.25mm (3/8" Rounded Hex) ID x 1.000" OD x 0.281" WD Flanged Bearing'},
        {"sku": "WCP-0781", "kind": "bearing", "bore": "1/2round", "od": 1.125, "width": 0.313, "flanged": True, "price": 1.99, "name": '0.500" ID x 1.125" OD x 0.313" WD Flanged Bearing'},
        {"sku": "WCP-0780", "kind": "bearing", "bore": "3/8round", "od": 1.125, "width": 0.313, "flanged": True, "price": 2.99, "name": '0.375" ID x 1.125" OD x 0.313" WD Flanged Bearing'},
    ]


MOTORS = [
    {"id": "x60", "name": "Kraken X60", "sku": "WCP-0940",
     "modes": {"trap": {"label": "Trapezoidal", "freeRPM": 6000, "freeA": 2, "stallNm": 7.09, "stallA": 366},
               "foc": {"label": "FOC", "freeRPM": 5800, "freeA": 2, "stallNm": 9.37, "stallA": 483}},
     "shaft": "splinexs", "shaftNote": "SplineXS, 8 mm OD, fixed shaft",
     "mount": {"boltCircle": 2.0, "thread": "#10-32", "pilot": 0.75, "holesNote": "11x #10-32 blind on a 2\" bolt circle, 30° apart (CIM 2-hole pattern works)"},
     "bodyDia": 2.37, "length": 2.96,
     "source": "https://docs.wcproducts.com/welcome/electronics/kraken-x60/kraken-x60-motor/overview-and-features/motor-performance"},
    {"id": "x44", "name": "Kraken X44", "sku": "WCP-0941",
     "modes": {"trap": {"label": "Trapezoidal", "freeRPM": 7758, "freeA": 3, "stallNm": 4.11, "stallA": 279},
               "foc": {"label": "FOC", "freeRPM": 7368, "freeA": 3, "stallNm": 5.01, "stallA": 329}},
     "shaft": "splinexs", "shaftNote": "SplineXS (same shaft and boss as the X60)",
     "mount": {"boltCircle": 1.375, "thread": "#10-32", "pilot": 0.75, "holesNote": "11x #10-32 blind on a 1.375\" bolt circle, 30° apart"},
     "bodyDia": 1.73, "length": 2.96,
     "source": "https://docs.wcproducts.com/welcome/electronics/kraken-x44/kraken-x44-motor/overview-and-features/motor-performance"},
    {"id": "vortex", "name": "NEO Vortex", "sku": "REV-21-1652",
     "modes": {"std": {"label": "Standard", "freeRPM": 6784, "freeA": 3.6, "stallNm": 3.6, "stallA": 211}},
     "shaft": "8mmkey", "shaftOptions": ["8mmkey", "falcon"], "shaftNote": "Interchangeable Vortex shafts: 8mm keyed, Falcon-compatible spline, and others",
     "mount": {"boltCircle": 2.0, "thread": "#10-32", "pilot": 0.75, "holesNote": "#10-32 on a 2\" bolt circle (REV); check hole count against your motor"},
     "bodyDia": 2.36, "length": 3.14,
     "source": "https://www.revrobotics.com/rev-21-1652/"},
]


def main():
    gears = []
    gears += gear_from("aluminum-hex-bore-gears", 'Al SG (1/2" hex)', "Aluminum")
    gears += gear_from("aluminum-hex-bore-pocketed-gears", 'Pkt Al SG (1/2" hex)', "Aluminum")
    gears += gear_from("steel-hex-bore-gears", 'Pkt St SG MX (1/2" hex)', "Steel")
    gears += gear_from("aluminum-3-8-hex-bore-gears", 'Al SG (3/8" hex)', "Aluminum")
    gears += gear_from("steel-3-8-hex-bore-gears", 'Pkt St SG (3/8" hex)', "Steel")
    gears += gear_from("aluminum-splinexl-gears", "Al SG (SplineXL Bore)", "Aluminum")
    gears += gear_from("steel-splinexl-gears", "St SG (SplineXL Bore)", "Steel")
    gears += gear_from("splinexs-bore-gears", 'x 1/2" Wide St SG (8mm SplineXS Bore)', "Steel")
    gears += gear_from("20dp-motor-gears", "St SG (8mm SplineXS Bore)", "Steel")
    seen, g2 = set(), []
    for g in gears:
        if g["sku"] in seen:
            continue
        seen.add(g["sku"])
        g2.append(g)
    data = {
        "about": "WestCoast Products power-transmission parts for BTR Calc. Read from individual wcproducts.com product pages on 2026-09-30. "
                 "Prices are the per-option prices shown in WCP's configurator that day; check the cart before ordering.",
        "updated": "2026-09-30",
        "bores": {k: bore_label(k) for k in ["1/2hex", "1/2hex-r", "3/8hex", "3/8hex-r", "splinexs", "splinexl", "8mmkey", "8mmround", "falcon", "rs550", "rs775", "rs550/775", "bag"]},
        "motors": MOTORS,
        "gears": g2,
        "pulleys": pulley_rows(),
        "belts": belt_rows(),
        "sprockets": sprocket_rows(),
        "chain": chain_rows(),
        "bearings": bearing_rows(),
    }
    out = ROOT / "wcp-parts.json"
    out.write_text(json.dumps(data, indent=1))
    for k in ("gears", "pulleys", "belts", "sprockets", "chain", "bearings", "motors"):
        print(k, len(data[k]))


if __name__ == "__main__":
    main()
