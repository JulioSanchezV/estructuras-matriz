"""Authenticated local pilot. Run from a private machine, without a provider key."""
import argparse
from hashlib import sha256
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import hmac
import json
import os
import secrets
import sqlite3
import time
from urllib.parse import urlsplit
from consumo import Ledger, Limits, Refused
from office import DocumentError, MAX_UPLOAD, extract
from proveedor import MockProvider, run_review
from revision import ROOT

MOCK_LIMITS = Limits(global_max=200, user_day_max=20, user_day_calls=20, global_calls=200)

class LocalPilot:
    def __init__(self, state):
        state.mkdir(mode=0o700, parents=True, exist_ok=True)
        state = state.resolve()
        if state == ROOT or ROOT in state.parents or state.stat().st_mode & 0o077:
            raise ValueError("Use un directorio privado, ajeno al repositorio, con permisos 0700.")
        self.ledger = Ledger(state / "consumo.sqlite")
        self.provider = MockProvider()
        self.actor = sha256(b"operador-local-unico-del-piloto").hexdigest()
        self.code_path = state / "entrada-local"
        self.code = None
        self.session = None
        self.expires = 0
        self.failures = 0
        self.state_path = state
    def open_login(self):
        self.code = secrets.token_urlsafe(32)
        self.code_until = time.time()+600
        self.failures = 0
        self.code_path.unlink(missing_ok=True)
        with self.code_path.open("x", encoding="utf-8") as out:
            os.chmod(self.code_path,0o600)
            out.write(self.code)
    def login(self, code):
        if not self.code or time.time()>self.code_until or self.failures>=8 or not isinstance(code,str) or len(code)>100:
            return None
        if not hmac.compare_digest(self.code.encode(),code.encode()):
            self.failures+=1
            return None
        self.code = None
        self.code_path.unlink(missing_ok=True)
        self.session = secrets.token_urlsafe(32)
        self.expires = time.time()+1800
        return self.session
    def authenticated(self, raw):
        try:
            jar=SimpleCookie(); jar.load(raw)
            entry=jar.get("sesion_piloto")
            return bool(self.session and time.time()<self.expires and entry and hmac.compare_digest(entry.value.encode(),self.session.encode()))
        except (ValueError,TypeError):
            return False
    def close(self):
        self.code_path.unlink(missing_ok=True)
        self.session=None
        self.code=None

class PilotHandler(BaseHTTPRequestHandler):
    server_version="EstructurasPilot"
    sys_version=""
    def log_message(self,*args):
        pass
    def send_bytes(self,code,body,mime="application/json; charset=utf-8",cookie=None):
        self.send_response(code)
        for k,v in {"Content-Type":mime,"Content-Length":str(len(body)),"Cache-Control":"no-store","Referrer-Policy":"no-referrer",
                    "X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'","Permissions-Policy":"camera=(), microphone=(), geolocation=()"}.items():
            self.send_header(k,v)
        if cookie:
            self.send_header("Set-Cookie",cookie)
        self.end_headers()
        self.wfile.write(body)
    def reply(self,status,value,cookie=None):
        self.send_bytes(status,json.dumps(value,ensure_ascii=False).encode(),cookie=cookie)
    def same_host(self):
        return self.headers.get("Host","")==self.server.host_label
    def body(self,maximum):
        val=self.headers.get("Content-Length","")
        if self.headers.get("Transfer-Encoding") or not val.isascii() or not val.isdecimal() or len(val)>10 or not 0<int(val)<=maximum:
            raise DocumentError("Tamaño de archivo no válido.")
        data=self.rfile.read(int(val))
        if len(data)!=int(val):
            raise DocumentError("La transferencia quedó incompleta.")
        return data
    def do_GET(self):
        if not self.same_host():
            self.reply(403,{"error":"Origen no autorizado."}); return
        assets={"/":("_piloto/privado.html","text/html"),"/privado.mjs":("_piloto/privado.mjs","text/javascript"),
                "/vista.mjs":("proyecto/vista.mjs","text/javascript"),"/estilo.css":("proyecto/proyecto.css","text/css")}
        entry=assets.get(self.path)
        if not entry:
            self.reply(404,{"error":"Ruta no disponible."}); return
        self.send_bytes(200,(ROOT/entry[0]).read_bytes(),entry[1]+"; charset=utf-8")
    def do_POST(self):
        app=self.server.application
        if not self.same_host() or self.headers.get("Origin")!="http://"+self.server.host_label:
            self.reply(403,{"error":"Origen no autorizado."}); return
        try:
            if self.path=="/sesion":
                if self.headers.get_content_type()!="text/plain":
                    self.reply(415,{"error":"Contenido no admitido."}); return
                token=app.login(self.body(130).decode("ascii"))
                if not token:
                    self.reply(403,{"error":"Acceso no válido o vencido."}); return
                self.reply(200,{"ok":True},f"sesion_piloto={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=1800"); return
            if not app.authenticated(self.headers.get("Cookie","")):
                self.reply(401,{"error":"Inicie la sesión privada de prueba."}); return
            if self.path=="/salir":
                app.session=None
                self.reply(200,{"ok":True},"sesion_piloto=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0"); return
            if self.path!="/revisar":
                self.reply(404,{"error":"Ruta no disponible."}); return
            if self.headers.get_content_type()!="application/octet-stream":
                self.reply(415,{"error":"Se admite un único archivo Office."}); return
            ext=self.headers.get("X-Tipo-Office","")
            fragments=extract(self.body(MAX_UPLOAD),ext)
            result=run_review(fragments,actor=app.actor,request_id=self.headers.get("X-Intento",""),
                              ledger=app.ledger,limits=MOCK_LIMITS,provider=app.provider)
            self.reply(200,result)
        except (DocumentError,UnicodeError) as err:
            self.reply(422,{"error":str(err) if isinstance(err,DocumentError) else "El contenido no se pudo leer.","global":None})
        except Refused as err:
            self.reply(429,{"error":str(err),"global":None})
        except (sqlite3.Error, OSError, ValueError, KeyError, TypeError):
            self.reply(503,{"error":"No se pudo verificar la operación. La revisión se detuvo.","global":None})

class QuietServer(HTTPServer):
    def get_request(self):
        client,addr=super().get_request()
        client.settimeout(12)
        return client,addr
    def handle_error(self,request,client_address):
        pass

def main():
    parser=argparse.ArgumentParser(description="Piloto local con proveedor simulado")
    parser.add_argument("accion",choices=["iniciar","autorizar-simulador","detener"])
    parser.add_argument("--estado",type=Path,default=Path.home()/".estructuras-piloto")
    parser.add_argument("--puerto",type=int,default=8765)
    args=parser.parse_args()
    os.umask(0o077)
    app=LocalPilot(args.estado)
    if args.accion!="iniciar":
        app.ledger.enable(args.accion=="autorizar-simulador")
        print("Consumo simulado autorizado." if args.accion=="autorizar-simulador" else "Consumo detenido.")
        return
    with QuietServer(("127.0.0.1",args.puerto),PilotHandler) as server:
        server.application=app
        server.host_label=f"127.0.0.1:{server.server_port}"
        app.open_login()
        print(f"Abra http://{server.host_label}/ · Acceso local de un uso en {app.code_path}",flush=True)
        try:
            server.serve_forever()
        finally:
            app.close()

if __name__=="__main__":
    main()
