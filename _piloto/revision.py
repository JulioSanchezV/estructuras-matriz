"""Evidence-based formative review. Rubric and grading authority stay on the server."""
from decimal import Decimal, InvalidOperation
from pathlib import Path
import json
import re
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
RUBRIC = json.loads((ROOT / "proyecto" / "rubrica.json").read_text(encoding="utf-8"))
PROPOSAL = json.loads((ROOT / "proyecto" / "ponderacion-propuesta.json").read_text(encoding="utf-8"))
PROPOSED_BY_ID = {c["id"]:c for c in PROPOSAL["criteria"]}
if set(PROPOSED_BY_ID)!={c["id"] for c in RUBRIC["criteria"]} or sum(c["max"] for c in PROPOSED_BY_ID.values())!=100 or any(sum(a["max"] for a in c["aspects"])!=c["max"] for c in PROPOSED_BY_ID.values()):
    raise ValueError("La propuesta debe cubrir exactamente los siete criterios y sumar 100 puntos.")
TOPICS = {
    "modelo": r"nudos?|coordenadas?|apoyos?|conectividad|grados de libertad|peralte|triangul",
    "cargas": r"tributari|carga muerta|carga viva|fuerza nodal|cargas nodales|caso de viento|peso propio",
    "matrices": r"ensambl|matriz|rigidez|condici[oó]n de apoyo|mmult|minvers",
    "resultados": r"equilibrio|reaccion|desplazamiento|fuerza axial",
    "resistencia": r"deflexion|compresion|traccion|longitud no arriostrada|capacidad axial",
    "criticas": r"inversion de esfuerzos|levantamiento|succion|barra critica|cordon|diagonal|montante",
    "perfiles": r"alternativa|seleccion de perfil|peso propio|masa total|menor peso",
}
DATA = re.compile(r"[-+]?\d+(?:[.,]\d+)?\s*(?:kn(?:/m[²2]?)?|mm|cm|m(?:[²2])?|kg|mpa|%)\b|(?:nudo|barra|gdl)\s+[a-z]?\d+|formula visible\s*=\S+|\[\s*-?\d+\s*[,;]", re.I)
BALANCE = re.compile(r"equilibrio\s+(?:vertical|horizontal)\s*:\s*([+-]?\d+(?:[.,]\d+)?)\s*kN\s*([+-])\s*(\d+(?:[.,]\d+)?)\s*kN\s*([+-])\s*(\d+(?:[.,]\d+)?)\s*kN\s*=\s*([+-]?\d+(?:[.,]\d+)?)\s*kN", re.I)
STATUS = {"none":"Sin evidencia puntuable", "partial":"Evidencia parcial", "checked":"Comprobación reproducida", "error":"Discrepancia comprobada"}

def normalize(s):
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if not unicodedata.combining(c))

def tabular_balance(fragment):
    plain=normalize(fragment.text)
    return (fragment.location.startswith("Excel ·") and " | " in plain
            and re.search(r"equilibrio\s+(?:vertical|horizontal)\s*\(\s*kn\s*\)",plain) is not None
            and "formula visible =" in plain and equilibrium(fragment.text) is None)

def usable(grouped):
    return {cid:[f for f in hits if not tabular_balance(f)] for cid,hits in grouped.items()}

def candidates(fragments):
    selected = {}
    for crit in RUBRIC["criteria"]:
        cid = crit["id"]
        hits = []
        for fragment in fragments:
            plain = normalize(fragment.text)
            if re.search(TOPICS[cid], plain) and DATA.search(plain):
                hits.append(fragment)
        chosen=set()
        for part in PROPOSED_BY_ID[cid]["aspects"]:
            ranked=[]
            for i,fragment in enumerate(hits):
                state,_=assess(cid,part,fragment)
                if state!="pending":
                    ranked.append((5 if state=="error" else LEVEL[state],-i,fragment.id))
            chosen.update(row[2] for row in sorted(ranked,reverse=True)[:2])
        if cid=="resultados":
            chosen.update(f.id for f in hits if tabular_balance(f))
        selected[cid]=[f for f in hits if f.id in chosen]
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

LEVEL={"pending":0,"documented":1,"developed":2,"supported":3,"verified":4,"error":0}
PROCEDURE=re.compile(r"mediante|a partir de|se (?:calcul|obtuvo|ensambl|resolv|distribuy|compar)|multiplicando|aplicando|usando")
REASONING=re.compile(r"debido a|porque|por ser|se (?:adopt|elig|seleccion)|por lo tanto|por tanto")
CHECK_SOURCE=re.compile(r"contraste|comprob|independiente|residual|referencia|segunda (?:solucion|alternativa)")
OPERATION=re.compile(r"\d\s*(?:[a-z/²0-9]+)?\s*[×*/=+-]\s*[-+]?\d")
NODAL=re.compile(r"([-+]?\d+(?:[.,]\d+)?)\s*kN/m(?:²|2)\s*(?:×|\*|x)\s*(\d+(?:[.,]\d+)?)\s*m(?:²|2)\s*=\s*([-+]?\d+(?:[.,]\d+)?)\s*kN\b",re.I)

def numerical_control(cid,part,clause):
    if cid=="resultados" and part=="equilibrio":
        return equilibrium(clause)
    if cid=="cargas" and part=="reparto":
        plain=normalize(clause)
        if "tributari" in plain and re.search(r"(?:carga|fuerza) nodal",plain):
            m=NODAL.search(clause)
            if m:
                q,area,declared=(Decimal(n.replace(",",".")) for n in m.groups())
                if abs(q*area-declared)>Decimal("0.001"):
                    return False,f"El producto de la intensidad por el área tributaria da {q*area} kN. Se declararon {declared} kN."
                return True,"El producto de la intensidad por el área tributaria reproduce la fuerza nodal declarada."
    return None

def assess(cid,part,fragment):
    best,note="pending",None
    for clause in re.split(r";|(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ])|\s+\|\s+",fragment.text):
        plain=normalize(clause)
        hit=re.search(part["term"],plain)
        if not hit:
            continue
        nearby=plain[max(0,hit.start()-80):hit.end()+160]
        quantities={m.group(0).strip() for m in DATA.finditer(nearby)}
        if not quantities:
            continue
        if cid=="matrices" and part["id"]=="solucion" and not re.search(r"matriz|matricial|ensambl|partici|sistema reducido|mmult|minvers",plain):
            continue
        check=numerical_control(cid,part["id"],clause)
        if check is not None:
            if not check[0]:
                return "error",check[1]
            best,note="verified",check[1]
            continue
        state="documented"
        if len(quantities)>=2 and PROCEDURE.search(plain) and OPERATION.search(plain):
            state="supported" if REASONING.search(plain) and CHECK_SOURCE.search(plain) else "developed"
        if LEVEL[state]>LEVEL[best]:
            best=state
    return best,note

def proposed_points(criterion,fragments):
    breakdown,notes=[],[]
    for part in criterion["aspects"]:
        state,reference,reason="pending",None,None
        for f in fragments:
            found,note=assess(criterion["id"],part,f)
            if found=="error" or LEVEL[found]>LEVEL[state]:
                state,reference,reason=found,f.id,note
            if state=="error":
                break
        if reason:
            notes.append((state,reason))
        breakdown.append({"id":part["id"],"label":part["label"],"max":part["max"],
                          "points":part["max"]*LEVEL[state]/4,"state":state,"reference":reference})
    return breakdown,notes

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
        rule=PROPOSED_BY_ID[cid]
        for part in rule["aspects"]:
            for f in grouped[cid]:
                if f not in valid and assess(cid,part,f)[0] in ("error","verified"):
                    valid.append(f)
        breakdown,notes=proposed_points(rule,valid)
        state="partial" if any(a["state"]!="pending" for a in breakdown) else "none"
        if all(a["state"]=="verified" for a in breakdown):
            state="checked"
        if notes:
            notes.sort(key=lambda n:n[0]!="error")
            reason=" ".join(n for _,n in notes)+" Los demás apartados se evalúan por separado."
        unreadable=[f for f in grouped[cid] if cid=="resultados" and tabular_balance(f)][:2]
        if unreadable:
            explanation="Se leyó el equilibrio en varias celdas y una fórmula de rango. El extractor no reproduce ese control."
            reason=(reason+" "+explanation) if state!="none" else explanation
            valid.extend(f for f in unreadable if f not in valid)
        label="Control tabular no evaluable" if unreadable and state=="none" else STATUS[state]
        evidence = [{"id":f.id, "location":f.location, "quote":f.text[:240]} for f in valid]
        items.append({"id":cid, "label":crit["label"], "status":state, "statusLabel":label,
                      "reason":reason, "evidence":evidence, "next":crit["description"], "max":rule["max"],
                      "points":sum(a["points"] for a in breakdown), "aspects":breakdown})
    covered = sum(i["status"] != "none" for i in items)
    parts=[a for item in items for a in item["aspects"]]
    wrong=any(a["state"]=="error" for a in parts)
    checked=any(a["state"]=="verified" for a in parts)
    if not covered:
        global_mark = None
        note = "No hay evidencia puntuable en las partes visibles. Añada texto, celdas o una comprobación con unidades."
        if any(tabular_balance(f) for f in grouped["resultados"]):
            note="El libro contiene un control de equilibrio en varias celdas que el extractor no pudo verificar. No se puede estimar una nota con esa única evidencia."
    elif wrong:
        global_mark, note = "Desarrollo parcial con una discrepancia comprobada", "Revise el apartado con la discrepancia identificada y vuelva a contrastar su resultado."
    elif checked:
        global_mark, note = "Desarrollo parcial con una comprobación reproducida", "La comprobación respalda ese resultado. Revise la evidencia de los demás criterios."
    else:
        global_mark, note = "Desarrollo parcial documentado", "Se localizaron datos técnicos. Complete las comprobaciones indicadas por criterio."
    if covered == len(items):
        global_mark = "Siete criterios documentados con una discrepancia comprobada" if wrong else "Siete criterios documentados, pendientes de validación integral"
    pending_max=sum(a["max"] for i in items for a in i["aspects"] if a["state"]=="pending")
    confirmed=sum(Decimal(str(i["points"])) for i in items)
    open_within=sum(a["max"]-a["points"] for a in parts if a["state"] in ("documented","developed","supported"))
    if covered:
        global_mark=format(confirmed.normalize(),"f").replace(".",",")+" / 100 · mínimo demostrado"
    scale="Ponderación propuesta para el piloto. Un dato pertinente aporta el 25 % del apartado, un desarrollo documentado el 50 % y un resultado fundamentado el 75 %. El 100 % exige reproducir el control aplicable. Una discrepancia comprobada afecta a ese apartado. La evidencia ausente queda pendiente. La nota provisional mantiene el denominador de 100."
    return {"rubric":RUBRIC["version"], "proposal":PROPOSAL["version"], "official":False, "global":global_mark, "globalNote":note,
            "coverage":{"evaluated":covered, "total":len(items), "pendingPoints":pending_max,"openWithinObserved":open_within}, "criteria":items,
            "scale":scale}

def review(fragments, select=mock_select):
    grouped = candidates(fragments)
    candidates_for_provider=usable(grouped)
    return assemble(grouped,select(candidates_for_provider) if any(candidates_for_provider.values()) else {})
