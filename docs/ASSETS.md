# Character assets

## Sources

- Quaternius, **Universal Base Characters — Standard**, `Superhero_Male_FullBody` (Godot / UE glTF): https://quaternius.com/packs/universalbasecharacters.html
- Quaternius, **Universal Animation Library — Standard**, non-root-motion GLB, `Idle_Loop`, `Jog_Fwd_Loop`, `Sprint_Loop`: https://quaternius.com/packs/universalanimationlibrary.html

Both downloaded Standard archives explicitly include **CC0 1.0 Universal** license notices. The original notices are preserved in `docs/licenses/`. The final derivative model at `public/models/runner.glb` retains CC0. No Mixamo asset is included.

## Changes

Removed eye / eyebrow meshes and all textures. Flattened facial relief onto a smooth ellipsoidal head while retaining the skinned neck connection. Replaced materials with plain matte white. Retargeted the three animation clips to the base skeleton using Three.js SkeletonUtils, preserving bone lengths. Removed horizontal hip displacement so world motion remains controlled by gameplay. Exported only the body and selected clips (~896 KB).

Runtime scaling makes the figure slimmer and taller. A 180-degree Y rotation makes the chest face the course (-Z); the chase camera sees the back. Idle, jog, and sprint are blended by gameplay state and speed. The GLB is bundled locally, so play does not depend on the original asset service.

## Rebuilding

`scripts/build-runner.mjs` takes a texture-free base GLB and the official non-root-motion UAL GLB, applies the facial edit, retargets clips, and exports the final file. Requires the project's installed Three.js dependency. The original downloaded archives are not included in the repository.

The base input must retain the original humanoid rig and body skin, exclude eye/eyebrow scene nodes, replace materials with a plain texture-free material, and embed the original `.bin` as a GLB binary chunk. All source pack images, hairstyles, and unused animation clips are omitted.

Example after downloading both official Standard packs and extracting the UAL non-RM GLB:

```sh
python3 scripts/prepare-base.py base-standard.zip base-clean.glb
node scripts/build-runner.mjs base-clean.glb UAL1_Standard.glb public/models/runner.glb
```
