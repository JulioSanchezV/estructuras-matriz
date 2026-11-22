"""Bounded, in-memory extraction of the visible contents of one OOXML file."""
from dataclasses import dataclass
from io import BytesIO
from pathlib import PurePosixPath
import posixpath
import re
import xml.etree.ElementTree as ET
from zipfile import BadZipFile, ZipFile, ZIP_DEFLATED, ZIP_STORED

MAX_UPLOAD = 4 * 1024 * 1024
MAX_TOTAL = 12 * 1024 * 1024
MAX_PART = 2 * 1024 * 1024
MAX_TEXT = 56_000
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
X = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
P = "http://schemas.openxmlformats.org/presentationml/2006/main"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG = "http://schemas.openxmlformats.org/package/2006/relationships"
CT = "http://schemas.openxmlformats.org/package/2006/content-types"
TYPES = {
    "docx": ("word/document.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"),
    "xlsx": ("xl/workbook.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"),
    "pptx": ("ppt/presentation.xml", "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"),
}

class DocumentError(ValueError):
    pass

@dataclass(frozen=True)
class Fragment:
    id: str
    location: str
    text: str

def tag(ns, name):
    return "{" + ns + "}" + name

def check_name(name):
    if not name or "\\" in name or name.startswith("/") or any(p in (".", "..", "") for p in name.rstrip("/").split("/")):
        raise DocumentError("El paquete contiene rutas no admitidas.")

class Package:
    def __init__(self, archive):
        self.zip = archive
        items = archive.infolist()
        if len(items) > 400 or sum(x.file_size for x in items) > MAX_TOTAL:
            raise DocumentError("El archivo supera el límite de contenido del piloto.")
        self.names = set()
        for item in items:
            check_name(item.filename)
            if item.filename in self.names or item.flag_bits & 1 or item.compress_type not in (ZIP_STORED, ZIP_DEFLATED):
                raise DocumentError("El paquete está protegido o tiene una estructura no admitida.")
            self.names.add(item.filename)
            name = item.filename.lower()
            if name.endswith("vbaproject.bin") or "/embeddings/" in name or "/activex/" in name:
                raise DocumentError("El piloto admite archivos sin macros ni objetos incrustados.")

    def xml(self, name):
        if name not in self.names or self.zip.getinfo(name).file_size > MAX_PART:
            raise DocumentError("Falta una parte legible o supera el tamaño permitido.")
        with self.zip.open(name) as stream:
            raw = stream.read(MAX_PART + 1)
        if len(raw) > MAX_PART:
            raise DocumentError("La parte XML supera el límite.")
        encoding = "utf-16" if raw[:2] in (b"\xff\xfe", b"\xfe\xff") else "utf-8-sig"
        try:
            text = raw.decode(encoding)
        except UnicodeError:
            raise DocumentError("La codificación del documento no es compatible.") from None
        if "\x00" in text or re.search(r"<!\s*(?:DOCTYPE|ENTITY)\b", text, re.I):
            raise DocumentError("Las declaraciones externas no están admitidas.")
        try:
            root = ET.fromstring(text)
        except ET.ParseError:
            raise DocumentError("No se pudo leer la estructura del documento.") from None
        if sum(1 for _ in root.iter()) > 42_000:
            raise DocumentError("La parte XML es demasiado extensa.")
        return root

    def relationships(self, source):
        dir_name, part = posixpath.split(source)
        path = posixpath.join(dir_name, "_rels", part + ".rels")
        result = {}
        for rel in self.xml(path).findall(tag(PKG, "Relationship")):
            if rel.get("TargetMode", "Internal") != "Internal":
                continue
            target = rel.get("Target", "")
            if not target or ":" in target or "\\" in target or "?" in target or "#" in target:
                continue
            dest = posixpath.normpath(target[1:] if target.startswith("/") else posixpath.join(dir_name, target))
            if dest in self.names and not dest.startswith("../"):
                result[rel.get("Id")] = (dest, rel.get("Type", ""))
        return result

def visible(node, hidden_tags):
    stack = [node]
    while stack:
        cur = stack.pop()
        if cur.tag in hidden_tags:
            continue
        if cur.tag == tag(W, "r") and cur.find("./" + tag(W, "rPr") + "/" + tag(W, "vanish")) is not None:
            continue
        yield cur
        stack.extend(reversed(list(cur)))

def words(package, main):
    root = package.xml(main)
    body = root.find(tag(W, "body"))
    if body is None:
        raise DocumentError("No se encontró el cuerpo de Word.")
    skips = {tag(W, k) for k in ("del", "moveFrom", "drawing", "pict", "object", "txbxContent")}
    paragraphs = (n for n in visible(body, skips) if n.tag == tag(W, "p"))
    for i, p in enumerate(paragraphs, 1):
        text = "".join((n.text or "") if n.tag == tag(W, "t") else " " for n in visible(p, skips)
                       if n.tag in (tag(W, "t"), tag(W, "tab"), tag(W, "br")))
        yield "Word · párrafo " + str(i), text

def slides(package, main):
    root = package.xml(main)
    rels = package.relationships(main)
    for number, slide in enumerate(root.findall("./" + tag(P,"sldIdLst") + "/" + tag(P,"sldId")), 1):
        path, typ = rels.get(slide.get(tag(R,"id")), ("", ""))
        if not typ.endswith("/slide") or not path.startswith("ppt/slides/"):
            raise DocumentError("Falta una diapositiva interna.")
        doc = package.xml(path)
        if doc.get("show") in ("0", "false"):
            continue
        tree = doc.find("./" + tag(P,"cSld") + "/" + tag(P,"spTree"))
        if tree is None:
            continue
        index = 0
        for shape in tree.iter(tag(P,"sp")):
            meta = shape.find("./" + tag(P,"nvSpPr") + "/" + tag(P,"cNvPr"))
            if meta is not None and meta.get("hidden") in ("1","true"):
                continue
            for para in shape.iter(tag(A,"p")):
                index += 1
                yield f"PowerPoint · diapositiva {number}, texto {index}", "".join(x.text or "" for x in para.iter(tag(A,"t")))
        for table in tree.iter(tag(A,"tbl")):
            for rownum, row in enumerate(table.findall(tag(A,"tr")), 1):
                yield f"PowerPoint · diapositiva {number}, fila {rownum}", " | ".join("".join(n.text or "" for n in cell.iter(tag(A,"t"))) for cell in row.findall(tag(A,"tc")))

def rich(node):
    return "".join(n.text or "" for n in visible(node, {tag(X,"rPh")}) if n.tag == tag(X,"t"))

def sheets(package, main):
    root = package.xml(main)
    rels = package.relationships(main)
    shared = []
    for path, typ in rels.values():
        if typ.endswith("/sharedStrings") and path.startswith("xl/"):
            shared = [rich(v) for v in package.xml(path).findall(tag(X,"si"))]
            break
    for number, sheet in enumerate(root.findall("./" + tag(X,"sheets") + "/" + tag(X,"sheet")), 1):
        if sheet.get("state", "visible") != "visible":
            continue
        path, typ = rels.get(sheet.get(tag(R,"id")), ("", ""))
        if not typ.endswith("/worksheet") or not path.startswith("xl/worksheets/"):
            raise DocumentError("Falta una hoja interna.")
        doc = package.xml(path)
        hidden = [(int(c.get("min","0")),int(c.get("max","0"))) for c in doc.iter(tag(X,"col")) if c.get("hidden") in ("1","true")]
        for row in doc.findall("./" + tag(X,"sheetData") + "/" + tag(X,"row")):
            if row.get("hidden") in ("1","true"):
                continue
            cells = []
            for cell in row.findall(tag(X,"c")):
                addr = cell.get("r", "")
                m = re.fullmatch(r"([A-Z]{1,3})([1-9]\d{0,6})", addr)
                if not m:
                    continue
                col = 0
                for char in m[1]:
                    col = col * 26 + ord(char) - 64
                if any(a <= col <= b for a,b in hidden):
                    continue
                value = cell.findtext(tag(X,"v"), "")
                kind = cell.get("t", "n")
                if kind == "s":
                    if not value.isdigit() or int(value) >= len(shared):
                        raise DocumentError("La tabla de textos de Excel es ilegible.")
                    value = shared[int(value)]
                elif kind == "inlineStr":
                    obj = cell.find(tag(X,"is"))
                    value = rich(obj) if obj is not None else ""
                formula = cell.findtext(tag(X,"f"))
                if formula:
                    value = "fórmula visible =" + formula
                if value.strip():
                    cells.append((addr, value))
            if cells:
                loc = f"Excel · hoja {number}, {cells[0][0]}:{cells[-1][0]}"
                value=cells[0][1] if len(cells)==1 else " | ".join(f"{a} {v}" for a,v in cells)
                yield loc,value

def extract(raw, expected):
    if expected not in TYPES or not isinstance(raw, bytes) or not 0 < len(raw) <= MAX_UPLOAD:
        raise DocumentError("Use un único DOCX, XLSX o PPTX de hasta 4 MiB.")
    try:
        with ZipFile(BytesIO(raw)) as archive:
            pkg = Package(archive)
            main, typ = TYPES[expected]
            declared = {(n.get("PartName"), n.get("ContentType")) for n in pkg.xml("[Content_Types].xml").findall(tag(CT,"Override"))}
            if ("/" + main, typ) not in declared:
                raise DocumentError("La extensión no coincide con el tipo de documento.")
            get = {"docx": words, "xlsx": sheets, "pptx": slides}[expected]
            fragments, consumed = [], 0
            for loc, text in get(pkg, main):
                text = " ".join(text.split())
                if not text:
                    continue
                consumed += len(text)
                if consumed > MAX_TEXT or len(fragments) >= 700 or len(text) > 5500:
                    raise DocumentError("La evidencia excede el límite. Seleccione los apartados pertinentes.")
                fragments.append(Fragment("e" + str(len(fragments)+1), loc, text))
            return fragments
    except DocumentError:
        raise
    except (BadZipFile, OSError, ValueError, KeyError, OverflowError, RuntimeError):
        raise DocumentError("El archivo está dañado, protegido o no se puede abrir.") from None
