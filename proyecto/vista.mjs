export function renderReview(host, report) {
  const node = (tag, text) => { const el = document.createElement(tag); el.textContent = text; return el; };
  host.replaceChildren();
  const num = n => String(n).replace('.',',');
  const states = {pending:'Pendiente de evidencia',documented:'Indicio cuantificado',developed:'Desarrollo documentado',supported:'Resultado fundamentado',verified:'Comprobación reproducida',error:'Discrepancia comprobada'};
  const heading = node('h3', report.global ? 'Nota global provisional · ' + report.global : 'Sin nota estimable');
  host.append(heading, node('p', report.globalNote), node('p', 'Criterios con evidencia: ' + report.coverage.evaluated + ' de ' + report.coverage.total + '. Peso de apartados pendientes: ' + num(report.coverage.pendingPoints) + ' de 100 puntos. En apartados parcialmente documentados quedan ' + num(report.coverage.openWithinObserved) + ' puntos por sustentar.'));
  const list = document.createElement('ol');
  for (const item of report.criteria) {
    const row = document.createElement('li');
    row.append(node('strong', item.label + ' · ' + item.statusLabel), node('p', item.reason));
    if(item.status!=='none') row.append(node('p','Crédito demostrado: ' + num(item.points) + ' de ' + item.max + ' puntos.'));
    for (const evidence of item.evidence) row.append(node('cite', evidence.location + ' — «' + evidence.quote + '»'));
    const detail=node('details',''), summary=node('summary','Ver desglose de '+item.max+' puntos'), breakdown=node('ul','');
    for(const part of item.aspects) {
      const evidence=item.evidence.find(e=>e.id===part.reference);
      breakdown.append(node('li',part.label+' · '+states[part.state]+' · '+(part.state==='pending'?part.max+' puntos pendientes':num(part.points)+' de '+part.max+' puntos')+(evidence?' · '+evidence.location:'')));
    }
    detail.append(summary,breakdown);
    row.append(node('p', 'Siguiente paso: ' + item.next), detail); list.append(row);
  }
  host.append(list, node('p',report.scale), node('small','Rúbrica ' + report.rubric + ' · Ponderación ' + report.proposal + ' · Retroalimentación formativa, sin registro de nota oficial.'));
  host.focus();
}
