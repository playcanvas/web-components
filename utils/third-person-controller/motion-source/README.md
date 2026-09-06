# Animation provenance

`quaternius-locomotion.glb` is a reduced, re-exported copy of **Universal Animation Library — Standard**, by Quaternius, downloaded on 5 September 2026. The included mannequin and animation skeleton are only an authoring reference. The runtime Owl Wayfarer geometry is original.

- [Official pack and CC0 license statement](https://quaternius.com/packs/universalanimationlibrary.html)
- [Original free Standard download](https://quaternius.itch.io/universal-animation-library)
- `License.txt` preserves the pack's CC0 notice.
- SHA-256 of this reduced reference: `53a85ded386835611a67ada627a50a9c3521bbfc1142b14edb5e1932740e3259`.

These are authored animation clips; this example does not describe them as motion capture.

| Runtime state | Source clip | Treatment |
| --- | --- | --- |
| Idle | Idle_Loop | In-place, cape secondary motion |
| Walk | Walk_Loop | In-place, playback matched to approximately 0.98 m/s at source rate |
| Run | Jog_Fwd_Loop | In-place, playback matched to approximately 5.36 m/s at source rate |
| JumpStart | Jump_Start | Resampled to approximately 0.33 seconds |
| FallLoop | Jump_Loop | Resampled to approximately 1 second |
| Land | Jump_Land | Resampled to approximately 0.27 seconds |

The retained Sprint_Loop and A_TPose clips are reference material, unused by the runtime graph. The character is built around the source rest skeleton, preserving bone names and parentage. Source actions are baked onto this compatible skeleton, with extra animated mantle bones; no runtime retarget service is required. The Engine controller supplies world translation and jump height.

Walk calibration uses the planted portion of the foot trajectory (`measure_motion.mjs`). Run calibration uses the original root-motion counterpart's approximately 5 m of travel over 0.933 seconds. These are approximate playback calibrations; they do not provide terrain-adaptive foot locking.

To recreate the reduced reference, download/extract the original Standard pack under `output/third-person-controller/animation-source/quaternius/`, then run `prepare_motions.py` through the Blender MCP bridge. Normal character rebuilds only need the compact GLB already in this directory.
