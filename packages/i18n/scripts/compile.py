#!/usr/bin/env python3
"""Validate real GNU gettext catalogs, then emit deterministic browser-safe JSON."""
import argparse
import gettext
import json
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--catalog-dir', type=Path, default=ROOT / 'locales' / 'de')
parser.add_argument('--output', type=Path, default=ROOT / 'compiled' / 'de.json')
parser.add_argument('--check', action='store_true')
args = parser.parse_args()
merged, owners = {}, {}
placeholders = lambda value: set(re.findall(r'\{([A-Za-z_][A-Za-z0-9_]*)\}', value))
files = sorted(args.catalog_dir.glob('*.po'))
if not files:
    raise SystemExit('No German PO catalogs found.')
with tempfile.TemporaryDirectory(prefix='webdock-gettext-') as temp:
    for index, source in enumerate(files):
        binary = Path(temp) / f'{index}.mo'
        subprocess.run(['msgfmt', '--check', '--check-format', '-o', str(binary), str(source)], check=True)
        with binary.open('rb') as handle:
            parsed = gettext.GNUTranslations(handle)
        metadata = parsed.info()
        if metadata.get('language') != 'de' or re.sub(r'\s+', '', metadata.get('plural-forms', '')) not in ('nplurals=2;plural=(n!=1);', 'nplurals=2;plural=n!=1;'):
            raise SystemExit(f'{source.name}: expected German two-form plural metadata.')
        # Identity translations retain each original plural form, which the
        # translated MO alone does not expose. Include untranslated source IDs
        # as empty entries so the error boundary knows their English fallback.
        empty_po = Path(temp) / f'{index}-empty.po'
        identity_po, identity_mo = Path(temp) / f'{index}-source.po', Path(temp) / f'{index}-source.mo'
        subprocess.run(['msgfilter', '--keep-header', '-i', str(source), '-o', str(empty_po), 'python3', '-c', 'import sys; sys.stdin.read()'], check=True)
        subprocess.run(['msgen', '-o', str(identity_po), str(empty_po)], check=True)
        subprocess.run(['msgfmt', '--use-fuzzy', '-o', str(identity_mo), str(identity_po)], check=True)
        with identity_mo.open('rb') as handle:
            originals = gettext.GNUTranslations(handle)._catalog
        entries = {}
        for key in originals:
            if key == '':
                continue
            message, form = key if isinstance(key, tuple) else (key, 0)
            translations = entries.setdefault(message, [])
            while len(translations) <= form:
                translations.append('')
        # GNUTranslations parses validated MO data; no custom PO parser/eval in JS.
        for key, value in parsed._catalog.items():
            if key == '':
                continue
            message, form = key if isinstance(key, tuple) else (key, 0)
            source_text = originals.get(key, message.split('\x04', 1)[-1])
            if placeholders(source_text) != placeholders(value):
                raise SystemExit(f'{source.name}: placeholder mismatch for {message!r}.')
            translations = entries.setdefault(message, [])
            while len(translations) <= form:
                translations.append('')
            translations[form] = value
        for key, value in entries.items():
            if key in merged:
                previous = merged[key]
                if len(previous) != len(value) or any(a and b and a != b for a, b in zip(previous, value)):
                    raise SystemExit(f'Conflicting translation for {key!r}: {owners[key]} and {source.name}.')
                value = [a or b for a, b in zip(previous, value)]
            merged[key], owners[key] = value, source.name
output = json.dumps(merged, ensure_ascii=False, indent=2, sort_keys=True) + '\n'
if args.check:
    if not args.output.exists() or args.output.read_text() != output:
        raise SystemExit('Compiled catalog is stale. Run the i18n compile command.')
else:
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(output)
print(f'Validated {len(files)} PO catalogs; {len(merged)} messages.')
