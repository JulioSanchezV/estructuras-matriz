export function renderReview(host, report) {
  const node = (tag, text) => { const el = document.createElement(tag); el.textContent = text; return el; };
  host.replaceChildren();
  const heading = node('h3', report.global ? 'Nota global provisional · ' + report.global : 'Sin nota estimable');
  host.append(heading, node('p', report.globalNote), node('p', 'Criterios con evidencia: ' + report.coverage.evaluated + ' de ' + report.coverage.total + '.'));
  const list = document.createElement('ol');
  for (const item of report.criteria) {
    const row = document.createElement('li');
    row.append(node('strong', item.label + ' · ' + item.statusLabel), node('p', item.reason));
    for (const evidence of item.evidence) row.append(node('cite', evidence.location + ' — «' + evidence.quote + '»'));
    row.append(node('p', 'Siguiente paso: ' + item.next)); list.append(row);
  }
  host.append(list, node('p',report.scale), node('small','Rúbrica ' + report.rubric + ' · Retroalimentación formativa, sin registro de nota oficial.'));
  host.focus();
}
