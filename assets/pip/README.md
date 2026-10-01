# Pip — phase 1 static model

Start with [the three-view review](previews/pip-review.png) and
[the reference comparison](previews/pip-reference-comparison.png).

The editable source is **[pip-static.blend](pip-static.blend)**, authored with
Blender 5.0.1. This is a static model for visual approval, not the final runtime
asset. No rig, actions, animation, shape keys, GLB, or app integration is included.

## Revision 02 — silhouette review

This iteration lowers the body by about 8%, increases its frontal width by 7%
and its front-to-back length by 9%. A fuller lower profile eases into a softly
flattened underside, with a subtle forward crown bias. The eyes are about 15%
smaller. Feet are roughly 15% smaller, with their roots tucked into the fuller
belly and only small rounded toes exposed. No new character features were added.

Cameras, orthographic scale, materials, and lighting are unchanged so the
geometry difference can be judged directly. The prior source, generator, and
review boards are preserved in [revisions/01-static](revisions/01-static/).
The current static character remains pending approval.

## Reference

The canonical supplied image exists in this checkout as
`public/references/pip-character-reference.png`. The requested
`public/references/pip-character-sheet.png` does not exist. The existing image
matches the attachment and was used without modification.

The primary shape target is the top-left IDLE character, supported by the
bottom-right front, side, and foot details. Width, lower-body fullness, crown
offset, eye size/height, and tucked toe shapes were adjusted across actual 3D
render iterations. The comparison board fits both characters to equal total
silhouette height, including feet; reference crops are only enlarged, not
repainted. Reference presentation effects are visible only in those source crops.

The sheet's views are illustrative and oblique rather than dimensioned
orthographic turnarounds. Hidden depth is inferred. The side preview is a true
profile, so it naturally shows only the nearer eye and overlapping feet.

## Source structure

- **Pip | Static asset**: only the `PIP | Character only` collection.
- **Pip | Preview studio**: the same character collection, plus three cameras
  and three area lights. The file opens in this scene for inspection.
- **Character**: body, two eyes, two feet. No ground plane, background mesh,
  shadow mesh, trails, dust, mouth, arms, or extra decoration.

Mesh names are `Pip.Body`, `Pip.Eye.L`, `Pip.Eye.R`, `Pip.Foot.L`, and
`Pip.Foot.R`. X is lateral, -Y is forward, and Z is up. Feet share a Z≈0
baseline. Geometry is approximately 1.74 Blender units high; runtime scale can
be decided in a later phase. Object transforms are identity.

The body has an editable quad-loop cage with a single unapplied Catmull-Clark
subdivision level. The other meshes use smooth closed surfaces. Each shell is
manifold with outward normals; both base and evaluated geometry are checked for
finite coordinates, closed topology, and degenerate faces. Feet intersect the underside at their hidden
roots; the shallow eye meshes are embedded in the face. These parts remain
separate for later work.

The model uses **3,026 control vertices** and **12,672 rendered triangles**,
with **two Principled materials** and **no image textures**. Body and feet
share warm ivory with a matte finish; eyes use near-black with restrained
reflection. There are no painted highlights, shadows, or colored soles.
See [validation.json](validation.json) for the per-mesh counts.

## Previews

All individual views are 1200 × 1200 PNGs rendered with Cycles, 96 samples,
denoising, orthographic cameras, neutral area lights, and AgX color management.
The shallow elevation on the three-quarter camera is for comparison to IDLE.

| View | Neutral background | Transparent background |
| --- | --- | --- |
| Side | [Preview](previews/pip-side-neutral.png) | [RGBA](previews/pip-side.png) |
| Front | [Preview](previews/pip-front-neutral.png) | [RGBA](previews/pip-front.png) |
| Three-quarter | [Preview](previews/pip-three-quarter-neutral.png) | [RGBA](previews/pip-three-quarter.png) |

The neutral background is composited solely for review. The character itself
has no background or ground. Camera lighting is a review setup and is not part
of the character collection.

## Rebuild

From the project root in PowerShell:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.0\blender.exe' --background --factory-startup --python assets/pip/build_static.py -- --quality final
powershell -NoProfile -ExecutionPolicy Bypass -File assets/pip/make_review.ps1
```

The first command replaces the generated `.blend`, transparent renders, and
validation report. Use `--quality draft` for 640px / 24-sample iteration.
The second command creates neutral copies and review boards using Windows
System.Drawing; it does not modify the reference or source render images.
Both scripts write only within `assets/pip/`. Rebuilding replaces manual changes
to the generated `.blend`, so save hand-edited variants separately.

Work intentionally stops here pending static-model approval. The eventual
`public/models/pip.glb` has not been created.
