from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


@dataclass(frozen=True)
class Color:
    r: int
    g: int
    b: int
    a: int = 255

    def lerp(self, other: "Color", t: float) -> "Color":
        return Color(
            r=round(self.r + (other.r - self.r) * t),
            g=round(self.g + (other.g - self.g) * t),
            b=round(self.b + (other.b - self.b) * t),
            a=round(self.a + (other.a - self.a) * t),
        )

    def rgba(self) -> tuple[int, int, int, int]:
        return (self.r, self.g, self.b, self.a)


def linear_gradient(size: int, top: Color, bottom: Color) -> Image.Image:
    img = Image.new("RGBA", (size, size))
    draw = ImageDraw.Draw(img)
    for y in range(size):
        t = y / (size - 1)
        c = top.lerp(bottom, t).rgba()
        draw.line([(0, y), (size, y)], fill=c)
    return img


def add_radial_glow(base: Image.Image, center_xy: tuple[int, int], radius: int, color: Color) -> None:
    size = base.size[0]
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    cx, cy = center_xy
    gdraw.ellipse(
        (cx - radius, cy - radius, cx + radius, cy + radius),
        fill=color.rgba(),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(radius * 0.35))
    base.alpha_composite(glow)


def draw_pin(base: Image.Image) -> None:
    size = base.size[0]
    draw = ImageDraw.Draw(base)

    # Pin geometry (friendly + modern)
    cx = size // 2
    cy = round(size * 0.42)
    r = round(size * 0.16)

    # Shadow
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow)
    sdraw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(0, 0, 0, 110))
    sdraw.polygon(
        [
            (cx - r * 0.75, cy + r * 0.25),
            (cx + r * 0.75, cy + r * 0.25),
            (cx, cy + r * 2.2),
        ],
        fill=(0, 0, 0, 110),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(round(size * 0.02)))
    base.alpha_composite(shadow, (0, round(size * 0.01)))

    # Body
    body = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bdraw = ImageDraw.Draw(body)
    bdraw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(255, 255, 255, 245))
    bdraw.polygon(
        [
            (cx - r * 0.75, cy + r * 0.18),
            (cx + r * 0.75, cy + r * 0.18),
            (cx, cy + r * 2.2),
        ],
        fill=(255, 255, 255, 245),
    )
    # Inner dot
    dot_r = round(r * 0.32)
    bdraw.ellipse(
        (cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r),
        fill=(15, 23, 42, 255),
    )
    # Subtle border
    bdraw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(255, 255, 255, 70), width=2)

    base.alpha_composite(body)


def make_icon(size: int, *, padding_ratio: float = 0.0) -> Image.Image:
    top = Color(232, 121, 249)  # fuchsia-400
    bottom = Color(34, 211, 238)  # cyan-400
    base = linear_gradient(size, top, bottom)

    add_radial_glow(base, (round(size * 0.25), round(size * 0.2)), round(size * 0.32), Color(251, 113, 133, 80))
    add_radial_glow(base, (round(size * 0.85), round(size * 0.35)), round(size * 0.36), Color(56, 189, 248, 70))

    # Dark vignette
    vignette = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    vdraw = ImageDraw.Draw(vignette)
    vdraw.ellipse(
        (-round(size * 0.25), -round(size * 0.25), round(size * 1.25), round(size * 1.25)),
        outline=(0, 0, 0, 130),
        width=round(size * 0.12),
    )
    vignette = vignette.filter(ImageFilter.GaussianBlur(round(size * 0.06)))
    base.alpha_composite(vignette)

    icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    icon.alpha_composite(base)

    if padding_ratio > 0:
        pad = round(size * padding_ratio)
        content = icon.crop((pad, pad, size - pad, size - pad)).resize((size, size), Image.Resampling.LANCZOS)
        icon = content

    draw_pin(icon)
    return icon


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    out_dir = root / "assets" / "icons"
    out_dir.mkdir(parents=True, exist_ok=True)

    icon_512 = make_icon(512)
    icon_192 = icon_512.resize((192, 192), Image.Resampling.LANCZOS)
    apple_180 = icon_512.resize((180, 180), Image.Resampling.LANCZOS)
    maskable_512 = make_icon(512, padding_ratio=0.12)

    icon_192.save(out_dir / "icon-192.png", optimize=True)
    icon_512.save(out_dir / "icon-512.png", optimize=True)
    maskable_512.save(out_dir / "maskable-512.png", optimize=True)
    apple_180.save(out_dir / "apple-touch-icon.png", optimize=True)

    print("Wrote icons to", out_dir)


if __name__ == "__main__":
    main()

