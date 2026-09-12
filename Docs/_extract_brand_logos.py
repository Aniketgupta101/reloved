# -*- coding: utf-8 -*-
from pathlib import Path
from pypdf import PdfReader
from PIL import Image

pdf_path = Path(r"c:\Users\PC 3\Desktop\Reloved-main\Reloved-main\Docs\RELOVED_Master_Brand_Handoff_FINAL.pdf")
out_dir = Path(r"c:\Users\PC 3\Desktop\Reloved-main\Reloved-main\Docs\_brand_pdf_extract")
out_dir.mkdir(exist_ok=True)

reader = PdfReader(str(pdf_path))
print("pages=", len(reader.pages))

# Page 4 in PDF viewer = index 3 (Logo Architecture)
for page_idx in [2, 3]:
    page = reader.pages[page_idx]
    print("\n=== page", page_idx + 1, "===")
    resources = page.get("/Resources")
    if not resources:
        print("no resources")
        continue
    xobjects = resources.get("/XObject")
    if not xobjects:
        print("no xobjects")
        continue
    xobjects = xobjects.get_object()
    count = 0
    for name in xobjects:
        obj = xobjects[name]
        if obj.get("/Subtype") != "/Image":
            continue
        count += 1
        w, h = obj["/Width"], obj["/Height"]
        data = obj.get_data()
        filt = obj.get("/Filter")
        print(name, w, "x", h, "filter=", filt, "bytes=", len(data))
        safe = str(name).replace("/", "")
        out = out_dir / ("page%d_%d_%s_%dx%d" % (page_idx + 1, count, safe, w, h))
        try:
            if filt == "/DCTDecode" or (isinstance(filt, list) and "/DCTDecode" in filt):
                out = out.with_suffix(".jpg")
                out.write_bytes(data)
            elif filt == "/FlateDecode":
                cs = obj.get("/ColorSpace")
                mode = "RGB"
                if cs == "/DeviceGray":
                    mode = "L"
                img = Image.frombytes(mode, (w, h), data)
                out = out.with_suffix(".png")
                img.save(out)
            else:
                out = out.with_suffix(".bin")
                out.write_bytes(data)
            print("  saved", out.name)
        except Exception as e:
            print("  save fail:", e)
    print("images=", count)
