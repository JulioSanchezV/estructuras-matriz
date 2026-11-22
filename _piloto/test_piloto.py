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
from office import DocumentError, Fragment, TYPES, extract
from proveedor import MockProvider, OpenAIAdapter, VerifiedModel, run_review
from revision import ROOT, RUBRIC, PROPOSAL, assemble, candidates, proposed_points, review
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
    def test_proposed_scores_and_unobserved_weight(self):
        word=review(extract(sample("docx"),"docx"))
        self.assertEqual(word["global"],"3 / 100 · mínimo demostrado")
        self.assertEqual(word["coverage"],{"evaluated":2,"total":7,"pendingPoints":95,"openWithinObserved":2})
        self.assertEqual(sum(c["max"] for c in word["criteria"]),100)
        parts=[p for c in word["criteria"] for p in c["aspects"]]
        self.assertTrue(all((p["reference"] is None)==(p["state"]=="pending") for p in parts))
        self.assertEqual(sum(p["points"] for p in parts),3)
        excel=review(extract(sample("xlsx"),"xlsx"))
        balance=next(p for c in excel["criteria"] if c["id"]=="resultados" for p in c["aspects"] if p["id"]=="equilibrio")
        self.assertEqual((balance["state"],balance["points"]),("error",0))
        self.assertEqual(excel["coverage"]["pendingPoints"],94)
        self.assertEqual(review([])["global"],None)

    def test_integer_scores_at_every_level_and_full_distribution(self):
        from unittest.mock import patch
        parts = PROPOSAL["criteria"]
        self.assertEqual([c["max"] for c in parts],[10,15,30,15,15,5,10])
        self.assertEqual([p["max"] for p in parts[2]["aspects"]],[6,10,6,8])
        fragment = Fragment("e1","Referencia de prueba","Evidencia ficticia")
        levels = ["pending","documented","developed","supported","verified","error"]
        for state in levels:
            with self.subTest(state=state), patch("revision.assess",return_value=(state,None)):
                scores = []
                for criterion in parts:
                    breakdown,_ = proposed_points(criterion,[fragment])
                    self.assertEqual(sum(p["max"] for p in breakdown),criterion["max"])
                    for part in breakdown:
                        self.assertIs(type(part["points"]),int)
                        self.assertTrue(0 <= part["points"] <= part["max"])
                        scores.append(part["points"])
                if state == "verified": self.assertEqual(sum(scores),100)
                if state in ("pending","error"): self.assertEqual(sum(scores),0)
        for kind in TYPES:
            report = review(extract(sample(kind),kind))
            self.assertTrue(all(type(n) is int for n in report["coverage"].values()))
            self.assertTrue(all(type(c["points"]) is int for c in report["criteria"]))
            self.assertRegex(report["global"],r"^\d+ / 100")

    def test_adopted_course_terms_and_older_node_spelling(self):
        self.assertEqual(RUBRIC["criteria"][1]["label"],"Avalúo de cargas y asignación en nodos")
        def evaluate(line):
            return review([Fragment("e1","Ubicación ficticia",line)])
        self.assertEqual(evaluate("Nodo 2 en x = 3 m.")["global"],evaluate("Nudo 2 en x = 3 m.")["global"])
        load=evaluate("Asignación en nodos por área tributaria: 2 kN/m² × 3 m² = 6 kN.")
        nodal=next(a for c in load["criteria"] if c["id"]=="cargas" for a in c["aspects"] if a["id"]=="reparto")
        self.assertEqual((nodal["state"],nodal["points"]),("verified",4))

    def test_unknown_and_unsupported(self):
        for content,ext in [(b"Archivo ficticio ilegible","docx"),(sample("xlsx"),"pptx"),(sample("docx"),"pdf")]:
            with self.assertRaises(DocumentError): extract(content,ext)
        self.assertIsNone(review([])["global"])
        self.assertIsNone(RUBRIC["numeric"])
    def test_errors_vs_absence_and_references(self):
        doc=review(extract(sample("xlsx"),"xlsx"))
        states={c["id"]:c["status"] for c in doc["criteria"]}
        self.assertEqual(states["resultados"],"partial")
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
        self.assertNotIn("en x = 3",sent[0]["input"].lower())
    def test_aggregate_status_does_not_activate_an_official_grade(self):
        from unittest.mock import patch
        with patch.dict(RUBRIC,{"numeric":{"approval":"fixture","max":5,"partial":5}}):
            report=review(extract(sample("docx"),"docx"))
        self.assertFalse(report["official"])
        self.assertEqual(report["global"],"3 / 100 · mínimo demostrado")

    def test_equal_evidence_across_the_three_containers(self):
        nodes="Nudo 1 en x = 0 m; nudo 2 en x = 3 m."
        for residual,score,arithmetic in [(0,"3 / 100 · mínimo demostrado","verified"),(4,"1 / 100 · mínimo demostrado","error"),(None,None,"pending")]:
            lines=[] if residual is None else [nodes,f"Equilibrio vertical: 30 kN + 20 kN - 50 kN = {residual} kN."]
            baseline=None
            for fmt in TYPES:
                with self.subTest(format=fmt,residual=residual):
                    report=review(extract(sample(fmt,lines=lines),fmt))
                    self.assertEqual(report["global"],score)
                    self.assertEqual(report["coverage"]["evaluated"],0 if residual is None else 2)
                    item=next(c for c in report["criteria"] if c["id"]=="resultados")
                    self.assertEqual(item["status"],"none" if residual is None else "partial")
                    self.assertEqual(item["points"],2 if residual==0 else 0)
                    for part in item["aspects"]:
                        self.assertEqual(part["state"],arithmetic if part["id"]=="equilibrio" else "pending")
                    for item in report["criteria"]:
                        if item["id"] not in ("modelo","resultados"): self.assertEqual(item["status"],"none")
                        for e in item["evidence"]: self.assertTrue(e.pop("location"))
                    if baseline is None: baseline=report
                    else: self.assertEqual(report,baseline)

    def test_unverified_excel_range_remains_pending_without_dispatch(self):
        source=extract(sample("xlsx",structured_balance=True),"xlsx")
        self.assertIn("SUM(B2:D2)",source[0].text)
        report=run_review(source,actor=self.actor,request_id=secrets.token_hex(16),ledger=self.ledger,limits=self.limits,provider=MockProvider())
        self.assertIsNone(report["global"])
        self.assertEqual(report["coverage"]["evaluated"],0)
        item=next(c for c in report["criteria"] if c["id"]=="resultados")
        self.assertEqual(item["statusLabel"],"Control tabular no evaluable")
        self.assertIn("A2:E2",item["evidence"][0]["location"])
        self.assertTrue(all(a["state"]=="pending" for a in item["aspects"]))

    def test_progression_and_late_evidence(self):
        def aspect(lines,cid,aid):
            report=review([Fragment("e"+str(i),"Lugar ficticio "+str(i),line) for i,line in enumerate(lines,1)])
            return next(a for c in report["criteria"] if c["id"]==cid for a in c["aspects"] if a["id"]==aid)
        method="Se calculó el ensamblaje mediante la suma de 10 kN/m + 4 kN/m = 14 kN/m"
        self.assertEqual(aspect([method],"matrices","ensamble")["state"],"developed")
        self.assertEqual(aspect([method+" porque el contraste independiente reproduce el total"],"matrices","ensamble")["state"],"supported")
        self.assertEqual(aspect(["Fuerza nodal por área tributaria: 2 kN/m² × 3 m² = 6 kN."],"cargas","reparto")["state"],"verified")
        self.assertEqual(aspect(["Fuerza nodal por área tributaria: 2 kN/m² × 3 m² = 9 kN."],"cargas","reparto")["state"],"error")
        rows=[f"Nudo {i} en x = {i} m." for i in range(1,10)]+["Esquema acotado con el grado de libertad GDL 3."]
        self.assertEqual(aspect(rows,"modelo","esquema")["reference"],"e10")

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
