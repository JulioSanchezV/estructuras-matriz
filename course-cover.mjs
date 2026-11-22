export function courseCover(section, chapters) {
  const model = chapters.find(chapter => chapter.id === 'resortes')?.sections.find(item => item.id === 'modelo');
  const diagram = model?.body.match(/<svg\b[\s\S]*?<\/svg>/)?.[0] || '';
  return `<section class="course-cover" id="section-${section.id}">
    <div class="course-cover-copy">
      <p class="course-kicker">${section.tag}</p>
      <h1>${section.title}</h1>
      <p class="course-lead">${section.lead}</p>
      <div class="cover-links"><a class="course-action" href="#resortes/modelo?ruta=understand">Estudiar el ejemplo 11.1</a><a href="./banco.html#resortes">Practicar con resortes</a></div>
    </div>
    <figure class="course-plate"><figcaption><span>Ejemplo 11.1</span><strong>{F} = [K]{δ}</strong></figcaption>
      <div class="course-plot">${diagram}</div><p>Dos resortes en serie. Cargas de +50 y −20 kN. Nudo 3 fijo.</p>
    </figure>
  </section>
  <nav class="course-route" aria-label="Recorrido de estudio">
    <a href="#resortes/modelo?ruta=understand"><strong>Estudiar el modelo</strong><span>Apoyos, cargas y grados de libertad</span></a>
    <a href="./banco.html#resortes"><strong>Resolver una variante</strong><span>Enunciado, hoja libre y comprobación</span></a>
    <a href="./calculadora.html#ensamblaje"><strong>Examinar la matriz</strong><span>Aportes de cada elemento a la matriz global</span></a>
  </nav>`;
}
