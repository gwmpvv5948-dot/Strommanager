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
    print('HACS brand files matched:',matched,'files to change:',len(changes))
    if not args.apply:return
    backup=Path('/config/backups')/('hacs-before-strommanager-brand-'+datetime.now().strftime('%Y%m%d-%H%M%S'))
    for p,data in changes.items():
        target=backup/p.relative_to(root);target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,target)
    for p,data in changes.items():p.write_bytes(data)
    print('APPLIED · backup:',backup)


if __name__=='__main__':main()
