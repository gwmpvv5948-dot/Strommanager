"""Opt-in HACS 2.0.5 compatibility fix for Strommanager's local brand image.

Run on HA: python3 fix_hacs_brand.py --apply
Backs up every changed file; does not alter other domains or HACS update behavior.
HACS releases may overwrite this compatibility fix. Not needed by Marketplace.
"""
import argparse
import ast
from datetime import datetime
import gzip
from pathlib import Path
import re
import shutil

IMAGE = '/solar_pilot_frontend/strommanager-icon.png'
PATTERN = re.compile(r'([a-zA-Z_$][\w$]*)=>(`https://brands\.home-assistant\.io/[^`]+?\.png`)')


def fix_js(source):
    return PATTERN.sub(lambda m: m[1]+'=>'+m[1]+'.domain==="solar_pilot"?"'+IMAGE+'":'+m[2],source)


def fix_update(source):
    original = '        return f"https://brands.home-assistant.io/_/{self.repository.data.domain}/icon.png"'
    if 'self.repository.data.domain == "solar_pilot"' in source:
        return source
    if source.count(original)!=1:
        raise ValueError('Unsupported HACS update.py; no changes applied')
    result=source.replace(original,'        if self.repository.data.domain == "solar_pilot":\n            return "'+IMAGE+'"\n'+original)
    ast.parse(result)
    return result


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',default='/config/custom_components/hacs')
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args();root=Path(args.root)
    changes={};p=root/'update.py';s=p.read_text();t=fix_update(s)
    if t!=s:changes[p]=t.encode()
    matched=0
    for p in (root/'hacs_frontend').rglob('*.js'):
        s=p.read_text()
        if '.domain==="solar_pilot"?"'+IMAGE+'"' in s:
            matched+=1;continue
        t=fix_js(s)
        if t!=s:
            matched+=1;changes[p]=t.encode()
            zipped=Path(str(p)+'.gz')
            if zipped.exists():changes[zipped]=gzip.compress(t.encode(),mtime=0)
            if Path(str(p)+'.br').exists():
                raise ValueError('Brotli asset detected; no changes applied')
    if not matched:raise ValueError('HACS frontend brand function not found; no changes applied')
    # HACS serves immutable chunk names. Give the patched frontend a separate
    # directory, so browsers do not reuse cached JavaScript from before the fix.
    front=root/'hacs_frontend'
    replacements={name:name+'_strommanager1' for name in ('frontend_latest','frontend_es5')}
    for name,target_name in replacements.items():
        source=front/name;target=front/target_name
        if target.exists():continue
        for original in source.rglob('*'):
            if not original.is_file():continue
            relative=original.relative_to(source);dest=target/relative
            if original.name.endswith('.js.gz'):continue
            data=changes.get(original,original.read_bytes())
            if original.suffix=='.js':
                text=data.decode()
                for old,new in replacements.items():text=text.replace(old+'/',new+'/')
                data=text.encode()
                if Path(str(original)+'.gz').exists():changes[Path(str(dest)+'.gz')]=gzip.compress(data,mtime=0)
            changes[dest]=data
    entry=front/'entrypoint.js';text=entry.read_text()
    for old,new in replacements.items():text=text.replace(old+'/',new+'/')
    if text!=entry.read_text():
        changes[entry]=text.encode()
        if Path(str(entry)+'.gz').exists():changes[Path(str(entry)+'.gz')]=gzip.compress(text.encode(),mtime=0)
    version=front/'version.py';text=version.read_text()
    if 'strommanager1' not in text:
        text=re.sub(r'(VERSION\s*=\s*["\'])([^"\']+)',r'\1\2-strommanager1',text)
        ast.parse(text);changes[version]=text.encode()
    print('HACS brand files matched:',matched,'files to change:',len(changes))
    if not args.apply:return
    backup=Path('/config/backups')/('hacs-before-strommanager-brand-'+datetime.now().strftime('%Y%m%d-%H%M%S'))
    for p,data in changes.items():
        if p.exists():
            target=backup/p.relative_to(root);target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,target)
    for p,data in changes.items():
        p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
    print('APPLIED · backup:',backup)


if __name__=='__main__':main()
