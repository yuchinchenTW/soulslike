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

The environment geometry, interface, gameplay and synthesized audio are project-created. Environment surfaces and sky use CC0 assets from Poly Haven (https://polyhaven.com/license): castle_wall_slates, large_grey_tiles and rock_wall_10 textures (1K diffuse, normal, ARM) and the qwantani_dusk_2_puresky HDRI (1K), plus the scanned models rock_09, rock_07, stone_fire_pit and grass_medium_02 (1K glTF) used for rubble, the bonfire ring and grass tufts. They are projected in world space by `src/surfaces.js`. No Dark Souls models, textures, animations or audio are included.

Three.js is MIT licensed; see `node_modules/three/LICENSE`.
