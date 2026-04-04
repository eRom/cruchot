// ---------------------------------------------------------------------------
// OneiricService — Consolidation onirique (stub, implementation in later task)
// ---------------------------------------------------------------------------

class OneiricService {
  async consolidate(_trigger: 'scheduled' | 'manual' | 'quit'): Promise<void> {
    // TODO: implement in a later task
    console.log('[OneiricService] consolidate() stub called with trigger:', _trigger)
  }
}

export const oneiricService = new OneiricService()
