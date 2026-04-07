/** Placeholder page component for routes not yet implemented */
export function PlaceholderPage({ name }: { name: string }) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-text-dark mb-2">{name}</h2>
        <p className="text-text-muted">This page will be implemented in a future phase.</p>
      </div>
    </div>
  )
}
