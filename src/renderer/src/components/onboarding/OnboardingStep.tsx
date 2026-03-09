interface OnboardingStepProps {
  title: string
  description: string
  children: React.ReactNode
  stepNumber: number
  totalSteps: number
}

export function OnboardingStep({
  title,
  description,
  children,
  stepNumber,
  totalSteps
}: OnboardingStepProps) {
  return (
    <div className="flex flex-col items-center gap-6">
      {/* Step indicator dots */}
      <div className="flex gap-2">
        {Array.from({ length: totalSteps }, (_, i) => (
          <div
            key={i}
            className={`size-2 rounded-full transition-colors ${
              i + 1 === stepNumber
                ? 'bg-primary'
                : i + 1 < stepNumber
                  ? 'bg-primary/40'
                  : 'bg-muted-foreground/20'
            }`}
          />
        ))}
      </div>

      {/* Header */}
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>

      {/* Content */}
      <div className="w-full">{children}</div>
    </div>
  )
}
