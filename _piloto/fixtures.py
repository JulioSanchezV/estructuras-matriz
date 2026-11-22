"""Generate small fictitious Office packages for isolated tests. No student input."""
from html import escape
from io import BytesIO
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
from office import A, CT, P, PKG, R, TYPES, W, X

WORD=["Modelo de la cercha. Nodo 1 en x = 0 m; nodo 2 en x = 3 m.",
      "Equilibrio vertical: 30 kN + 20 kN - 50 kN = 0 kN."]
EXCEL=["Carga nodal del área tributaria: 12 kN.","Equilibrio vertical: 30 kN + 20 kN - 50 kN = 4 kN."]
SLIDE=["Compresión de la diagonal: 24 kN. Longitud no arriostrada declarada: 2 m.",
       "Alternativa A con masa total de 390 kg. La comparación con otra alternativa sigue pendiente."]

def rel(entries):
    return '<Relationships xmlns="'+PKG+'">' + ''.join(f'<Relationship Id="{i}" Type="{R}/{kind}" Target="{path}"/>' for i,kind,path in entries) + '</Relationships>'

def sample(kind, empty=False, *, lines=None, structured_balance=False):
    main,mime=TYPES[kind]
    parts={"_rels/.rels":rel([("rId1","officeDocument",main)])}
    types={main:mime}
    if kind=="docx":
        lines=lines if lines is not None else (["Portada de ejemplo"] if empty else WORD)
        paras="".join("<w:p><w:r><w:t>"+escape(line)+"</w:t></w:r></w:p>" for line in lines)
        parts[main]=f'<w:document xmlns:w="{W}"><w:body>{paras}<w:sectPr/></w:body></w:document>'
    elif kind=="xlsx":
        parts[main]=f'<workbook xmlns="{X}" xmlns:r="{R}"><sheets><sheet name="Ejemplo" sheetId="1" r:id="rId1"/></sheets></workbook>'
        parts["xl/_rels/workbook.xml.rels"]=rel([("rId1","worksheet","worksheets/sheet1.xml"),("rId2","sharedStrings","sharedStrings.xml")])
        parts["xl/sharedStrings.xml"]=f'<sst xmlns="{X}" count="1" uniqueCount="1"><si><t>{escape(EXCEL[0])}</t></si></sst>'
        parts["xl/worksheets/sheet1.xml"]=f'<worksheet xmlns="{X}"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>{escape(EXCEL[1])}</t></is></c><c r="B2"><f>30+20-50</f><v>0</v></c></row><row r="3" hidden="1"><c r="A3" t="inlineStr"><is><t>OCULTO-DE-PRUEBA</t></is></c></row></sheetData></worksheet>'
        if lines is not None:
            cells="".join(f'<row r="{i}"><c r="A{i}" t="inlineStr"><is><t>{escape(t)}</t></is></c></row>' for i,t in enumerate(lines,1))
            parts["xl/worksheets/sheet1.xml"]=f'<worksheet xmlns="{X}"><sheetData>{cells}</sheetData></worksheet>'
        if structured_balance:
            cells='<c r="A2" t="inlineStr"><is><t>Equilibrio vertical (kN)</t></is></c><c r="B2"><v>30</v></c><c r="C2"><v>20</v></c><c r="D2"><v>-50</v></c><c r="E2"><f>SUM(B2:D2)</f></c>'
            parts["xl/worksheets/sheet1.xml"]=f'<worksheet xmlns="{X}"><sheetData><row r="2">{cells}</row></sheetData></worksheet>'
        types["xl/worksheets/sheet1.xml"]="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"
        types["xl/sharedStrings.xml"]="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"
    elif kind=="pptx":
        parts[main]=f'<p:presentation xmlns:p="{P}" xmlns:r="{R}"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>'
        parts["ppt/_rels/presentation.xml.rels"]=rel([("rId1","slide","slides/slide1.xml")])
        paragraphs="".join("<a:p><a:r><a:t>"+escape(t)+"</a:t></a:r></a:p>" for t in (SLIDE if lines is None else lines))
        parts["ppt/slides/slide1.xml"]=f'<p:sld xmlns:p="{P}" xmlns:a="{A}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name="Grupo"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Texto"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>{paragraphs}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>'
        types["ppt/slides/slide1.xml"]="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"
    else:
        raise ValueError("Formato de prueba desconocido.")
    overrides="".join(f'<Override PartName="/{p}" ContentType="{t}"/>' for p,t in types.items())
    parts["[Content_Types].xml"]=f'<Types xmlns="{CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>{overrides}</Types>'
    data=BytesIO()
    with ZipFile(data,"w",ZIP_DEFLATED) as arc:
        for p,value in parts.items():
            arc.writestr(p,'<?xml version="1.0" encoding="UTF-8"?>'+value)
    return data.getvalue()

if __name__=="__main__":
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument("directorio",type=Path)
    dest=parser.parse_args().directorio
    dest.mkdir(parents=True,exist_ok=True)
    for kind in TYPES:
        (dest/("muestra."+kind)).write_bytes(sample(kind))
