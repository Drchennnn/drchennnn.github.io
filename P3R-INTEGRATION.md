# P3R theme integration

Target repository: https://github.com/Drchennnn/drchennnn.github.io
Current remote main verified on 2026-11-04: `54ea872884fd6bfe25e01ca94d98c7ec2e2c4800`.
Prepared branch: `feat/p3r-theme-integration`.

## Requested changes

- V3-approved identity, custom LR mark, LINK RELOAD / 青蓝档案, numbered bilingual menu and blue-white P3R-inspired theme.
- No day/night or sunny/rainy selector.
- No dedicated background-video play button. Background defaults to muted inline looping playback. The global motion/accessibility control remains. Reduced motion, saved global pause, data-saving mode and browser autoplay denial retain a still fallback. Playback denial is retried on subsequent click/key interaction without adding a visible button.
- Removes the public-facing preview version label for integration into the actual blog.

## Preservation and tests

Post/photo/toy content, toy demos, CMS/OAuth code, dependency lockfile and existing deployment workflow are unchanged against remote main. All original URLs remain.

Passed: 15-page Astro build; content lifecycle/draft/search/internal-link/iframe tests; P3R controller tests against source and compiled JavaScript; CMS import and OAuth tests; diff whitespace checks; media hash verification. Source review is separate from visual acceptance. No new real-browser layout validation was performed for this revision.

The theme is reconstructed editable source, based on the baseline repository plus the preserved initial preview. This is not a claim that the earlier uncommitted source was recovered verbatim.

## Publication

A push or merge to `main` triggers `.github/workflows/deploy.yml` to build Astro and deploy GitHub Pages at https://drchennnn.github.io/ . The owner approved public deployment including the reference media on 2026-11-04. Public redistribution rights remain unestablished; that approval records the owner’s choice, not a license from ATLUS or SEGA. Verify the exact pushed commit’s workflow and live site, and recheck remote main before any later changes.

New publicly shipped reference media: four ATLUS character images, one official background MP4 and one poster frame derived from that MP4 (about 2.67 MB total). Sources and hashes are in `public/p3r/provenance.json`.

The source notice says ©ATLUS ©SEGA; no public redistribution license has been established. Personal/noncommercial use is not evidence of permission to redistribute these assets. Publishing the theme as currently prepared also publishes those assets in the repository and hosted site. This is a disclosure of the unresolved rights status, not a determination that every use is prohibited. If desired, replace them with original or appropriately licensed assets before public deployment.

## Local preview

Static build: in the directory containing index.html, run `python3 -m http.server 8084 --bind 127.0.0.1`, then open http://127.0.0.1:8084 . Use a new directory rather than overwriting an earlier preview.

Source: Node >=22.12; `npm ci`, `npm run dev`, `npm run build`.
