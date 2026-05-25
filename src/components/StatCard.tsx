interface StatCardProps {
  value: number | string
  label: string
}

export function StatCard({ value, label }: StatCardProps) {
  return (
    <div className="bg-treeSurface rounded-xl border border-treeBorder p-4 flex flex-col items-center justify-center min-h-[80px] shadow-sm">
      <span className="text-3xl font-bold text-primary leading-none">{value}</span>
      <span className="text-xs text-treeTextSec mt-1 text-center font-medium uppercase tracking-wide">
        {label}
      </span>
    </div>
  )
}
