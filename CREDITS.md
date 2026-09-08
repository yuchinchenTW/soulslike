# Character and animation sources

The playable characters now use imported, textured, skinned meshes and skeletal animation clips.

| In-game use | Original asset | Provider |
| --- | --- | --- |
| Player and boss | Paladin W/Prop — J. Nordstrom | Adobe Mixamo |
| Courtyard sentinels | Knight — D. Pelegrini | Adobe Mixamo |
| Weapons | Paladin sword and shield, adapted for both skeletons | Adobe Mixamo |
| Idle / movement / block / hits / death | Sword And Shield animation series | Adobe Mixamo |
| Three-hit light combo | Sword And Shield Cross Slash; Stable Sword Outward Slash; Sword And Shield Power Slash | Adobe Mixamo |
| Boss dual-sword chains | Dual Weapon Combo, retimed with per-blade contact windows | Adobe Mixamo |
| Heavy attack | Sword And Shield Downward Slash | Adobe Mixamo |
| Roll | Stand To Roll, trimmed and retimed | Adobe Mixamo |
| Healing | Drinking, trimmed and retimed | Adobe Mixamo |

Source provider: https://www.mixamo.com/

Adobe's published FAQ permits characters and animations in personal, commercial and non-profit projects, including video games: https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html

Download/conversion provenance: Linzhan Mou's Mixamo Animations and Characters convenience mirror, https://huggingface.co/datasets/Linzhan/Mixamo-Animations-Characters . The mirror explicitly retains Adobe Mixamo terms; these assets are **not CC0**. Do not redistribute them as a standalone asset library.

Project adaptations: skeleton retargeting, scale normalization, palette and roughness adjustments, mirrored left-hand sword attachment, blade emission masks, skinned robe, crown, phantom materials, root-motion extraction, animation trimming, blending, and combat timing. `tools/build-character-clips.mjs` rebuilds the 16-clip local animation libraries from the downloaded FBX clips and GLB rigs.

The environment, interface, gameplay and synthesized audio are project-created. No Dark Souls models, textures, animations or audio are included.

Three.js is MIT licensed; see `node_modules/three/LICENSE`.
