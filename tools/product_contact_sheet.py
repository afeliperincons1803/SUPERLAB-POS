from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

folder = Path(r"C:\Users\WinterOS\Documents\POS HELADERIA\frontend\static\products")
files = sorted(folder.glob("*.webp"))
size, label, cols = 260, 34, 4
rows = (len(files) + cols - 1) // cols
sheet = Image.new("RGB", (cols * size, rows * (size + label)), "white")
draw = ImageDraw.Draw(sheet)
font = ImageFont.load_default(size=16)
for i, file in enumerate(files):
    with Image.open(file) as image:
        image.thumbnail((size - 18, size - 18), Image.Resampling.LANCZOS)
        x = i % cols * size + (size - image.width) // 2
        y = i // cols * (size + label) + (size - image.height) // 2
        sheet.paste(image, (x, y))
        draw.text((i % cols * size + 10, i // cols * (size + label) + size + 5), file.stem, fill="#15233f", font=font)
sheet.save(folder / "preview.jpg", quality=90)
