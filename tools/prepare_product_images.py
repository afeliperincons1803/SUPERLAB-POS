from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter


source = Path(r"C:\Users\WinterOS\Documents\POS HELADERIA\catalog-images")
output = Path(r"C:\Users\WinterOS\Documents\POS HELADERIA\frontend\static\products")
output.mkdir(parents=True, exist_ok=True)

# Crops isolate the product from the original 160px catalog card.
crops = {
    1: (54, 49, 108, 120),
    2: (45, 56, 128, 107),
    3: (34, 64, 132, 108),
    4: (67, 58, 112, 106),
    5: (65, 59, 112, 108),
    6: (64, 58, 113, 109),
    7: (63, 58, 113, 106),
    8: (64, 61, 112, 101),
    9: (64, 61, 111, 105),
    10: (63, 53, 107, 101),
    11: (63, 53, 107, 102),
    12: (63, 53, 106, 102),
    13: (63, 53, 107, 103),
    14: (63, 53, 105, 102),
}

for index, box in crops.items():
    with Image.open(source / f"{index:03d}.png") as original:
        crop = original.convert("RGB").crop(box)
        crop = ImageEnhance.Contrast(crop).enhance(1.08)
        crop = ImageEnhance.Color(crop).enhance(1.08)
        crop = crop.resize((620, 620), Image.Resampling.LANCZOS)
        crop = crop.filter(ImageFilter.UnsharpMask(radius=1.4, percent=125, threshold=3))
        canvas = Image.new("RGB", (720, 720), "#FAFAF7")
        canvas.paste(crop, (50, 50))
        canvas.save(output / f"{index:03d}.webp", "WEBP", quality=92, method=6)

print(f"Prepared {len(crops)} product images in {output}")
