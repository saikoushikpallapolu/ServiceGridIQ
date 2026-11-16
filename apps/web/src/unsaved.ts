import { useEffect, useRef } from 'react';

const dirtySources = new Set<symbol>();
window.addEventListener('beforeunload', (event) => { if (dirtySources.size) { event.preventDefault(); event.returnValue = ''; } });
export function useUnsavedChanges(dirty: boolean) {
  const source = useRef(Symbol('unsaved-form'));
  useEffect(() => { const id = source.current; if (dirty) dirtySources.add(id); else dirtySources.delete(id); return () => { dirtySources.delete(id); }; }, [dirty]);
}
export const confirmDiscard = () => !dirtySources.size || window.confirm('Discard unsaved changes before leaving this workspace?');
export const clearUnsavedChanges = () => dirtySources.clear();
