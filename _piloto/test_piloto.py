import concurrent.futures
import http.client
import json
from pathlib import Path
import secrets
import tempfile
import threading
import time
import unittest
from consumo import Ledger, Limits, Refused
from fixtures import sample
from office import DocumentError, TYPES, extract
from proveedor import MockProvider, OpenAIAdapter, VerifiedModel, run_review
from revision import ROOT, RUBRIC, assemble, candidates, review
from servidor import LocalPilot, PilotHandler, QuietServer

class PilotTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.ledger=Ledger(Path(self.tmp.name)/"db")
        self.limits=Limits(4,4,4,4)
        self.actor="a"*32
    def run_document(self,kind="docx",provider=None,req=None):
        return run_review(extract(sample(kind),kind),actor=self.actor,request_id=req or secrets.token_hex(16),
                          ledger=self.ledger,limits=self.limits,provider=provider or MockProvider())
    def test_single_files_match_all_static_examples(self):
        examples=json.loads((ROOT/"proyecto/muestras.json").read_text())
        self.ledger.enable(True)
        for kind in TYPES:
            with self.subTest(kind=kind):
                result=self.run_document(kind)
                self.assertEqual(result,examples[kind])
                self.assertFalse(result["official"])
                self.assertEqual(len(result["criteria"]),7)
                self.assertIsNotNone(result["global"])
                self.assertLess(result["coverage"]["evaluated"],7)
                self.assertTrue(all("OCULTO-DE-PRUEBA" not in e["quote"] for c in result["criteria"] for e in c["evidence"]))
        self.assertEqual(review(extract(sample("docx",True),"docx")),examples["empty"])
    def test_unknown_and_unsupported(self):
        for content,ext in [(b"Archivo ficticio ilegible","docx"),(sample("xlsx"),"pptx"),(sample("docx"),"pdf")]:
            with self.assertRaises(DocumentError): extract(content,ext)
        self.assertIsNone(review([])["global"])
        self.assertIsNone(RUBRIC["numeric"])
    def test_errors_vs_absence_and_references(self):
        doc=review(extract(sample("xlsx"),"xlsx"))
        states={c["id"]:c["status"] for c in doc["criteria"]}
        self.assertEqual(states["resultados"],"error")
        self.assertEqual(states["perfiles"],"none")
        group=candidates(extract(sample("docx"),"docx"))
        result=assemble(group,{"modelo":["id-inexistente"],"rubric":["otra"]})
        self.assertFalse(result["criteria"][0]["evidence"])
        self.assertEqual(result["rubric"],RUBRIC["version"])
    def test_budget_race_cut_and_restart(self):
        self.ledger.enable(True)
        def attempt(_):
            try:
                self.run_document();return True
            except Refused:return False
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            self.assertEqual(sum(pool.map(attempt,range(8))),4)
        reopened=Ledger(self.ledger.path)
        with self.assertRaises(Refused): reopened.reserve(self.actor,secrets.token_hex(16),1,self.limits)
        reopened.enable(False)
        with self.assertRaises(Refused): reopened.reserve("b"*32,secrets.token_hex(16),1,Limits(100,100,100,100))
    def test_no_dispatch_without_reservation_and_no_retry(self):
        calls=[]
        class Counting(MockProvider):
            def select(self,g):
                calls.append(True)
                raise RuntimeError("Fallo ficticio")
        p=Counting()
        with self.assertRaises(Refused):self.run_document(provider=p)
        self.assertFalse(calls)
        self.ledger.enable(True);rid=secrets.token_hex(16)
        with self.assertRaises(RuntimeError):self.run_document(provider=p,req=rid)
        with self.assertRaises(Refused):self.run_document(provider=p,req=rid)
        self.assertEqual(len(calls),1)
    def test_real_adapter_uses_injected_transport_only(self):
        model=VerifiedModel("modelo-simulado-1",1000,100,1000,1000,int(time.time())+3600)
        with self.assertRaises(Refused):OpenAIAdapter(model,lambda:None).preview({})
        sent=[]
        def fake(body,_):
            sent.append(body)
            result={c["id"]:[] for c in RUBRIC["criteria"]}
            return {"status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":json.dumps(result)}]}]}
        self.ledger.enable(True)
        impl=OpenAIAdapter(model,lambda:"solo-fixture",approved=True,transport=fake)
        self.run_document(provider=impl)
        self.assertEqual(len(sent),1);self.assertFalse(sent[0]["store"]);self.assertEqual(sent[0]["tools"],[])
        self.assertNotIn("nudo 2 en x",sent[0]["input"].lower())
    def test_http_session_and_upload(self):
        app=LocalPilot(Path(self.tmp.name)/"privado")
        app.open_login();self.addCleanup(app.close);app.ledger.enable(True)
        srv=QuietServer(("127.0.0.1",0),PilotHandler);srv.application=app;srv.host_label=f"127.0.0.1:{srv.server_port}"
        th=threading.Thread(target=srv.serve_forever,daemon=True);th.start()
        self.addCleanup(srv.server_close);self.addCleanup(srv.shutdown)
        def post(path,body,**headers):
            conn=http.client.HTTPConnection("127.0.0.1",srv.server_port,timeout=5)
            try:
                conn.request("POST",path,body,{"Origin":"http://"+srv.host_label,**headers})
                r=conn.getresponse()
                return r.status,r.getheader("Set-Cookie"),json.loads(r.read())
            finally:conn.close()
        status,_,_=post("/revisar",b"fixture");self.assertEqual(status,401)
        status,cookie,_=post("/sesion",app.code,**{"Content-Type":"text/plain"});self.assertEqual(status,200)
        cookie=cookie.split(";")[0]
        for fmt in TYPES:
            status,_,report=post("/revisar",sample(fmt),Cookie=cookie,**{"Content-Type":"application/octet-stream","X-Tipo-Office":fmt,"X-Intento":secrets.token_hex(16)})
            self.assertEqual(status,200);self.assertEqual(report["coverage"]["total"],7)
        status,_,bad=post("/revisar",b"archivo ficticio ilegible",Cookie=cookie,**{"Content-Type":"application/octet-stream","X-Tipo-Office":"docx","X-Intento":secrets.token_hex(16)})
        self.assertEqual(status,422);self.assertIsNone(bad["global"])
        self.assertEqual(post("/salir",b"",Cookie=cookie)[0],200)
        self.assertEqual(post("/revisar",b"fixture",Cookie=cookie)[0],401)
        raw=(app.state_path/"consumo.sqlite").read_bytes()
        self.assertNotIn(b"Equilibrio vertical",raw)
        self.assertNotIn(b"muestra.docx",raw)

if __name__=="__main__": unittest.main()
