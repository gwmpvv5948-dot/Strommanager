"""Dependency-free source/package checks (not a Home Assistant runtime test)."""
import ast
import json
from pathlib import Path
import subprocess

root=Path(__file__).resolve().parents[1]
component=root/'custom_components'/'solar_pilot'
for path in component.rglob('*.py'):
    ast.parse(path.read_text(),filename=str(path))
for path in component.rglob('*.json'):
    json.loads(path.read_text())
manifest=json.loads((component/'manifest.json').read_text())
assert manifest['domain']=='solar_pilot' and manifest['config_flow'] is True
strings=json.loads((component/'strings.json').read_text())
translation=json.loads((component/'translations'/'de.json').read_text())
assert strings==translation
for script in (component/'frontend').glob('*.js'):
    subprocess.run(['node','--check',str(script)],check=True)
print('Python syntax, JSON, German translations and JavaScript syntax: OK')
