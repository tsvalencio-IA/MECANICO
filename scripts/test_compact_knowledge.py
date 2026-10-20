#!/usr/bin/env python3
"""Exercise the compact-index CLI with small, self-contained source shards."""

import gzip
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


BUILDER = Path(__file__).with_name("build_compact_knowledge.py")


class CompactKnowledgeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.knowledge = self.root / "knowledge"
        (self.knowledge / "brain").mkdir(parents=True)
        self.out = self.root / "compact"

    def write_source(self, records):
        manifest = {
            "schema_version": 2,
            "archive": "fixture.zip",
            "archive_sha256": "a" * 64,
            "truth_policy": {"ocr_unverified": "conferir na fonte"},
            "shards": [{"file": "shard-0000.jsonl.gz"}],
        }
        (self.knowledge / "manifest.json").write_text(
            json.dumps(manifest), encoding="utf-8"
        )
        with gzip.open(self.knowledge / "brain/shard-0000.jsonl.gz", "wt", encoding="utf-8") as shard:
            for record in records:
                shard.write(json.dumps(record, ensure_ascii=False) + "\n")

    def build(self, out=None, seed="1", success=True):
        result = subprocess.run(
            [sys.executable, str(BUILDER), "--knowledge-dir", str(self.knowledge),
             "--out", str(out or self.out)],
            env={**os.environ, "PYTHONHASHSEED": seed},
            capture_output=True, text=True, check=False,
        )
        if success:
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0)
        return result

    def load(self, name):
        return json.loads((self.out / name).read_text(encoding="utf-8"))

    def record(self, record_id):
        bucket = self.load("record-map.json")[record_id]
        return self.load(f"records/r{bucket:02d}.json")[str(record_id)]

    def snapshot(self, out=None):
        out = out or self.out
        return {p.relative_to(out).as_posix(): p.read_bytes()
                for p in out.rglob("*") if p.is_file()}

    def test_codes_preserve_provenance_and_reach_text_beyond_preview(self):
        self.write_source([
            {
                "path": "Renault/Duster.pdf", "page": 12, "chunk": 3,
                "text": "introdução " * 400 + "DF 0 2 6: conferir circuito; P0A80 e U 0 1 0 0.",
                "method": "ocr_tesseract", "confidence": 0.9999,
                "truth_status": "ocr_unverified", "sha256": "b" * 64,
            },
            {
                "path": "Toyota/Hibrido.pdf", "page": 2, "chunk": 0,
                "text": "P0A80: procedimento extraído diretamente.",
                "method": "pdf_text", "confidence": 1,
                "truth_status": "source_extracted", "sha256": "c" * 64,
            },
            {
                "path": "legado.txt", "text": "P0301: procedência não declarada.",
                "method": "text_decode", "confidence": 1,
            },
        ])
        self.build()
        manifest = self.load("manifest.json")
        self.assertEqual(manifest["schema_version"], 1)
        self.assertEqual(manifest["source_archive_sha256"], "a" * 64)
        self.assertEqual(manifest["truth_policy"], {"ocr_unverified": "conferir na fonte"})
        self.assertFalse(manifest["heavy_shards_required_by_client"])
        self.assertEqual(manifest["truth_counts"], {
            "ocr_unverified": 1, "source_extracted": 1, "unknown": 1,
        })
        self.assertEqual(manifest["dtcs"], 4)

        for code, ids in {"DF026": [0], "P0A80": [0, 1], "U0100": [0], "P0301": [2]}.items():
            payload = self.load(f"dtc/{code}.json")
            self.assertEqual(payload["code"], code)
            self.assertEqual([r["id"] for r in payload["records"]], ids)
            for evidence in payload["records"]:
                compact = self.record(evidence["id"])
                for field in ("id", "path", "page", "chunk", "method", "confidence", "truth_status", "sha256"):
                    self.assertEqual(evidence[field], compact[field], (code, field))

        self.assertNotIn("DF 0 2 6", self.record(0)["text"])
        self.assertIn("DF 0 2 6", self.load("dtc/DF026.json")["records"][0]["snippet"])
        self.assertIn("P0A80", self.load("dtc/P0A80.json")["records"][0]["snippet"])
        self.assertEqual(self.load("terms/df.json")["df026"], [0])
        self.assertEqual(self.load("terms/p0.json")["p0a80"], [0, 1])
        self.assertEqual(self.load("terms/u0.json")["u0100"], [0])
        self.assertEqual(self.record(2)["truth_status"], "unknown")
        self.assertEqual(self.record(2)["sha256"], "")
        self.assertIsNone(self.record(2)["page"])

    def test_literal_codes_include_hex_but_do_not_guess_ambiguous_ocr(self):
        self.write_source([
            {"path": "codigos.txt", "text": "p0a80, b2abc, c123f, u3000, df1234; DF 0 2 6."},
            {"path": "nao-codigos.txt", "text": "P4ABC XP0301 P03012 DF02 DF12345 P03O1 P0301X UABCD"},
        ])
        self.build()
        self.assertEqual(
            {p.stem for p in (self.out / "dtc").glob("*.json")},
            {"P0A80", "B2ABC", "C123F", "U3000", "DF1234", "DF026"},
        )
        for path in (self.out / "dtc").glob("*.json"):
            self.assertEqual([r["id"] for r in self.load(path.relative_to(self.out))["records"]], [0])

    def test_rebuild_removes_old_generated_files_and_keeps_user_notes(self):
        self.write_source([{"path": "old.txt", "text": "P0301 zzzebra"}])
        self.build()
        for directory in ("records", "terms", "dtc"):
            (self.out / directory / "notes.txt").write_text("keep", encoding="utf-8")
        (self.out / "records/r99.json").write_text("{}", encoding="utf-8")
        self.write_source([{"path": "new.txt", "text": "P0A80 sensor"}])
        self.build()
        self.assertFalse((self.out / "dtc/P0301.json").exists())
        self.assertFalse((self.out / "terms/zz.json").exists())
        self.assertFalse((self.out / "records/r99.json").exists())
        for directory in ("records", "terms", "dtc"):
            self.assertEqual((self.out / directory / "notes.txt").read_text(), "keep")
        self.assertEqual(self.load("manifest.json")["records"], 1)
        self.assertEqual(self.load("manifest.json")["dtcs"], 1)
        self.assertEqual(self.load("dtc/P0A80.json")["records"][0]["path"], "new.txt")

    def test_build_is_byte_deterministic_across_hash_seeds(self):
        self.write_source([
            {"path": "Renault/Duster.pdf", "text": "P0301 P0A80 DF 0 2 6 sensor ignição chicote"},
            {"path": "Toyota.pdf", "text": "P0A80 bateria híbrida medição", "truth_status": "ocr_unverified"},
        ])
        self.build(seed="1")
        alternate = self.root / "alternate"
        self.build(out=alternate, seed="17")
        self.assertEqual(self.snapshot(), self.snapshot(alternate))

    def test_index_revision_changes_when_rebuilt_content_changes_in_the_same_archive(self):
        self.write_source([{"path": "manual.txt", "text": "P0301 sensor", "truth_status": "source_extracted"}])
        self.build()
        before = self.load("manifest.json")
        self.assertRegex(before["index_revision"], r"^[0-9a-f]{64}$")
        self.write_source([{"path": "manual.txt", "text": "P0301 sensor e chicote", "truth_status": "source_extracted"}])
        self.build()
        after = self.load("manifest.json")
        self.assertEqual(before["source_archive_sha256"], after["source_archive_sha256"])
        self.assertNotEqual(before["index_revision"], after["index_revision"])

    def test_invalid_source_fails_without_silently_dropping_records_or_changing_output(self):
        self.write_source([{"path": "valid.txt", "text": "P0301 sensor"}])
        self.build()
        snapshot = self.snapshot()
        with gzip.open(self.knowledge / "brain/shard-0000.jsonl.gz", "wt", encoding="utf-8") as shard:
            shard.write('{"path":"corrupt.txt","text":\n')
        result = self.build(success=False)
        self.assertIn("Invalid record", result.stderr)
        self.assertEqual(self.snapshot(), snapshot)


    def test_focused_windows_recover_component_after_preview_without_changing_source(self):
        full = ("introductory material " * 200) + (
            "Renault Clio 2003 motor K4M circuito do sensor de detonação: "
            "verificar conexões e comparar com esquema de injeção correspondente."
        )
        self.write_source([
            {"path":"Renault/Clio_2003_K4M.pdf","page":34,"chunk":2,
             "text":full,"method":"pdf_text","truth_status":"source_extracted",
             "confidence":0.99,"sha256":"f"*64},
            {"path":"Renault/Clio_1999_K7M.pdf","page":8,
             "text":"Circuito do sensor de detonação K7M",
             "method":"ocr","truth_status":"ocr_unverified",
             "sha256":"c"*64},
        ])
        self.build()
        found=self.load("focus/detonacao.json")
        self.assertEqual(len(found),2)
        self.assertEqual(found[0]["path"],"Renault/Clio_2003_K4M.pdf")
        self.assertEqual(found[0]["page"],34)
        self.assertEqual(found[0]["truth_status"],"source_extracted")
        self.assertEqual(found[0]["sha256"],"f"*64)
        self.assertIn("sensor de detonação",found[0]["snippet"])
        self.assertNotIn("sensor de detonação",self.record(0)["text"])
        self.assertEqual(self.load("manifest.json")["focused_topics"]["detonacao"],2)
        # The less reliable page is still explicitly labelled unverified.
        self.assertEqual(found[1]["truth_status"],"ocr_unverified")

    def test_empty_corpus_clears_previous_index(self):
        self.write_source([{"path": "old.txt", "text": "P0301 sensor"}])
        self.build()
        self.write_source([])
        self.build()
        self.assertEqual(self.load("manifest.json")["records"], 0)
        self.assertEqual(self.load("manifest.json")["dtcs"], 0)
        self.assertEqual(self.load("record-map.json"), [])
        self.assertEqual(list((self.out / "terms").glob("*.json")), [])
        self.assertEqual(list((self.out / "dtc").glob("*.json")), [])
        self.assertTrue(all(json.loads(path.read_text()) == {} for path in (self.out / "records").glob("*.json")))


if __name__ == "__main__":
    unittest.main()
