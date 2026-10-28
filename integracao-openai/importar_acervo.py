#!/usr/bin/env python3
"""Extrai somente os 19 Markdown originais e SKILL.md do ZIP privado para uma pasta local.
Não publica conteúdos no GitHub nem faz upload para qualquer serviço.
"""
import hashlib
import json
import pathlib
import re
import sys
import zipfile

if len(sys.argv) != 3:
    raise SystemExit('Uso: python3 importar_acervo.py /caminho/plugin-privado.zip /pasta/privada')
zip_path = pathlib.Path(sys.argv[1]); target = pathlib.Path(sys.argv[2]); target.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(zip_path) as arc:
    names = arc.namelist()
    originals = [n for n in names if '/references/biblioteca/originais/' in n and re.search(r'/(?:FONTES_EXTRAIDAS_\d{2}|OCR_NAO_VERIFICADO_\d{2}|01_CATALOGO_E_LIMITES)\.md$', n)]
    skills = [n for n in names if n.endswith('/skills/diagnostico-automotivo/SKILL.md')]
    if len(originals) != 19 or len(skills) != 1:
        raise SystemExit(f'Pacote incompatível: originais={len(originals)}, Skills={len(skills)}; nada importado')
    result = {}
    for name in originals + skills:
        destname = 'SKILL.md' if name == skills[0] else pathlib.PurePosixPath(name).name
        data = arc.read(name)
        if destname != 'SKILL.md' and not data.startswith(b'#'):
            raise SystemExit(f'Conteúdo incompatível: {destname}')
        (target / destname).write_bytes(data)
        result[destname] = hashlib.sha256(data).hexdigest()
    (target/'hashes_importados.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(f'{len(originals)} arquivos + Skill extraídos para {target}. Arquivos permanecem PRIVADOS.')
