import { AngledShotsPage } from '@/components/angled-shots/AngledShotsPage'

export default async function CategoryStepPage({
  params,
}: {
  params: Promise<{ categoryId: string; step: string }>
}) {
  const { categoryId, step } = await params

  // Route to appropriate page based on step
  if (step === 'angled-shots') {
    return <AngledShotsPage categoryId={categoryId} />
  }

  // Placeholder for other steps
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight capitalize">
          {step.replace(/-/g, ' ')}
        </h1>
        <p className="text-muted-foreground mt-1">Category ID: {categoryId}</p>
      </div>
      <div className="rounded-lg border border-dashed p-12 text-center">
        <p className="text-muted-foreground">
          This feature will be implemented in upcoming phases
        </p>
      </div>
    </div>
  )
}
