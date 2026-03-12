function viewsKey(id: string) {
  return `mv_views_${id}`;
}

export function getViews(id: string) {
  return parseInt(localStorage.getItem(viewsKey(id)) || "0", 10);
}

export function incrementViews(id: string) {
  const next = getViews(id) + 1;
  localStorage.setItem(viewsKey(id), String(next));
  return next;
}

export function resetViews(dishIds: string[]) {
  for (const id of dishIds) {
    localStorage.removeItem(viewsKey(id));
  }
}
