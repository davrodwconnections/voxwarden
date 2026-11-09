# Voxwarden: private release preparation

Maintainer: David Rodriguez (`davrodwconnections`). Source and future releases belong to `davrodwconnections/voxwarden`. Keep the repository private until David authorizes publication. No CurseForge upload, public release or promotion is authorized by the rebranding task.

## Identity and provenance

`plugins/wow/identity.json` defines the separate Voxwarden application ID, product name, key-store service, capture helper and installer GUID. The update destination is David's repository. No upstream installer should be offered as a Voxwarden download. MIT code attribution remains in LICENSE and CREDITS.md; the artwork is Voxwarden's original mark.

## Existing local data

Quit WoW, the desktop apps, source core and voice server first. `tools/migrate-voxwarden.mjs` previews by default and requires explicit absolute paths. With `--apply`, it copies selected preferences, history and the brain to a new data folder, copies saved-variable files under the new addon name, and moves the old addon into a backup outside AddOns. It refuses existing destinations and overlapping or linked paths. Original data and saved-variable files remain available. It never copies the OS credential store; API users reconnect their own keys in the new desktop app.

```powershell
node tools/migrate-voxwarden.mjs --wow "C:\Program Files (x86)\World of Warcraft\_forever_" --from-data "$env:APPDATA\NeverQuestAlone\dev" --to-data "$env:APPDATA\Voxwarden\dev" --backup "$env:APPDATA\Voxwarden\migration-backup"
```

Review the plan, then run the same command with `--apply`. Install the addon only with WoW fully closed. Never load the old and new addons together: their saved-variable and transport identifiers intentionally remain compatible.

David's existing development key file can remain at its private legacy path; it is never part of a release. A development run may use an already staged local capture helper. A distributable installer must build and validate Voxwarden's own helper and signing setup; the previously installed upstream binary is not a Voxwarden release artifact.

## Before a public release

- Complete the end-to-end game test of written chat, model selection, voice, data and map pins.
- Build and test the desktop installer and capture helper under Voxwarden's own identity on each supported platform. The packaging configuration includes tools/brain, tools/voice, the subscription proxy and both runtime packs; this does not itself prove those features launch in a packaged app.
- Validate code signing, notarization where applicable, and the independent updater. Never use upstream signing identity or verification pins as a claim that David's release is theirs.
- Audit the exact ZIP/installer: licenses and credits present; no personal databases, SavedVariables, keys or history; no other addons' databases; no inherited excluded artwork.
- Before making the repository public, audit its retained Git history for inherited excluded artwork. Obtain permission or prepare a clean public source history while preserving code attribution; do not rewrite the current private history without David's explicit choice.
- Confirm current CurseForge submission and World of Warcraft addon rules against the final distribution. A name search is not trademark clearance, and tests do not establish platform approval.
- Prepare original screenshots, description and project icon. The original square PNG is branding/voxwarden.png; do not reuse upstream screenshots.
- Only after David authorizes publication: make the chosen release public and submit its actual artifacts. No synthetic downloads, claims of approval or hidden account requirements.
