# -*- coding: utf-8 -*-
from pathlib import Path
from pypdf import PdfReader
from PIL import Image
import zlib
import base64
import re

pdf_path = Path(r"c:\Users\PC 3\Desktop\Reloved-main\Reloved-main\Docs\RELOVED_Master_Brand_Handoff_FINAL.pdf")
out_dir = Path(r"c:\Users\PC 3\Desktop\Reloved-main\Reloved-main\Docs\_brand_pdf_extract")
out_dir.mkdir(exist_ok=True)

# ASCII85 decode helper
_a85 = bytes(range(33, 118))  # ! to u


def ascii85_decode(data: bytes) -> bytes:
    # strip whitespace
    s = re.sub(rb"\s+", b"", data)
    if s.startswith(b"<~"):
        s = s[2:]
    if s.endswith(b"~>"):
        s = s[:-2]
    out = bytearray()
    i = 0
    while i < len(s):
        if s[i : i + 1] == b"z":
            out.extend(b"\x00\x00\x00\x00")
            i += 1
            continue
        chunk = s[i : i + 5]
        i += len(chunk)
        if len(chunk) < 5:
            chunk = chunk + b"u" * (5 - len(chunk))
            n = 0
            for c in chunk:
                n = n * 85 + (c - 33)
            full = n.to_bytes(4, "big")
            out.extend(full[: len(s[i - len(chunk) + (5 - (5 - len(chunk))) :]) or 4])
            # simpler pad handling below
            break
        n = 0
        for c in chunk:
            n = n * 85 + (c - 33)
        out.extend(n.to_bytes(4, "big"))
    # redo properly with adobe ascii85
    return _ascii85_adobe(data)


def _ascii85_adobe(data: bytes) -> bytes:
    s = re.sub(rb"\s+", b"", data)
    if s.startswith(b"<~"):
        s = s[2:]
    if s.endswith(b"~>"):
        s = s[:-2]
    out = bytearray()
    i = 0
    n = len(s)
    while i < n:
        if s[i : i + 1] == b"z":
            out.extend(b"\x00\x00\x00\x00")
            i += 1
            continue
        remain = n - i
        take = min(5, remain)
        chunk = s[i : i + take]
        i += take
        pad = 5 - len(chunk)
        chunk = chunk + b"u" * pad
        value = 0
        for c in chunk:
            value = value * 85 + (c - 33)
        full = value.to_bytes(4, "big")
        out.extend(full[: 4 - pad])
    return bytes(out)


reader = PdfReader(str(pdf_path))
page = reader.pages[3]  # logo architecture
xobjects = page["/Resources"]["/XObject"].get_object()

for name in xobjects:
    obj = xobjects[name]
    if obj.get("/Subtype") != "/Image":
        continue
    w, h = int(obj["/Width"]), int(obj["/Height"])
    raw = obj.get_data()  # pypdf should already decode filters
    print(name, w, h, "decoded_len", len(raw), "cs", obj.get("/ColorSpace"), "bpc", obj.get("/BitsPerComponent"))
    safe = str(name).replace("/", "")[-12:]
    out = out_dir / ("page4_%s_%dx%d.png" % (safe, w, h))
    try:
        bpc = int(obj.get("/BitsPerComponent") or 8)
        cs = obj.get("/ColorSpace")
        if cs == "/DeviceRGB" or (hasattr(cs, "name") is False and str(cs) == "/DeviceRGB"):
            mode = "RGB"
            expected = w * h * 3
        elif cs == "/DeviceGray":
            mode = "L"
            expected = w * h
        elif cs == "/DeviceCMYK":
            mode = "CMYK"
            expected = w * h * 4
        else:
            # try RGB
            mode = "RGB"
            expected = w * h * 3
        if len(raw) < expected:
            print("  short data", len(raw), "expected", expected)
            continue
        img = Image.frombytes(mode, (w, h), raw[:expected])
        if mode == "CMYK":
            img = img.convert("RGB")
        img.save(out)
        print("  saved", out.name)
    except Exception as e:
        print("  fail", e)

# Also try pypdf page render via pymupdf if available
try:
    import fitz
    doc = fitz.open(str(pdf_path))
    for i in [2, 3]:
        pix = doc[i].get_pixmap(matrix=fitz.Matrix(2, 2))
        p = out_dir / ("page%d_render.png" % (i + 1))
        pix.save(str(p))
        print("rendered", p.name)
except Exception as e:
    print("fitz render fail", e)
