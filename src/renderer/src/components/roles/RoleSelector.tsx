import { useState, useEffect, useRef } from 'react'
import { UserCircle, ChevronDown, X } from 'lucide-react'
import { useRolesStore } from '../../stores/roles.store'

export function RoleSelector() {
  const { roles, activeRoleId, setRoles, setActiveRole } = useRolesStore()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadRoles()
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function loadRoles() {
    try {
      const list = await window.api.getRoles()
      setRoles(list)
    } catch (err) {
      console.error('Failed to load roles:', err)
    }
  }

  function handleSelect(id: string | null) {
    setActiveRole(id)
    setIsOpen(false)
  }

  const activeRole = roles.find((r) => r.id === activeRoleId)

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border border-border hover:bg-accent transition-colors"
      >
        <UserCircle className="w-4 h-4 text-muted-foreground" />
        <span className="truncate max-w-[150px]">
          {activeRole ? activeRole.name : 'Aucun rôle'}
        </span>
        <ChevronDown className="w-3 h-3 text-muted-foreground" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-popover border border-border rounded-md shadow-lg z-50">
          <div className="p-1">
            <button
              onClick={() => handleSelect(null)}
              className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-accent transition-colors ${
                !activeRoleId ? 'bg-accent' : ''
              }`}
            >
              Aucun rôle
            </button>

            {roles.filter((r) => r.isBuiltin).length > 0 && (
              <div className="px-3 py-1 text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Rôles intégrés
              </div>
            )}

            {roles
              .filter((r) => r.isBuiltin)
              .map((role) => (
                <button
                  key={role.id}
                  onClick={() => handleSelect(role.id)}
                  className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-accent transition-colors ${
                    activeRoleId === role.id ? 'bg-accent' : ''
                  }`}
                >
                  <div className="font-medium">{role.name}</div>
                  {role.description && (
                    <div className="text-xs text-muted-foreground truncate">
                      {role.description}
                    </div>
                  )}
                </button>
              ))}

            {roles.filter((r) => !r.isBuiltin).length > 0 && (
              <>
                <div className="px-3 py-1 text-xs text-muted-foreground font-medium uppercase tracking-wider mt-1">
                  Personnalisés
                </div>
                {roles
                  .filter((r) => !r.isBuiltin)
                  .map((role) => (
                    <button
                      key={role.id}
                      onClick={() => handleSelect(role.id)}
                      className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-accent transition-colors ${
                        activeRoleId === role.id ? 'bg-accent' : ''
                      }`}
                    >
                      <div className="font-medium">{role.name}</div>
                      {role.description && (
                        <div className="text-xs text-muted-foreground truncate">
                          {role.description}
                        </div>
                      )}
                    </button>
                  ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
