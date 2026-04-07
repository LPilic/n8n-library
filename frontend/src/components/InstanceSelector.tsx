import { useEffect } from 'react'
import { useInstanceStore } from '@/stores/instance'
import { Server } from 'lucide-react'

export function InstanceSelector() {
  const { instances, activeId, loaded, load, setActive } = useInstanceStore()

  useEffect(() => {
    if (!loaded) load()
  }, [loaded, load])

  // Don't show if only 1 instance or not loaded
  if (!loaded || instances.length <= 1) return null

  const active = instances.find((i) => i.id === activeId)

  return (
    <div className="flex items-center gap-1.5 mr-2">
      <Server size={14} className="text-text-xmuted shrink-0" />
      <select
        value={activeId ?? ''}
        onChange={(e) => setActive(Number(e.target.value))}
        className="text-[12px] font-medium px-2 py-1 border border-input-border rounded-md bg-input-bg text-text-dark max-w-[160px] truncate"
      >
        {instances.map((inst) => (
          <option key={inst.id} value={inst.id}>
            {inst.name}{inst.is_default ? ' (default)' : ''}
          </option>
        ))}
      </select>
      {active?.color && (
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: active.color }} />
      )}
    </div>
  )
}
