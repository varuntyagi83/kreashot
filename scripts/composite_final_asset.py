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
from PIL import Image, ImageDraw, ImageFont
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
    if url.startswith('data:'):
        # Parse data URI: data:[<mediatype>][;base64],<data>
        header, data = url.split(',', 1)
        image_bytes = base64.b64decode(data)
        return Image.open(BytesIO(image_bytes))

    with urllib.request.urlopen(url, timeout=30, context=_ssl_ctx) as response:
        return Image.open(BytesIO(response.read()))


_font_cache = {}


def download_font(url):
    """Download a font file from URL to /tmp/ and return the local path.
    Results are cached so the same font URL is only downloaded once per run."""
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
    with urllib.request.urlopen(url, timeout=30, context=_ssl_ctx) as response:
        font_bytes = response.read()
    with open(local_path, 'wb') as f:
        f.write(font_bytes)

    _font_cache[url] = local_path
    sys.stderr.write(f"  Font saved to {local_path} ({len(font_bytes)} bytes)\n")
    return local_path


def load_font(font_size, font_url=None):
    """Load a font. If font_url is provided, download and use that custom font.
    Otherwise try multiple cross-platform system paths before falling back."""
    if font_url:
        try:
            local_path = download_font(font_url)
            return ImageFont.truetype(local_path, font_size)
        except Exception as e:
            sys.stderr.write(f"WARNING: Failed to load custom font from {font_url}: {e}\n")

    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
        "/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial.ttf",
        "C:\\Windows\\Fonts\\arial.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, font_size)
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
    Composite final ad asset using template

    Args:
        template_data: Template JSON with layers and safe zones
        composite_url: URL to background/composite image
        copy_text: Text content for text layers
        logo_url: Optional URL to logo image
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
            # Paste background/composite
            bg_image = download_image(composite_url)
            bg_image = bg_image.resize((canvas_width, canvas_height), Image.Resampling.LANCZOS)
            final_image.paste(bg_image, (0, 0))
            sys.stderr.write("    ✅ Pasted background\n")

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

            font = load_font(font_size, font_url=layer.get('font_url'))

            # Wrap text to fit within layer width
            # Estimate chars per line: avg glyph width ≈ font_size * 0.55
            avg_char_width = max(1, font_size * 0.55)
            max_chars = max(10, int(lw / avg_char_width))
            lines = textwrap.wrap(text_content, width=max_chars) or [text_content]
            wrapped_text = '\n'.join(lines)

            # Measure total wrapped text block height
            bbox = draw.multiline_textbbox((0, 0), wrapped_text, font=font, spacing=line_spacing)
            block_width = bbox[2] - bbox[0]
            block_height = bbox[3] - bbox[1]

            # Horizontal alignment
            if text_align == 'center':
                text_x = x + (lw - block_width) // 2
            elif text_align == 'right':
                text_x = x + lw - block_width
            else:  # left
                text_x = x

            # Vertically center within the layer
            text_y = y + max(0, (lh - block_height) // 2)

            # Draw background rectangle if specified
            bg_color = layer.get('background_color')
            if bg_color:
                draw.rectangle([x, y, x + lw, y + lh], fill=bg_color)

            # Draw wrapped text
            draw.multiline_text(
                (text_x, text_y),
                wrapped_text,
                fill=color,
                font=font,
                spacing=line_spacing,
                align=text_align,
            )
            sys.stderr.write(f"    ✅ Drew text ({len(lines)} lines): \"{text_content[:40]}...\"\n")

        elif layer_type == 'logo' and logo_url:
            # Paste logo
            logo_image = download_image(logo_url)
            logo_image = logo_image.resize((lw, lh), Image.Resampling.LANCZOS)

            # Handle transparency
            if logo_image.mode == 'RGBA':
                final_image.paste(logo_image, (x, y), logo_image)
            else:
                final_image.paste(logo_image, (x, y))

            sys.stderr.write("    ✅ Pasted logo\n")

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

            # Paste using alpha channel as mask so transparency is preserved
            final_image.paste(overlay_image, (x, y), overlay_image)
            sys.stderr.write(f"    ✅ Pasted graphic overlay\n")

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


if __name__ == '__main__':
    # Read input from stdin (JSON)
    try:
        input_data = json.loads(sys.stdin.read())
    except json.JSONDecodeError as e:
        print(json.dumps({'success': False, 'error': f'Invalid JSON input: {e}'}))
        sys.exit(1)

    template_data = input_data['template_data']
    composite_url = input_data['composite_url']
    copy_text = input_data['copy_text']
    logo_url = input_data.get('logo_url')
    output_path = input_data.get('output_path', '/tmp/final_asset.png')
    width = input_data.get('width', 1080)
    height = input_data.get('height', 1080)

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
