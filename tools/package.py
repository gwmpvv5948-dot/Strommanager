"""Build a deterministic installable ZIP without private runtime files."""
from pathlib import Path
import json
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

root=Path(__file__).resolve().parents[1]
version=json.loads((root/'custom_components'/'solar_pilot'/'manifest.json').read_text())['version']
out=root/'dist'/f'strommanager-{version}.zip'
out.parent.mkdir(exist_ok=True)
files=list((root/'custom_components'/'solar_pilot').rglob('*'))+[root/'README.md',root/'docs'/'ARCHITECTURE.md']
with ZipFile(out,'w',ZIP_DEFLATED) as archive:
    for path in sorted(files):
        if not path.is_file() or '__pycache__' in path.parts or path.suffix=='.pyc': continue
        item=ZipInfo(str(path.relative_to(root)),date_time=(2026,10,27,0,0,0))
        item.compress_type=ZIP_DEFLATED
        item.external_attr=0o100644 << 16
        archive.writestr(item,path.read_bytes())
print(out)
