# Template Safe Zones (Composites)

So that **composites** (product + background) respect your layout, define **safe zones** in the template's `template_data.safe_zones`.

## Structure

Each zone is an object:

- **`id`** — unique string
- **`name`** — display name (e.g. `"Product zone"`, `"Headline area"`)
- **`x`, `y`** — top-left position as **percentage** (0–100) of canvas width/height
- **`width`, `height`** — size as **percentage** (0–100)
- **`type`** — `"safe"` or `"restricted"`

## Rules

1. **Product placement (safe)**  
   At least one zone with `type: "safe"` and a name that contains **"product"** (case-insensitive).  
   The composite generator will place the product entirely within this zone.

2. **Restricted (no product)**  
   Zones with `type: "restricted"` are areas where the product must **not** be placed (e.g. headline, logo, CTA).

## Example

```json
{
  "safe_zones": [
    {
      "id": "product-zone",
      "name": "Product placement",
      "x": 10,
      "y": 20,
      "width": 50,
      "height": 60,
      "type": "safe"
    },
    {
      "id": "headline",
      "name": "Headline area",
      "x": 10,
      "y": 0,
      "width": 80,
      "height": 15,
      "type": "restricted"
    }
  ]
}
```

When generating composites, the API passes these zones to the image model so the product is placed in the safe zone and kept out of restricted areas.
