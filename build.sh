#!/bin/bash
set -e
cd "$(dirname "$0")"
rm -rf build dist && mkdir -p build/chrome build/firefox dist

cp -r src/* build/chrome/
cp -r src/* build/firefox/

python3 - <<'PY'
import json, io, collections
p = 'build/firefox/manifest.json'
m = json.load(io.open(p, encoding='utf-8'), object_pairs_hook=collections.OrderedDict)
o = json.load(io.open('firefox.overlay.json', encoding='utf-8'))
m.update(o)
io.open(p, 'w', encoding='utf-8').write(json.dumps(m, indent=2, ensure_ascii=False) + '\n')
print('firefox manifest merged')
PY

find build -name '*.bak*' -delete
(cd build/chrome  && zip -rq ../../dist/sonato-seo-inspector-chrome.zip .)
(cd build/firefox && zip -rq ../../dist/sonato-seo-inspector-firefox.zip .)
ls -la dist
