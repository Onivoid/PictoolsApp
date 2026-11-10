---
version: 1
slug: "src-pages-exif-tsx"
primary_target: "src/pages/Exif.tsx"
related_targets: []
---

# Surface: Exif

Mode: Operate

## Direction contract

THESIS: Postprod rights desk where creator fields lead and bulk-stamp the set without touching per-file camera or GPS, refusing a flat tag spreadsheet.

OWN-WORLD: Quiet Workbench tokens only. System UI type, hairline borders, violet primary CTA, mint for done. No second palette.

STORY: Artist drops a finished set, fills creator/copyright/credit/usage/contact once (optionally from a remembered template), applies rights to all files in place, then may clean GPS or tweak one image.

FIRST VIEWPORT: Header. Stage split retractable media panel + tabbed inspector (Rights first). Rights panel owns bulk CTA. Dock saves the selected file in place; the panel flags files still missing rights.

FORM: Established tool workbench extended with section tabs and a rights-only write mode. Signature interaction: one rights form stamps N files while leaving other Exif intact.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Scope

- Route `/exif`
- Rights bulk mode (`write_exif` mode=rights)
- JPEG, PNG, TIFF, WebP
