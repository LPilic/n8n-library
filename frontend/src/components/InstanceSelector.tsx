import { useEffect } from 'react'
import { useInstanceStore } from '@/stores/instance'
import { Server } from 'lucide-react'
import CustomSelect from '@/components/CustomSelect'

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
      <CustomSelect
        value={String(activeId ?? '')}
        onChange={(v) => setActive(Number(v))}
        options={instances.map((inst) => ({
          value: String(inst.id),
          label: `${inst.name}${inst.is_default ? ' (default)' : ''}`,
        }))}
        size="sm"
        triggerClassName="text-[12px] font-medium px-2 py-1 rounded-md max-w-[160px]"
      />
      {active?.color && (
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: active.color }} />
      )}
    </div>
  )
}
