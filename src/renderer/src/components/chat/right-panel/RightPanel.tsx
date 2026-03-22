import { ParamsSection } from './ParamsSection'
import { OptionsSection } from './OptionsSection'
import { McpSection } from './McpSection'
import { ToolsSection } from './ToolsSection'

interface RightPanelProps {
  onPromptInsert: (text: string) => void
  inputContent: string
  onOptimizedPrompt: (text: string) => void
}

export function RightPanel({ onPromptInsert, inputContent, onOptimizedPrompt }: RightPanelProps) {
  return (
    <div className="flex h-full w-[260px] shrink-0 flex-col gap-3 border-l border-border/40 bg-background overflow-y-auto p-3">
      <ParamsSection />
      <OptionsSection onPromptInsert={onPromptInsert} />
      <McpSection />
      <ToolsSection inputContent={inputContent} onOptimizedPrompt={onOptimizedPrompt} />
    </div>
  )
}
