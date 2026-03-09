import { useState, useEffect, useRef } from 'react'
import { FolderOpen, Plus, ChevronDown, X } from 'lucide-react'
import { useProjectsStore, Project } from '../../stores/projects.store'

export function ProjectSelector() {
  const { projects, activeProjectId, setProjects, setActiveProject, addProject } =
    useProjectsStore()
  const [isOpen, setIsOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadProjects()
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setIsCreating(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function loadProjects() {
    try {
      const list = await window.api.getProjects()
      setProjects(list)
    } catch (err) {
      console.error('Failed to load projects:', err)
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return
    try {
      const project = await window.api.createProject({ name: newName.trim() })
      addProject(project)
      setActiveProject(project.id)
      setNewName('')
      setIsCreating(false)
      setIsOpen(false)
    } catch (err) {
      console.error('Failed to create project:', err)
    }
  }

  function handleSelect(id: string | null) {
    setActiveProject(id)
    setIsOpen(false)
  }

  const activeProject = projects.find((p) => p.id === activeProjectId)

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border border-border hover:bg-accent transition-colors"
      >
        <FolderOpen className="w-4 h-4 text-muted-foreground" />
        <span className="truncate max-w-[150px]">
          {activeProject ? activeProject.name : 'Aucun projet'}
        </span>
        <ChevronDown className="w-3 h-3 text-muted-foreground" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-popover border border-border rounded-md shadow-lg z-50">
          <div className="p-1">
            <button
              onClick={() => handleSelect(null)}
              className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-accent transition-colors ${
                !activeProjectId ? 'bg-accent' : ''
              }`}
            >
              Aucun projet
            </button>

            {projects.map((project) => (
              <button
                key={project.id}
                onClick={() => handleSelect(project.id)}
                className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-accent transition-colors flex items-center gap-2 ${
                  activeProjectId === project.id ? 'bg-accent' : ''
                }`}
              >
                {project.color && (
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: project.color }}
                  />
                )}
                <span className="truncate">{project.name}</span>
              </button>
            ))}
          </div>

          <div className="border-t border-border p-1">
            {isCreating ? (
              <div className="flex items-center gap-1 p-1">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate()
                    if (e.key === 'Escape') setIsCreating(false)
                  }}
                  placeholder="Nom du projet..."
                  className="flex-1 px-2 py-1 text-sm bg-transparent border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
                  autoFocus
                />
                <button
                  onClick={() => setIsCreating(false)}
                  className="p-1 hover:bg-accent rounded"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsCreating(true)}
                className="w-full text-left px-3 py-2 text-sm rounded hover:bg-accent transition-colors flex items-center gap-2 text-muted-foreground"
              >
                <Plus className="w-4 h-4" />
                Nouveau projet
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
