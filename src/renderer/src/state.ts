import { useEffect, useState } from 'react'
import type { Command, Snapshot } from '../../shared/project'
export function useProject() {
  const [snapshot, setSnapshot] = useState<Snapshot>()
  const [error, setError] = useState('')
  function accept(next: Snapshot) { setSnapshot(old => !old || next.revision >= old.revision ? next : old) }
  useEffect(() => {
    const unsubscribe = window.editor.onSnapshot(accept)
    window.editor.getSnapshot().then(accept).catch(e => setError(String(e.message)))
    return unsubscribe
  }, [])
  async function dispatch(command: Command): Promise<Snapshot | undefined> {
    try { const next = await window.editor.dispatch(command); accept(next); setError(''); return next }
    catch (e) { setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : String(e)) }
  }
  return { snapshot, dispatch, error, setError }
}
export type Dispatch = ReturnType<typeof useProject>['dispatch']
