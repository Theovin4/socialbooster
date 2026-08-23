from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
source = root / "src" / "app" / "favicon-source.png"
target = root / "src" / "app" / "favicon.ico"
with Image.open(source) as image:
    image.save(target, format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
source.unlink()
