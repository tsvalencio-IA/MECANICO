#!/usr/bin/env python3
import argparse, gzip, json, math, re, unicodedata, zlib
from collections import Counter, defaultdict
from pathlib import Path

TOKEN_RE=re.compile(r"[a-z0-9][a-z0-9._-]{2,31}")
DTC_RE=re.compile(r"\b(?:P|B|C|U)\d{4}\b|\bDF\d{3,4}\b",re.I)
STOP={
"para","com","sem","que","uma","uns","das","dos","de","da","do","em","no","na","nos","nas","por","pra","pro",
"carro","veiculo","veículo","motor","quero","como","qual","quais","esta","está","este","essa","esse","isso","aqui",
"mais","menos","muito","muita","muitos","muitas","ser","ter","tem","foi","sao","são","the","and","for","with","from",
"this","that","into","not","are","has","have","you","your","page","pagina","página","manual","treinamento"
}
MAX_TERMS_PER_RECORD=170
MAX_POSTINGS_PER_TERM=160
RECORD_BUCKETS=64
TEXT_PREVIEW=2600

def norm(s):
    s=unicodedata.normalize("NFD",str(s or ""))
    s="".join(ch for ch in s if unicodedata.category(ch)!="Mn")
    return s.lower()

def tokens(text):
    return set(t for t in TOKEN_RE.findall(norm(text)) if t not in STOP and not t.isdigit())

def read_records(knowledge):
    manifest=json.loads((knowledge/"manifest.json").read_text(encoding="utf-8"))
    recs=[]
    for shard in manifest.get("shards",[]):
        p=knowledge/"brain"/shard["file"]
        with gzip.open(p,"rt",encoding="utf-8",errors="ignore") as f:
            for line in f:
                line=line.strip()
                if not line: continue
                try: r=json.loads(line)
                except Exception: continue
                if not r.get("text"): continue
                recs.append(r)
    return manifest,recs

def record_bucket(path):
    return zlib.crc32(str(path or "").encode("utf-8")) % RECORD_BUCKETS

def compact_record(idx,r):
    text=" ".join(str(r.get("text","")).split())
    truth=r.get("truth_status") or ("source_extracted" if (r.get("confidence") or 0)>=0.99 else "ocr_unverified")
    return {
        "id":idx,
        "path":r.get("path",""),
        "page":r.get("page"),
        "chunk":r.get("chunk"),
        "text":text[:TEXT_PREVIEW],
        "method":r.get("method"),
        "confidence":round(float(r.get("confidence") or 0),4),
        "truth_status":truth,
        "sha256":r.get("sha256","")
    }

def prefix(term):
    t=re.sub(r"[^a-z0-9]","",term)
    if len(t)>=2: return t[:2]
    if len(t)==1: return t+"0"
    return "__"

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--knowledge-dir",required=True)
    ap.add_argument("--out",required=True)
    args=ap.parse_args()
    knowledge=Path(args.knowledge_dir)
    out=Path(args.out)
    out.mkdir(parents=True,exist_ok=True)

    source_manifest,recs=read_records(knowledge)
    print("records",len(recs),flush=True)

    dfs=Counter()
    record_terms=[]
    for r in recs:
        path_terms=tokens(r.get("path",""))
        text_terms=tokens(r.get("text",""))
        ts=path_terms|text_terms
        record_terms.append((path_terms,text_terms))
        dfs.update(ts)

    n=max(1,len(recs))
    postings=defaultdict(list)
    dtc_postings=defaultdict(list)
    buckets=[{} for _ in range(RECORD_BUCKETS)]
    record_map=[0]*len(recs)

    for idx,r in enumerate(recs):
        path_terms,text_terms=record_terms[idx]
        codes={c.upper() for c in DTC_RE.findall(str(r.get("text",""))+" "+str(r.get("path","")))}
        scored=[]
        for t in (path_terms|text_terms):
            df=dfs[t]
            if df<1 or df>max(4500,int(n*.35)): continue
            idf=math.log((n+1)/(df+1))+1.0
            bonus=2.5 if t in path_terms else 0.0
            if re.fullmatch(r"(?:p|b|c|u)\d{4}|df\d{3,4}",t): bonus+=8
            if any(ch.isdigit() for ch in t): bonus+=1.5
            scored.append((idf+bonus,t))
        scored.sort(reverse=True)
        selected=[t for _,t in scored[:MAX_TERMS_PER_RECORD]]

        b=record_bucket(r.get("path",""))
        record_map[idx]=b
        buckets[b][str(idx)]=compact_record(idx,r)

        for t in selected:
            arr=postings[t]
            if len(arr)<MAX_POSTINGS_PER_TERM: arr.append(idx)
        for code in codes:
            arr=dtc_postings[code]
            if len(arr)<500: arr.append(idx)

        if idx and idx%2500==0:
            print("indexed",idx,"/",n,flush=True)

    records_dir=out/"records";records_dir.mkdir(exist_ok=True)
    for b,data in enumerate(buckets):
        (records_dir/f"r{b:02d}.json").write_text(json.dumps(data,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    (out/"record-map.json").write_text(json.dumps(record_map,separators=(",",":")),encoding="utf-8")

    by_prefix=defaultdict(dict)
    for term,ids in postings.items():
        by_prefix[prefix(term)][term]=ids
    terms_dir=out/"terms";terms_dir.mkdir(exist_ok=True)
    for pre,data in by_prefix.items():
        (terms_dir/f"{pre}.json").write_text(json.dumps(data,ensure_ascii=False,separators=(",",":")),encoding="utf-8")

    dtc_dir=out/"dtc";dtc_dir.mkdir(exist_ok=True)
    for code,ids in dtc_postings.items():
        (dtc_dir/f"{code}.json").write_text(json.dumps(ids,separators=(",",":")),encoding="utf-8")

    truth_counts=Counter((r.get("truth_status") or "unknown") for r in recs)
    manifest={
        "schema_version":1,
        "mode":"compact-lexical",
        "source_archive":source_manifest.get("archive"),
        "source_archive_sha256":source_manifest.get("archive_sha256"),
        "source_schema_version":source_manifest.get("schema_version"),
        "records":len(recs),
        "record_buckets":RECORD_BUCKETS,
        "term_files":len(by_prefix),
        "terms":len(postings),
        "dtcs":len(dtc_postings),
        "text_preview_chars":TEXT_PREVIEW,
        "truth_counts":dict(truth_counts),
        "truth_policy":source_manifest.get("truth_policy",{}),
        "heavy_shards_required_by_client":False
    }
    (out/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf-8")
    (out/"README.md").write_text(
        "# thIAguinho Compact Knowledge\n\n"
        "Indice lexical compacto gerado automaticamente a partir do branch knowledge.\n"
        "O aplicativo consulta apenas termos, DTCs e pequenos buckets de evidencias; nao baixa os shards pesados.\n"
        "Cada evidencia preserva caminho, pagina, metodo, confianca, SHA-256 e truth_status.\n",
        encoding="utf-8"
    )
    print(json.dumps(manifest,ensure_ascii=False,indent=2))

if __name__=="__main__":
    main()
