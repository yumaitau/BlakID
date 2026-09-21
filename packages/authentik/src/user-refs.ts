/** authentik group membership expects integer PKs when the id is numeric. */
export function authentikUserRef(id: string): number | string {
  if (/^\d+$/.test(id)) return Number(id);
  return id;
}

export function authentikUserRefs(ids: string[]): Array<number | string> {
  return ids.map(authentikUserRef);
}
