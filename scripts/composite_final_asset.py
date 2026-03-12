#!/usr/bin/env python3
"""
Phase 6: Compositing Engine
Combines template, background, product, copy, and logo into final ad creative
"""

import sys
import json
import os
import base64
import textwrap
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from io import BytesIO
import urllib.request
import ssl

# Build an SSL context that works on Railway (and other containers without
# a complete CA bundle).  Try certifi first; fall back to an unverified
# context so downloads from Google Drive CDN still succeed.
try:
    import certifi
    _ssl_ctx = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    _ssl_ctx = ssl.create_default_context()
    _ssl_ctx.check_hostname = False
    _ssl_ctx.verify_mode = ssl.CERT_NONE

from urllib.parse import urlparse

# ── Security: URL allowlist ──────────────────────────────────────────────────
_ALLOWED_DOMAINS = {
    'lh3.googleusercontent.com',
    'drive.google.com',
    'drive.usercontent.google.com',
    'fonts.gstatic.com',
    'fonts.googleapis.com',
    'supabase.co',  # Fonts stored in brand-assets bucket (same-origin for @font-face)
}

def _is_allowed_url(url: str) -> bool:
    """Return True if the URL is safe to fetch (allowlisted domain or data URI)."""
    if not url:
        return False
    if url.startswith('data:'):
        return True
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ('https', 'http'):
            return False
        hostname = (parsed.hostname or '').lower()
        return any(
            hostname == d or hostname.endswith('.' + d)
            for d in _ALLOWED_DOMAINS
        )
    except Exception:
        return False


def remove_white_background(img, threshold=225):
    """Remove white/near-white background from a product image using flood-fill.

    Unlike a simple threshold that kills ALL white pixels (including white text
    on the product label), this flood-fills from the image edges so only the
    connected background region is removed.  White elements inside the product
    (labels, text) are preserved.

    After removal, auto-crops to content bounds.
    Returns an RGBA image containing just the product.
    """
    import numpy as np
    from collections import deque

    img = img.convert('RGBA')
    w, h = img.size
    pixels = np.array(img)  # shape (h, w, 4)

    # Mask of "white-ish" pixels
    is_white = (
        (pixels[:, :, 0] >= threshold) &
        (pixels[:, :, 1] >= threshold) &
        (pixels[:, :, 2] >= threshold)
    )

    # Flood-fill from all edge pixels that are white
    visited = np.zeros((h, w), dtype=bool)
    queue = deque()

    # Seed from all four edges
    for x in range(w):
        if is_white[0, x]:
            queue.append((0, x))
            visited[0, x] = True
        if is_white[h - 1, x]:
            queue.append((h - 1, x))
            visited[h - 1, x] = True
    for y in range(h):
        if is_white[y, 0]:
            queue.append((y, 0))
            visited[y, 0] = True
        if is_white[y, w - 1]:
            queue.append((y, w - 1))
            visited[y, w - 1] = True

    # BFS flood-fill through connected white pixels
    while queue:
        cy, cx = queue.popleft()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            ny, nx = cy + dy, cx + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and is_white[ny, nx]:
                visited[ny, nx] = True
                queue.append((ny, nx))

    # Set visited (edge-connected white) pixels to transparent
    pixels[visited, 3] = 0

    result = Image.fromarray(pixels)

    # Auto-crop: trim transparent padding to content bounds
    bbox = result.getbbox()
    if bbox:
        result = result.crop(bbox)

    return result


def download_image(url):
    """Download image from URL and return PIL Image.
    Handles both HTTP(S) URLs and data: URIs (base64-encoded inline images)."""
    if not _is_allowed_url(url):
        raise ValueError(f"URL not allowed by security policy: {url}")
    if url.startswith('data:'):
        # Parse data URI: data:[<mediatype>][;base64],<data>
        header, data = url.split(',', 1)
        image_bytes = base64.b64decode(data)
        return Image.open(BytesIO(image_bytes))

    with urllib.request.urlopen(url, timeout=30, context=_ssl_ctx) as response:
        return Image.open(BytesIO(response.read()))


_font_cache = {}


def _is_dark_color(hex_color):
    """Check if a hex color is dark (for choosing contrasting shadow)."""
    hex_color = hex_color.lstrip('#')
    if len(hex_color) < 6:
        return True
    r = int(hex_color[0:2], 16)
    g = int(hex_color[2:4], 16)
    b = int(hex_color[4:6], 16)
    return (r * 0.299 + g * 0.587 + b * 0.114) < 128


def download_font(url):
    """Download a font file from URL to /tmp/ and return the local path.
    Results are cached so the same font URL is only downloaded once per run."""
    if not _is_allowed_url(url):
        raise ValueError(f"Font URL not allowed by security policy: {url}")
    if url in _font_cache:
        return _font_cache[url]

    import hashlib
    url_hash = hashlib.md5(url.encode()).hexdigest()[:12]
    ext = '.ttf'
    for candidate_ext in ('.otf', '.woff', '.woff2', '.ttc'):
        if candidate_ext in url.lower():
            ext = candidate_ext
            break
    local_path = f"/tmp/font_{url_hash}{ext}"

    if os.path.exists(local_path):
        _font_cache[url] = local_path
        return local_path

    sys.stderr.write(f"  Downloading custom font: {url[:80]}...\n")
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30, context=_ssl_ctx) as response:
        content_type = response.headers.get('Content-Type', '')
        font_bytes = response.read()

    # Google Drive may return HTML confirmation page instead of the actual file
    if b'<!DOCTYPE' in font_bytes[:200] or b'<html' in font_bytes[:200]:
        sys.stderr.write(f"  WARNING: Got HTML instead of font file ({len(font_bytes)} bytes, type={content_type})\n")
        # Try alternative GDrive URL format
        if 'drive.google.com' in url:
            import re
            file_id_match = re.search(r'[?&]id=([a-zA-Z0-9_-]+)', url)
            if file_id_match:
                alt_url = f"https://drive.usercontent.google.com/download?id={file_id_match.group(1)}&export=download&confirm=t"
                sys.stderr.write(f"  Retrying with alt URL: {alt_url[:80]}...\n")
                req2 = urllib.request.Request(alt_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req2, timeout=30, context=_ssl_ctx) as resp2:
                    font_bytes = resp2.read()
                if b'<!DOCTYPE' in font_bytes[:200] or b'<html' in font_bytes[:200]:
                    raise ValueError(f"Google Drive returned HTML for font download (both URLs failed)")

    with open(local_path, 'wb') as f:
        f.write(font_bytes)

    _font_cache[url] = local_path
    sys.stderr.write(f"  Font saved to {local_path} ({len(font_bytes)} bytes)\n")
    return local_path


# Font family name → list of candidate paths (first match wins)
FONT_FAMILY_MAP = {
    # Brandon Grotesque — commercial font; upload the .otf/.ttf via Brand Assets
    # for production rendering. Paths below cover common local install locations.
    'brandon-grotesque-regular': [
        "/Library/Fonts/BrandonGrotesque-Regular.otf",
        "/Library/Fonts/Brandon_Grotesque_Regular.otf",
        "/Library/Fonts/BrandonGrotesque-Regular.ttf",
        "/usr/share/fonts/brandon-grotesque/BrandonGrotesque-Regular.otf",
        "/usr/share/fonts/brandon-grotesque/BrandonGrotesque-Regular.ttf",
    ],
    'brandon-grotesque-medium': [
        "/Library/Fonts/BrandonGrotesque-Medium.otf",
        "/Library/Fonts/Brandon_Grotesque_Medium.otf",
        "/Library/Fonts/BrandonGrotesque-Medium.ttf",
        "/usr/share/fonts/brandon-grotesque/BrandonGrotesque-Medium.otf",
        "/usr/share/fonts/brandon-grotesque/BrandonGrotesque-Medium.ttf",
    ],
    'brandon-grotesque-bold': [
        "/Library/Fonts/BrandonGrotesque-Bold.otf",
        "/Library/Fonts/Brandon_Grotesque_Bold.otf",
        "/Library/Fonts/BrandonGrotesque-Bold.ttf",
        "/usr/share/fonts/brandon-grotesque/BrandonGrotesque-Bold.otf",
        "/usr/share/fonts/brandon-grotesque/BrandonGrotesque-Bold.ttf",
    ],
    'brandon-grotesque-black': [
        "/Library/Fonts/BrandonGrotesque-Black.otf",
        "/Library/Fonts/Brandon_Grotesque_Black.otf",
        "/Library/Fonts/BrandonGrotesque-Black.ttf",
        "/usr/share/fonts/brandon-grotesque/BrandonGrotesque-Black.otf",
        "/usr/share/fonts/brandon-grotesque/BrandonGrotesque-Black.ttf",
    ],
    'serif-bold': [
        "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSerif-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSerifBold.ttf",
        "/usr/share/fonts/truetype/noto/NotoSerif-Bold.ttf",
        "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
        "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf",
        "C:\\Windows\\Fonts\\georgiab.ttf",
    ],
    'serif-regular': [
        "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSerif-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSerif.ttf",
        "/usr/share/fonts/truetype/noto/NotoSerif-Regular.ttf",
        "/System/Library/Fonts/Supplemental/Georgia.ttf",
        "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
        "C:\\Windows\\Fonts\\georgia.ttf",
    ],
    'Georgia': [
        "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
        "/System/Library/Fonts/Supplemental/Georgia.ttf",
        "/Library/Fonts/Georgia Bold.ttf",
        "/Library/Fonts/Georgia.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSerif-Bold.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSerifBold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
        "C:\\Windows\\Fonts\\georgiab.ttf",
    ],
    'Times New Roman': [
        "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf",
        "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSerif-Bold.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSerifBold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
        "C:\\Windows\\Fonts\\timesbd.ttf",
    ],
    'Helvetica': [
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "C:\\Windows\\Fonts\\arial.ttf",
    ],
    'Arial': [
        "/Library/Fonts/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "C:\\Windows\\Fonts\\arial.ttf",
    ],
    'Verdana': [
        "/System/Library/Fonts/Supplemental/Verdana Bold.ttf",
        "/System/Library/Fonts/Supplemental/Verdana.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
        "C:\\Windows\\Fonts\\verdanab.ttf",
    ],
}

# Default fallback (sans-serif bold)
_DEFAULT_CANDIDATES = [
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
    "/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/Library/Fonts/Arial.ttf",
    "C:\\Windows\\Fonts\\arial.ttf",
]


def load_font(font_size, font_url=None, font_family=None, font_path=None):
    """Load a font. Priority: font_path (local) > font_url (download) > font_family (named) > default."""
    font_size = int(font_size)  # ensure integer

    # 1. Local file path (pre-downloaded by Node.js)
    if font_path and os.path.exists(font_path):
        try:
            f = ImageFont.truetype(font_path, font_size)
            sys.stderr.write(f"  -> Loaded local font: {font_path} at size {font_size}\n")
            return f
        except Exception as e:
            sys.stderr.write(f"WARNING: Failed to load local font {font_path}: {e}\n")

    # 2. Download from URL
    if font_url:
        try:
            local_path = download_font(font_url)
            f = ImageFont.truetype(local_path, font_size)
            try:
                os.unlink(local_path)
            except Exception:
                pass  # ignore cleanup errors
            sys.stderr.write(f"  -> Loaded downloaded font: {local_path} at size {font_size}\n")
            return f
        except Exception as e:
            sys.stderr.write(f"WARNING: Failed to load custom font from {font_url}: {e}\n")

    sys.stderr.write(f"  load_font: family={font_family!r}, url={font_url!r}, size={font_size}\n")
    candidates = FONT_FAMILY_MAP.get(font_family, _DEFAULT_CANDIDATES) if font_family else _DEFAULT_CANDIDATES
    for path in candidates:
        if os.path.exists(path):
            try:
                f = ImageFont.truetype(path, font_size)
                sys.stderr.write(f"  -> Loaded font: {path}\n")
                return f
            except Exception:
                continue

    # If named family had no matches, try default candidates as fallback
    if font_family and candidates is not _DEFAULT_CANDIDATES:
        for path in _DEFAULT_CANDIDATES:
            if os.path.exists(path):
                try:
                    f = ImageFont.truetype(path, font_size)
                    sys.stderr.write(f"  -> Fallback font: {path}\n")
                    return f
                except Exception:
                    continue

    sys.stderr.write("WARNING: No system font found, using PIL default bitmap font\n")
    return ImageFont.load_default()


def composite_final_asset(
    template_data,
    composite_url,
    copy_text,
    logo_url=None,
    output_path='/tmp/final_asset.png',
    width=1080,
    height=1080,
):
    """
    Composite final ad asset: place base image, then superimpose logo and text only.
    Does not modify the base image (no filters, no color change). When base dimensions
    match canvas, the image is used 1:1. Logo and text are drawn on top to match the preview.

    Args:
        template_data: Template JSON with layers and safe zones
        composite_url: URL to background/composite image
        copy_text: Text content for text layers
        logo_url: Optional URL to logo image (same as preview)
        output_path: Where to save final composite
        width: Canvas width in pixels
        height: Canvas height in pixels

    Returns:
        Path to generated asset
    """

    canvas_width = width
    canvas_height = height

    # Create blank canvas
    final_image = Image.new('RGB', (canvas_width, canvas_height), color='white')
    draw = ImageDraw.Draw(final_image)

    # Get layers from template
    layers = template_data.get('layers', [])

    # Sort layers by z_index
    sorted_layers = sorted(layers, key=lambda l: l.get('z_index', 0))

    sys.stderr.write(f"🎨 Compositing {len(sorted_layers)} layers on {canvas_width}x{canvas_height} canvas...\n")
    sys.stderr.write(f"📋 Full layer data: {json.dumps(sorted_layers, indent=2)}\n")
    sys.stderr.write(f"📋 Copy text: {json.dumps(copy_text)}\n")

    for layer in sorted_layers:
        layer_type = layer.get('type')
        x_percent = layer.get('x', 0)
        y_percent = layer.get('y', 0)
        width_percent = layer.get('width', 100)
        height_percent = layer.get('height', 100)

        # Convert percentages to pixels
        x = int((x_percent / 100) * canvas_width)
        y = int((y_percent / 100) * canvas_height)
        lw = int((width_percent / 100) * canvas_width)
        lh = int((height_percent / 100) * canvas_height)

        sys.stderr.write(f"  Layer {layer.get('id')}: {layer_type} at ({x}, {y}) size {lw}x{lh}\n")

        if layer_type == 'background':
            # Use base image as-is: only superimpose logo and text on top; do not modify the image.
            # When dimensions match, paste 1:1. When they differ, cover+crop to match preview.
            bg_image = download_image(composite_url)
            src_w, src_h = bg_image.size
            if src_w == canvas_width and src_h == canvas_height:
                # Exact match: use image unchanged (no resize, no crop)
                final_image.paste(bg_image, (0, 0))
                sys.stderr.write(f"    ✅ Pasted background 1:1 (no resize/crop)\n")
            else:
                # Resize-to-cover and center-crop to match preview (object-cover behavior)
                scale = max(canvas_width / src_w, canvas_height / src_h)
                new_w = int(src_w * scale)
                new_h = int(src_h * scale)
                bg_image = bg_image.resize((new_w, new_h), Image.Resampling.LANCZOS)
                crop_x = (new_w - canvas_width) // 2
                crop_y = (new_h - canvas_height) // 2
                bg_image = bg_image.crop((crop_x, crop_y, crop_x + canvas_width, crop_y + canvas_height))
                final_image.paste(bg_image, (0, 0))
                sys.stderr.write(f"    ✅ Pasted background (src {src_w}x{src_h} → cover {new_w}x{new_h} → crop to {canvas_width}x{canvas_height})\n")

        elif layer_type == 'product':
            # Product is already in composite, skip
            sys.stderr.write("    ⏭️  Product already in composite background\n")

        elif layer_type == 'text':
            # Resolve text: case-insensitive lookup against copy_text keys,
            # then fall back to copy_type match and generated_text.
            layer_name = layer.get('name') or ''

            # Build a case-insensitive lookup map: lowercase key → original value
            ci_map = {k.lower(): v for k, v in copy_text.items()}

            text_content = (
                copy_text.get(layer_name)                      # exact match first (e.g. "Left Text")
                or ci_map.get(layer_name.lower())              # case-insensitive (e.g. "left text")
                or (copy_text.get('copy_type', '').lower() == layer_name.lower() and copy_text.get('generated_text'))
                or copy_text.get('generated_text', '')
            )
            font_size = layer.get('font_size', 24)
            color = layer.get('color', '#000000')
            text_align = layer.get('text_align', 'center')
            line_spacing = int(font_size * 0.3)

            sys.stderr.write(f"    TEXT LAYER DEBUG: name={layer_name!r}, font_size={font_size}, "
                             f"font_family={layer.get('font_family')!r}, font_url={layer.get('font_url')!r}, "
                             f"color={color!r}, text={text_content[:50]!r}\n")

            font = load_font(font_size, font_url=layer.get('font_url'), font_family=layer.get('font_family'), font_path=layer.get('font_path'))

            # Word-wrap using actual font metrics (matches CSS text wrapping)
            def wrap_text_by_font(text, fnt, max_width):
                """Wrap text using actual glyph widths from the loaded font."""
                words = text.split()
                lines_out = []
                current_line = ''
                for word in words:
                    test = f"{current_line} {word}".strip() if current_line else word
                    try:
                        w = fnt.getlength(test)
                    except AttributeError:
                        w = draw.textlength(test, font=fnt)
                    if w <= max_width or not current_line:
                        current_line = test
                    else:
                        lines_out.append(current_line)
                        current_line = word
                if current_line:
                    lines_out.append(current_line)
                return lines_out or [text]

            lines = wrap_text_by_font(text_content, font, lw)
            wrapped_text = '\n'.join(lines)

            # Measure total wrapped text block
            bbox = draw.multiline_textbbox((0, 0), wrapped_text, font=font, spacing=line_spacing)
            block_width = bbox[2] - bbox[0]
            block_height = bbox[3] - bbox[1]

            # Horizontal alignment: match CSS text-align behavior within the layer box
            if text_align == 'center':
                text_x = x + (lw - block_width) // 2
            elif text_align == 'right':
                text_x = x + lw - block_width
            else:  # left
                text_x = x

            # Vertical position: place at the layer's Y coordinate (matching CSS top: Y%)
            # NOT vertically centered — the preview places text at the Y position directly.
            text_y = y
            # Clamp so text doesn't overflow below canvas
            if text_y + block_height > canvas_height:
                text_y = max(0, canvas_height - block_height - 4)

            sys.stderr.write(f"    Rendering text at ({text_x}, {text_y}), block {block_width}x{block_height}, "
                             f"font_size={font_size}, lines={len(lines)}\n")

            # Draw background rectangle if specified
            bg_color = layer.get('background_color')
            if bg_color:
                draw.rectangle([x, y, x + lw, y + lh], fill=bg_color)

            # Render text onto a transparent layer for smooth compositing
            text_layer = Image.new('RGBA', (canvas_width, canvas_height), (0, 0, 0, 0))
            text_draw = ImageDraw.Draw(text_layer)

            # Draw text directly (clean, no forced shadow)
            text_draw.multiline_text(
                (text_x, text_y),
                wrapped_text,
                fill=color,
                font=font,
                spacing=line_spacing,
                align=text_align,
            )

            # Composite text layer onto final image
            final_image = Image.alpha_composite(final_image.convert('RGBA'), text_layer).convert('RGB')
            draw = ImageDraw.Draw(final_image)

            sys.stderr.write(f"    ✅ Drew text ({len(lines)} lines): \"{text_content[:40]}...\"\n")

        elif layer_type == 'logo' and logo_url:
            # Superimpose logo only: same image as preview, fit inside layer (contain), centered. No other modification.
            logo_image = download_image(logo_url)
            logo_image = logo_image.convert('RGBA')

            # Fit inside layer bounds (contain), then center — matches preview object-contain
            logo_image.thumbnail((lw, lh), Image.Resampling.LANCZOS)
            paste_x = x + (lw - logo_image.width) // 2
            paste_y = y + (lh - logo_image.height) // 2

            logo_layer = Image.new('RGBA', (canvas_width, canvas_height), (0, 0, 0, 0))
            logo_layer.paste(logo_image, (paste_x, paste_y), logo_image)
            final_image = Image.alpha_composite(final_image.convert('RGBA'), logo_layer).convert('RGB')
            draw = ImageDraw.Draw(final_image)

            sys.stderr.write(f"    ✅ Pasted logo ({logo_image.width}x{logo_image.height} in {lw}x{lh} zone)\n")

        elif layer_type == 'overlay':
            source_url = layer.get('source_url', '')
            if not source_url:
                sys.stderr.write("    ⏭️  Overlay layer has no source_url, skipping\n")
                continue

            # SVG overlays (seeded overlays) cannot be opened by PIL — skip gracefully.
            # Upload a PNG overlay via Brand Assets to use it in final asset rendering.
            if source_url.lower().endswith('.svg') or 'image/svg' in source_url:
                sys.stderr.write("    ⏭️  SVG overlay skipped in PIL render (upload a PNG overlay to bake it in)\n")
                continue

            overlay_image = download_image(source_url)
            overlay_image = overlay_image.resize((lw, lh), Image.Resampling.LANCZOS)

            # Ensure alpha channel is present for transparency compositing
            if overlay_image.mode != 'RGBA':
                overlay_image = overlay_image.convert('RGBA')

            # Composite using alpha_composite for proper blending
            overlay_layer = Image.new('RGBA', (canvas_width, canvas_height), (0, 0, 0, 0))
            overlay_layer.paste(overlay_image, (x, y), overlay_image)
            final_image = Image.alpha_composite(final_image.convert('RGBA'), overlay_layer).convert('RGB')
            draw = ImageDraw.Draw(final_image)
            sys.stderr.write(f"    ✅ Pasted graphic overlay\n")

        elif layer_type == 'composite':
            # Composite layer — a pre-composed product+background image
            source_url = layer.get('source_url', '') or composite_url
            comp_img = download_image(source_url)
            # Cover the layer area (like background but positioned within bounds)
            comp_img = comp_img.resize((lw, lh), Image.Resampling.LANCZOS)
            if comp_img.mode == 'RGBA':
                final_image.paste(comp_img, (x, y), comp_img)
            else:
                final_image.paste(comp_img, (x, y))
            sys.stderr.write(f"    ✅ Pasted composite layer\n")

        elif layer_type == 'image':
            source_url = layer.get('source_url', '')
            if not source_url:
                sys.stderr.write("    ⏭️  Image layer has no source_url, skipping\n")
                continue

            img = download_image(source_url)
            obj_fit = layer.get('object_fit', 'cover')

            # Remove white background FIRST (before resizing) so auto-crop
            # trims the whitespace and we size only the actual product
            if layer.get('remove_bg'):
                img = remove_white_background(img)
                sys.stderr.write(f"    🔲 Removed white bg, cropped to {img.width}x{img.height}\n")

            if obj_fit == 'cover':
                # Resize to fill the cell then center-crop to exact dimensions
                scale = max(lw / img.width, lh / img.height)
                img = img.resize(
                    (int(img.width * scale), int(img.height * scale)),
                    Image.Resampling.LANCZOS,
                )
                left = (img.width - lw) // 2
                top = (img.height - lh) // 2
                img = img.crop((left, top, left + lw, top + lh))
            else:  # contain — fit inside cell, centered
                img.thumbnail((lw, lh), Image.Resampling.LANCZOS)
                # Center within cell bounds
                x = x + (lw - img.width) // 2
                y = y + (lh - img.height) // 2

            if img.mode == 'RGBA':
                final_image.paste(img, (x, y), img)
            else:
                final_image.paste(img, (x, y))

            sys.stderr.write(f"    ✅ Pasted image ({obj_fit})\n")

        elif layer_type == 'background_color':
            # Solid color fill (used by collage when no background image layer exists)
            bg_color = layer.get('background_color', '#FFFFFF')
            draw.rectangle([0, 0, canvas_width, canvas_height], fill=bg_color)
            sys.stderr.write(f"    ✅ Filled background color {bg_color}\n")

    # Save final composite
    final_image.save(output_path, 'PNG', quality=95)
    sys.stderr.write(f"\n✅ Final asset saved to: {output_path}\n")

    return output_path


def superimpose_product_on_background(
    background_url: str,
    product_url: str,
    output_path: str,
    width: int,
    height: int,
) -> str:
    """
    Remove white background from the product image and paste it on top of the
    background (no AI merge). Product is centered and scaled to fit ~60% of canvas.
    """
    bg_image = download_image(background_url)
    product_image = download_image(product_url)

    # Background: resize to cover and center-crop to exact dimensions
    src_w, src_h = bg_image.size
    scale = max(width / src_w, height / src_h)
    new_w = int(src_w * scale)
    new_h = int(src_h * scale)
    bg_image = bg_image.resize((new_w, new_h), Image.Resampling.LANCZOS)
    crop_x = (new_w - width) // 2
    crop_y = (new_h - height) // 2
    bg_image = bg_image.crop((crop_x, crop_y, crop_x + width, crop_y + height))
    bg_image = bg_image.convert('RGB')
    final_image = bg_image.copy()

    # Product: remove white background, then fit inside ~60% of canvas and center
    product_rgba = remove_white_background(product_image)
    pw, ph = product_rgba.size
    if pw == 0 or ph == 0:
        sys.stderr.write("  WARNING: Product image empty after background removal\n")
        final_image.save(output_path, 'PNG', quality=95)
        return output_path

    max_side = int(min(width, height) * 0.6)
    scale_p = min(max_side / pw, max_side / ph, 1.0)
    new_pw = max(1, int(pw * scale_p))
    new_ph = max(1, int(ph * scale_p))
    product_rgba = product_rgba.resize((new_pw, new_ph), Image.Resampling.LANCZOS)
    paste_x = (width - new_pw) // 2
    paste_y = (height - new_ph) // 2

    final_rgba = final_image.convert('RGBA')
    product_layer = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    product_layer.paste(product_rgba, (paste_x, paste_y), product_rgba)
    out = Image.alpha_composite(final_rgba, product_layer).convert('RGB')
    out.save(output_path, 'PNG', quality=95)
    sys.stderr.write(f"  ✅ Superimposed product ({new_pw}x{new_ph}) on background {width}x{height}\n")
    return output_path


if __name__ == '__main__':
    # Read input from stdin (JSON)
    try:
        input_data = json.loads(sys.stdin.read())
    except json.JSONDecodeError as e:
        print(json.dumps({'success': False, 'error': f'Invalid JSON input: {e}'}))
        sys.exit(1)

    import os as _os
    output_path = input_data.get('output_path', '/tmp/final_asset.png')
    output_path = _os.path.abspath(output_path)
    if not output_path.startswith('/tmp/'):
        raise ValueError(f"output_path must be within /tmp/, got: {output_path}")
    width = input_data.get('width', 1080)
    height = input_data.get('height', 1080)

    if input_data.get('mode') == 'superimpose':
        # Remove product background and paste on scene (no AI merge)
        result_path = superimpose_product_on_background(
            background_url=input_data['background_url'],
            product_url=input_data['product_url'],
            output_path=output_path,
            width=width,
            height=height,
        )
    else:
        template_data = input_data['template_data']
        composite_url = input_data['composite_url']
        copy_text = input_data['copy_text']
        logo_url = input_data.get('logo_url')
        result_path = composite_final_asset(
            template_data=template_data,
            composite_url=composite_url,
            copy_text=copy_text,
            logo_url=logo_url,
            output_path=output_path,
            width=width,
            height=height,
        )

    # Output result as JSON on stdout (only this line goes to stdout)
    print(json.dumps({'success': True, 'output_path': result_path}))
