# Exports the SYSTEM MB sound system model to the glTF the Sound System
# visualizer theme loads (src/visualizer/assets/system-mb.glb).
#
#   blender -b path/to/SYSTEM_MB.blend --python scripts/blender/export-system-mb.py -- src/visualizer/assets/system-mb.glb
#
# The .blend is a SketchUp import: only 8 meshes are visible (the rest are
# hidden import leftovers), with ~40 duplicate copies of the same wood
# material/texture and generic names. This collapses materials to one per
# surface kind (wood / black / grille) — the theme looks them up by name —
# and names the parts the theme animates: bin_1..4 (left→right), top_1..2
# and horns_1..2 (bottom→top).
import bpy, sys
out = sys.argv[sys.argv.index('--')+1]
visible = [o for o in bpy.context.view_layer.objects if o.type == 'MESH' and o.visible_get()]
print("visible meshes:", len(visible))

# One material per surface kind (the SketchUp import made ~40 copies of the
# same wood material/texture, and a copy of everything for the 2nd top box).
def first(prefix):
    return next(m for m in bpy.data.materials if m.name.startswith(prefix))
wood = first('[Wood_Lumber_ButtJoined]'); wood.name = 'wood'
black = first('[Color_007]'); black.name = 'black'
grille = first('[Fencing_Diamond_Mesh]'); grille.name = 'grille'
canon = {'[Wood_Lumber_ButtJoined]': wood, '[Color_007]': black, '[Fencing_Diamond_Mesh]': grille}
for o in visible:
    for slot in o.material_slots:
        if not slot.material: continue
        for prefix, mat in canon.items():
            if slot.material.name.startswith(prefix): slot.material = mat

# Meaningful names: bins left→right, top boxes / horn columns bottom→top.
def centre(o):
    return sum((o.matrix_world @ v.co for v in o.data.vertices), start=o.location * 0) / len(o.data.vertices)
bins = sorted([o for o in visible if o.name.startswith('C-Component#176')], key=lambda o: centre(o).x)
tops = sorted([o for o in visible if o.name.startswith('C-Component#216')], key=lambda o: centre(o).z)
horns = sorted([o for o in visible if 'G-Object.118' in o.name], key=lambda o: centre(o).z)
for i, o in enumerate(bins): o.name = f'bin_{i + 1}'
for i, o in enumerate(tops): o.name = f'top_{i + 1}'
for i, o in enumerate(horns): o.name = f'horns_{i + 1}'
others = [o.name for o in visible if o not in bins + tops + horns]
print("unclassified visible:", others)

# SketchUp exports often have faces pointing inward; Blender's preview
# draws both sides so it doesn't show, but three.js culls back faces.
import bmesh
for o in visible:
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()

bpy.ops.object.select_all(action='DESELECT')
for o in visible: o.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
    export_image_format='JPEG', export_jpeg_quality=85, export_materials='EXPORT', export_cameras=False, export_lights=False,
)
