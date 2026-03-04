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


def load_font(font_size):
    """Load a font, trying multiple cross-platform paths before falling back."""
    candidates = [
        # Linux (common server environments)
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
        "/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf",
        # macOS
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial.ttf",
        # Windows
        "C:\\Windows\\Fonts\\arial.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, font_size)
            except Exception:
                continue
    # Last-resort default (tiny bitmap — acceptable as a safety net only)
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

            font = load_font(font_size)

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
            else:  # contain
                img.thumbnail((lw, lh), Image.Resampling.LANCZOS)

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
