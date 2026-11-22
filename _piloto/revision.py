"""Evidence-based formative review. Rubric and grading authority stay on the server."""
from decimal import Decimal, InvalidOperation
from pathlib import Path
import json
import re
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
RUBRIC = json.loads((ROOT / "proyecto" / "rubrica.json").read_text(encoding="utf-8"))
TOPICS = {
    "modelo": r"nudos?|coordenadas?|apoyos?|conectividad|grados de libertad|peralte|triangul",
    "cargas": r"tributari|carga muerta|carga viva|fuerza nodal|cargas nodales|caso de viento|peso propio",
    "matrices": r"ensambl|matriz|rigidez|condici[oó]n de apoyo|formula visible",
    "resultados": r"equilibrio|reaccion|desplazamiento|fuerza axial",
    "resistencia": r"deflexion|compresion|traccion|longitud no arriostrada|capacidad axial",
    "criticas": r"inversion de esfuerzos|levantamiento|succion|barra critica|cordon|diagonal|montante",
    "perfiles": r"alternativa|seleccion de perfil|peso propio|masa total|menor peso",
}
DATA = re.compile(r"[-+]?\d+(?:[.,]\d+)?\s*(?:kn(?:/m[²2]?)?|mm|cm|m(?:[²2])?|kg|mpa|%)\b|(?:nudo|barra|gdl)\s+[a-z]?\d+|formula visible\s*=\S+|\[\s*-?\d+\s*[,;]", re.I)
BALANCE = re.compile(r"equilibrio\s+(?:vertical|horizontal)\s*:\s*([+-]?\d+(?:[.,]\d+)?)\s*kN\s*([+-])\s*(\d+(?:[.,]\d+)?)\s*kN\s*([+-])\s*(\d+(?:[.,]\d+)?)\s*kN\s*=\s*([+-]?\d+(?:[.,]\d+)?)\s*kN", re.I)
STATUS = {"none":"Sin evidencia legible", "partial":"Evidencia parcial", "checked":"Comprobación reproducida", "error":"Discrepancia comprobada"}

def normalize(s):
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if not unicodedata.combining(c))

def candidates(fragments):
    selected = {}
    for crit in RUBRIC["criteria"]:
        cid = crit["id"]
        hits = []
        for fragment in fragments:
            plain = normalize(fragment.text)
            if re.search(TOPICS[cid], plain) and DATA.search(plain):
                hits.append(fragment)
        selected[cid] = hits[:6]
    return selected

def equilibrium(text):
    m = BALANCE.search(text)
    if not m:
        return None
    def number(x):
        return Decimal(x.replace(",", "."))
    try:
        expected = number(m[1]) + number(m[2] + m[3]) + number(m[4] + m[5])
        declared = number(m[6])
    except InvalidOperation:
        return None
    if abs(expected - declared) > Decimal("0.001"):
        return False, f"La suma reproducida da {expected} kN. El documento declara {declared} kN."
    if abs(expected) > Decimal("0.001"):
        return False, f"La suma declarada es coherente, pero el equilibrio deja un residual de {expected} kN."
    return True, "La suma independiente de las tres fuerzas coincide con el residual declarado de 0 kN."

def mock_select(grouped):
    return {cid: [f.id for f in hits] for cid,hits in grouped.items()}

def parcial_reason(cid, rows):
    if not rows:
        return "El contenido visible no permite juzgar este criterio. Puede estar en una imagen, otro soporte o un apartado aún sin documentar."
    text = normalize(" ".join(r.text for r in rows))
    found, pending = [], []
    for title, pattern in RUBRIC["indicios"][cid]:
        (found if re.search(pattern, text) else pending).append(title)
    first = ("Las citas mencionan " + ", ".join(found) + ".") if found else "Se localizaron datos técnicos vinculados a este criterio."
    return first + ((" Por verificar en la evidencia: " + ", ".join(pending) + ".") if pending else " Revise la coherencia y la suficiencia de esos datos en el modelo.")

def numeric_floor(items, policy):
    """Only an explicitly approved, versioned schedule can enable numeric feedback."""
    if policy is None:
        return None
    if not isinstance(policy, dict) or not policy.get("approval") or not policy.get("version"):
        raise ValueError("La escala requiere aprobación y versión.")
    score = Decimal(0); maxima = Decimal(0)
    parts = policy.get("criteria", {})
    if set(parts) != {c["id"] for c in items}:
        raise ValueError("La escala debe incluir todos los criterios.")
    for item in items:
        rule = parts[item["id"]]
        maximum = Decimal(str(rule["max"]))
        if not maximum.is_finite() or maximum <= 0:
            raise ValueError("Máximo de criterio inválido.")
        maxima += maximum
        levels = {k:Decimal(str(rule[k])) for k in ("partial","checked","error")}
        if any(not x.is_finite() or x<0 or x>maximum for x in levels.values()):
            raise ValueError("Puntos de desempeño fuera de la escala.")
        if item["status"] != "none":
            score += levels[item["status"]]
    if maxima != Decimal(str(policy["max"])):
        raise ValueError("La suma del máximo de los criterios no coincide con la escala.")
    if not any(c["status"]!="none" for c in items):
        return None
    number=lambda n:format(n.normalize(),"f").replace(".",",")
    return number(score)+" / "+number(maxima)+" · crédito mínimo sustentado"

def assemble(grouped, selections):
    items = []
    for crit in RUBRIC["criteria"]:
        cid = crit["id"]
        # Even a provider response can select only actual candidates for this criterion.
        ids = selections.get(cid, []) if isinstance(selections, dict) else []
        ids = {x for x in ids if isinstance(x, str)} if isinstance(ids, list) else set()
        valid = [f for f in grouped[cid] if f.id in ids]
        state = "partial" if valid else "none"
        reason = parcial_reason(cid, valid)
        if cid == "resultados":
            checks = [(f,equilibrium(f.text)) for f in grouped[cid]]
            checks = [(f,v) for f,v in checks if v is not None]
            if checks:
                f, check = next(((z,c) for z,c in checks if not c[0]), checks[0])
                state, reason = ("checked" if check[0] else "error"), check[1]
                valid = [f] + [z for z in valid if z.id != f.id]
        evidence = [{"id":f.id, "location":f.location, "quote":f.text[:240]} for f in valid[:3]]
        items.append({"id":cid, "label":crit["label"], "status":state, "statusLabel":STATUS[state],
                      "reason":reason, "evidence":evidence, "next":crit["description"]})
    covered = sum(i["status"] != "none" for i in items)
    wrong = any(i["status"] == "error" for i in items)
    checked = any(i["status"] == "checked" for i in items)
    if not covered:
        global_mark = None
        note = "No hay evidencia puntuable en las partes visibles. Añada texto, celdas o una comprobación con unidades."
    elif wrong:
        global_mark, note = "Desarrollo parcial con una discrepancia comprobada", "Revise el equilibrio señalado y vuelva a contrastar la respuesta."
    elif checked:
        global_mark, note = "Desarrollo parcial con una comprobación reproducida", "La comprobación respalda ese resultado. Revise la evidencia de los demás criterios."
    else:
        global_mark, note = "Desarrollo parcial documentado", "Se localizaron datos técnicos. Complete las comprobaciones indicadas por criterio."
    if covered == len(items):
        global_mark = "Siete criterios documentados con una discrepancia comprobada" if wrong else "Siete criterios documentados, pendientes de validación integral"
    policy=RUBRIC.get("numeric")
    scale="La versión docente contiene siete criterios y carece de pesos o escala numérica aprobados. La nota global del piloto es descriptiva. La cobertura cuenta criterios con evidencia, por separado de su calidad."
    numeric=numeric_floor(items,policy)
    if numeric is not None:
        global_mark=numeric
        scale="Escala aprobada " + policy["version"] + ". El crédito demostrado conserva el máximo global de los siete criterios. Un criterio no observable sigue abierto, sin declararlo incorrecto."
    return {"rubric":RUBRIC["version"], "official":False, "global":global_mark, "globalNote":note,
            "coverage":{"evaluated":covered, "total":len(items)}, "criteria":items,
            "scale":scale}

def review(fragments, select=mock_select):
    grouped = candidates(fragments)
    if not any(grouped.values()):
        return assemble(grouped, {})
    return assemble(grouped, select(grouped))
