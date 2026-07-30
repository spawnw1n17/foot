from pathlib import Path

path = Path('neon-dominion/src/war-room.js')
text = path.read_text()

old_delete = "if (action === 'editor-delete') { this.editor.nodes = this.editor.nodes.filter((node) => node.id !== target.dataset.node); this.editor.selected = null; this.render(); }"
new_delete = "if (action === 'editor-delete') { const id = target.dataset.node; this.editor.nodes = this.editor.nodes.filter((node) => node.id !== id); this.editor.links = this.editor.links.filter((link) => !link.includes(id)); this.editor.selected = null; this.render(); }"
if old_delete not in text:
    raise SystemExit('editor-delete marker not found')
text = text.replace(old_delete, new_delete)

old_id = """    const index = this.editor.nodes.length;
    const prefix = this.editor.owner === 'player' ? 'p' : this.editor.owner === 'red' ? 'r' : this.editor.owner === 'violet' ? 'v' : 'n';
    const id = `${prefix}${index}`;"""
new_id = """    const prefix = this.editor.owner === 'player' ? 'p' : this.editor.owner === 'red' ? 'r' : this.editor.owner === 'violet' ? 'v' : 'n';
    const occupied = new Set(this.editor.nodes.map((node) => node.id));
    let index = 0;
    while (occupied.has(`${prefix}${index}`)) index += 1;
    const id = `${prefix}${index}`;"""
if old_id not in text:
    raise SystemExit('editor id marker not found')
text = text.replace(old_id, new_id)

path.write_text(text)
Path('neon-dominion/tools/apply_full_audit_fixes.py').unlink()
