"""Генерация public/favicon.ico из public/favicon.svg (v0.02.03b).

Браузеры запрашивают /favicon.ico по умолчанию; без файла в public/
консоль приложения показывает 404 (дефект из обращения пользователя).
SVG растрируется через cairosvg при наличии, иначе рисуется эквивалент
PIL: сетка 2x2 квадратов с закруглёнными углами и соединительными
линиями (знак «модульная система») на прозрачном фоне.
"""

import struct
from pathlib import Path

PUBLIC = Path("public")
SVG = PUBLIC / "favicon.svg"
ICO = PUBLIC / "favicon.ico"


def svg_to_png_bytes(size: int) -> bytes | None:
    try:
        import cairosvg  # type: ignore

        return cairosvg.svg2png(bytestring=SVG.read_bytes(), output_width=size, output_height=size)
    except Exception:
        return None


def draw_fallback(size: int) -> bytes:
    """Эквивалент SVG средствами PIL: 4 квадрата + соединители."""
    from io import BytesIO

    from PIL import Image, ImageDraw

    scale = size / 24
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    stroke = (26, 35, 48, 255)
    width = max(1, round(2 * scale))

    def square(cx: float, cy: float) -> None:
        x0, y0 = cx * scale, cy * scale
        x1, y1 = (cx + 7) * scale, (cy + 7) * scale
        draw.rounded_rectangle([x0, y0, x1, y1], radius=scale, outline=stroke, width=width)

    square(3, 3)
    square(14, 3)
    square(3, 14)
    square(14, 14)
    # Соединительные линии между квадратами.
    draw.line([(10 * scale, 6.5 * scale), (14 * scale, 6.5 * scale)], fill=stroke, width=width)
    draw.line([(6.5 * scale, 10 * scale), (6.5 * scale, 14 * scale)], fill=stroke, width=width)
    draw.line([(17.5 * scale, 10 * scale), (17.5 * scale, 14 * scale)], fill=stroke, width=width)
    draw.line([(10 * scale, 17.5 * scale), (14 * scale, 17.5 * scale)], fill=stroke, width=width)
    buf = BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def build_ico(png_sizes: list[tuple[int, bytes]]) -> bytes:
    """Сборка ICO из набора PNG-слоёв (формат V1, PNG-компрессия)."""
    count = len(png_sizes)
    header = struct.pack("<HHH", 0, 1, count)
    body = b""
    offset = 6 + 16 * count
    for size, png in png_sizes:
        w = size if size < 256 else 0
        h = w
        body += struct.pack("<BBBBHHII", w, h, 0, 0, 1, 32, len(png), offset)
        offset += len(png)
    return header + body + b"".join(png for _, png in png_sizes)


def main() -> None:
    layers = []
    for size in (16, 32, 48):
        png = svg_to_png_bytes(size)
        if png is None:
            png = draw_fallback(size)
        layers.append((size, png))
    ICO.write_bytes(build_ico(layers))
    print(f"OK: {ICO} ({ICO.stat().st_size} bytes), layers: {[s for s, _ in layers]}")


if __name__ == "__main__":
    main()
