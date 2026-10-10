import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { TAG_KIND_LABELS } from '../../domain/tags'
import type { TagKind } from '../../domain/types'

export type TagKindSelection = TagKind | 'all'

interface TagKindFilterProps {
  kinds: readonly TagKind[]
  value: TagKindSelection
  onChange: (value: TagKindSelection) => void
}

export function TagKindFilter({ kinds, value, onChange }: TagKindFilterProps) {
  const options = [
    { value: 'all' as const, label: 'All' },
    ...kinds.map((kind) => ({ value: kind, label: TAG_KIND_LABELS[kind] })),
  ]
  return (
    <SegmentedControl
      label="Filter tags by kind"
      options={options}
      value={value}
      onChange={onChange}
    />
  )
}
