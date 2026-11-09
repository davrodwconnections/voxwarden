# Voxwarden brand

Owner and maintainer: David Rodriguez (`davrodwconnections`). Tagline: **Your voice. Your adventure.**

The mark combines a guardian shield, a V and voice arcs. Its original geometric construction is recorded in `tools/brand-assets.py` and `voxwarden.svg`. It does not incorporate the upstream skull, portraits, logos, screenshots or Blizzard artwork. The palette is midnight navy `#101a2c`, teal `#5cdbc5` and amber `#ffc76d`.

Generated PNG, TGA, ICO and ICNS files are committed, with their hashes in `assets.sha256.json`. Regenerate them using Python and Pillow, already present in the development environment:

```powershell
python tools/brand-assets.py
node app/desktop/scripts/make-icons.mjs --check
```

The Voxwarden name and original brand assets are reserved for David's distribution. The repository's MIT license covers code; it does not grant use of the Voxwarden brand to imply endorsement of another distribution. This is an ownership and usage notice, not a claim that a trademark has been registered.
