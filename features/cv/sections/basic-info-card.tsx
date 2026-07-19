"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useEditorStore } from "../editor-store"

export function BasicInfoCard() {
  const fullName = useEditorStore((s) => s.draft?.fullName ?? "")
  const email = useEditorStore((s) => s.draft?.email ?? "")
  const phone = useEditorStore((s) => s.draft?.phone ?? "")
  const location = useEditorStore((s) => s.draft?.location ?? "")
  const summary = useEditorStore((s) => s.draft?.summary ?? "")
  const updateSection = useEditorStore((s) => s.updateSection)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Información básica</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fullName">Nombre completo</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => updateSection({ fullName: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => updateSection({ email: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Teléfono</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => updateSection({ phone: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="location">Ubicación</Label>
            <Input
              id="location"
              value={location}
              onChange={(e) => updateSection({ location: e.target.value })}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="summary">Resumen</Label>
          <Textarea
            id="summary"
            rows={4}
            value={summary}
            onChange={(e) => updateSection({ summary: e.target.value })}
          />
        </div>
      </CardContent>
    </Card>
  )
}
