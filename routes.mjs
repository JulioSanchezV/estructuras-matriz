/** Route selection is shared by the reader and deterministic tests. */
export const ROUTES = ['apply', 'understand'];
// Keep previously shared links useful after moving prerequisite sections.
export const LOCATION_ALIASES = Object.freeze({
  'transformacion/algebra-producto':'resortes/algebra-producto',
  'transformacion/algebra-transpuesta':'resortes/algebra-transpuesta',
  'transformacion/algebra-inversa':'resortes/algebra-inversa',
  'transformacion/algebra-particion':'cargas/particion-general'
});
export function sectionsForChapter(chapter, route = 'apply') {
  const ids = chapter.routes?.[route];
  if (!ids) return chapter.sections;
  return ids.map(id => chapter.sections.find(section => section.id === id)).filter(Boolean);
}
export function resolveLocation(chapters, hash, currentRoute = 'apply') {
  const [path, query = ''] = String(hash).replace(/^#/, '').split('?');
  const [chapterId, sectionId] = (LOCATION_ALIASES[path] || path).split('/');
  const chapter = chapters.find(item => item.id === chapterId) || chapters[0];
  const requestedRoute = new URLSearchParams(query).get('ruta');
  let route = ROUTES.includes(requestedRoute) ? requestedRoute : currentRoute;
  if (!ROUTES.includes(route)) route = 'apply';
  let sections = sectionsForChapter(chapter, route);
  if (sectionId && !sections.some(section => section.id === sectionId)) {
    const alternate = ROUTES.find(candidate => sectionsForChapter(chapter, candidate).some(section => section.id === sectionId));
    if (alternate) { route = alternate; sections = sectionsForChapter(chapter, route); }
  }
  return { chapter: chapter.id, route, step: Math.max(0, sections.findIndex(section => section.id === sectionId)) };
}
