"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

// A select for plain GET filter forms: the value is submitted under `name`.
export function FilterSelect({
  id,
  name,
  defaultValue,
  options,
}: {
  id: string
  name: string
  defaultValue: string
  options: { value: string; label: string }[]
}) {
  return (
    <Select name={name} defaultValue={defaultValue} items={options}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
