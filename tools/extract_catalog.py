from __future__ import annotations

import json
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


source = Path(r"C:\Users\WinterOS\Downloads\catalogo_productos_superlab.xlsx")
output = Path(r"C:\Users\WinterOS\Documents\POS HELADERIA\catalog-images")
output.mkdir(parents=True, exist_ok=True)

with zipfile.ZipFile(source) as archive:
    media = sorted(
        (name for name in archive.namelist() if name.startswith("xl/media/")),
        key=lambda name: int("".join(filter(str.isdigit, Path(name).stem)) or "1"),
    )
    extracted = []
    for index, name in enumerate(media, start=1):
        suffix = Path(name).suffix.lower() or ".png"
        destination = output / f"{index:03d}{suffix}"
        destination.write_bytes(archive.read(name))
        extracted.append(destination)

thumb_size = 260
label_height = 42
columns = 4
rows = (len(extracted) + columns - 1) // columns
sheet = Image.new("RGB", (columns * thumb_size, rows * (thumb_size + label_height)), "white")
draw = ImageDraw.Draw(sheet)
font = ImageFont.load_default(size=18)
metadata = []

for index, image_path in enumerate(extracted):
    with Image.open(image_path) as image:
        image = image.convert("RGB")
        metadata.append({"file": image_path.name, "width": image.width, "height": image.height})
        image.thumbnail((thumb_size - 20, thumb_size - 20), Image.Resampling.LANCZOS)
        x = (index % columns) * thumb_size + (thumb_size - image.width) // 2
        y = (index // columns) * (thumb_size + label_height) + (thumb_size - image.height) // 2
        sheet.paste(image, (x, y))
        draw.text(((index % columns) * thumb_size + 12, (index // columns) * (thumb_size + label_height) + thumb_size + 8), f"{index + 1:03d} · {metadata[-1]['width']}×{metadata[-1]['height']}", fill="#15233f", font=font)

sheet.save(output / "contact-sheet.jpg", quality=92)
(output / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
print(json.dumps(metadata))
