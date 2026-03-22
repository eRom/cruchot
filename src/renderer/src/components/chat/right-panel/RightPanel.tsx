import { ParamsSection } from './ParamsSection'
import { OptionsSection } from './OptionsSection'
import { McpSection } from './McpSection'
import { RemoteSection } from './RemoteSection'
import { ToolsSection } from './ToolsSection'

interface RightPanelProps {
  onPromptInsert: (text: string) => void
  onOptimizedPrompt: (text: string) => void
}

export function RightPanel({ onPromptInsert, onOptimizedPrompt }: RightPanelProps) {
  return (
    <div className="flex h-full w-[300px] shrink-0 flex-col gap-3 bg-background overflow-y-auto p-3">
      <ParamsSection />
      <OptionsSection />
      <McpSection />
      <ToolsSection onOptimizedPrompt={onOptimizedPrompt} onPromptInsert={onPromptInsert} />
      <RemoteSection />
    </div>
  )
}
