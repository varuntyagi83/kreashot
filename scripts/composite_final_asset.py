#!/usr/bin/env python3
"""
Phase 6: Compositing Engine
Combines template, background, product, copy, and logo into final ad creative
"""

import sys
import json
import os
from PIL import Image, ImageDraw, ImageFont
from io import BytesIO
import urllib.request


def download_image(url):
    """Download image from URL and return PIL Image"""
    with urllib.request.urlopen(url) as response:
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
            # Draw text layer
            text_content = copy_text.get(layer.get('name', 'headline'), copy_text.get('generated_text', ''))
            font_size = layer.get('font_size', 24)
            color = layer.get('color', '#000000')
            text_align = layer.get('text_align', 'center')

            font = load_font(font_size)

            # Calculate text position based on alignment
            bbox = draw.textbbox((0, 0), text_content, font=font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]

            if text_align == 'center':
                text_x = x + (lw - text_width) // 2
            elif text_align == 'right':
                text_x = x + lw - text_width
            else:  # left
                text_x = x

            text_y = y + (lh - text_height) // 2

            # Draw background rectangle if specified
            bg_color = layer.get('background_color')
            if bg_color:
                draw.rectangle([x, y, x + lw, y + lh], fill=bg_color)

            # Draw text
            draw.text((text_x, text_y), text_content, fill=color, font=font)
            sys.stderr.write(f"    ✅ Drew text: \"{text_content[:30]}...\"\n")

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

    # Save final composite
    final_image.save(output_path, 'PNG', quality=95)
    sys.stderr.write(f"\n✅ Final asset saved to: {output_path}\n")

    return output_path


if __name__ == '__main__':
    # Read input from stdin (JSON)
    input_data = json.loads(sys.stdin.read())

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
