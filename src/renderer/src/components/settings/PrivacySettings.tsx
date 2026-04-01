import { ExternalLink, Shield, ShieldCheck, ShieldAlert, Server, HardDrive } from 'lucide-react'

type PrivacyLevel = 'safe' | 'good' | 'caution'

interface ProviderPrivacy {
  name: string
  level: PrivacyLevel
  retention: string
  training: string
  note?: string
  policyUrl: string
}

const PROVIDERS: ProviderPrivacy[] = [
  {
    name: 'Anthropic',
    level: 'safe',
    retention: '30 jours (safety)',
    training: 'Non — opt-in uniquement',
    policyUrl: 'https://www.anthropic.com/legal/privacy'
  },
  {
    name: 'OpenAI',
    level: 'safe',
    retention: '30 jours (abuse monitoring)',
    training: 'Non — opt-in uniquement',
    policyUrl: 'https://openai.com/policies/row-privacy-policy/'
  },
  {
    name: 'Google',
    level: 'safe',
    retention: 'Transitoire',
    training: 'Non (API payante)',
    policyUrl: 'https://ai.google.dev/gemini-api/terms'
  },
  {
    name: 'Mistral AI',
    level: 'safe',
    retention: 'Aucune',
    training: 'Non',
    policyUrl: 'https://legal.mistral.ai/terms/privacy-policy'
  },
  {
    name: 'xAI',
    level: 'good',
    retention: '30 jours',
    training: 'Non par defaut',
    policyUrl: 'https://x.ai/legal/privacy-policy'
  },
  {
    name: 'Perplexity',
    level: 'good',
    retention: 'Aucune',
    training: 'Non',
    policyUrl: 'https://www.perplexity.ai/hub/legal/privacy-policy'
  },
  {
    name: 'Alibaba Qwen',
    level: 'caution',
    retention: 'Non specifie',
    training: 'Politique moins claire',
    note: 'Juridiction chinoise',
    policyUrl: 'https://www.alibabacloud.com/help/faq-detail/42425.htm'
  },
  {
    name: 'DeepSeek',
    level: 'caution',
    retention: 'Non specifie',
    training: 'Politique moins claire',
    note: 'Juridiction chinoise — donnees potentiellement stockees en Chine',
    policyUrl: 'https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html'
  },
  {
    name: 'OpenRouter',
    level: 'good',
    retention: 'Logs transitoires',
    training: 'Depend du provider sous-jacent',
    note: 'Proxy — la politique depend du modele choisi',
    policyUrl: 'https://openrouter.ai/privacy'
  },
]

const LOCAL_PROVIDERS = ['LM Studio', 'Ollama']

const levelConfig: Record<PrivacyLevel, { icon: typeof ShieldCheck; color: string; label: string }> = {
  safe: { icon: ShieldCheck, color: 'text-emerald-500', label: 'Excellent' },
  good: { icon: Shield, color: 'text-primary', label: 'Bon' },
  caution: { icon: ShieldAlert, color: 'text-amber-500', label: 'Vigilance' },
}

export function PrivacySettings() {
  return (
    <section className="space-y-5">
      <h2 className="text-sm font-medium text-foreground">Confidentialite</h2>

      {/* Architecture locale */}
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
        <div className="flex items-start gap-3">
          <HardDrive className="mt-0.5 size-5 text-emerald-500" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Vos donnees restent sur votre machine</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Conversations, fichiers et cles API sont stockes localement (SQLite + Keychain).
              Aucun serveur intermediaire — les appels API vont directement de votre machine
              vers le provider. Aucune telemetrie, aucun tracking.
            </p>
          </div>
        </div>
      </div>

      {/* API vs Interface web */}
      <div className="rounded-lg border border-border/60 p-4">
        <div className="flex items-start gap-3">
          <Server className="mt-0.5 size-5 text-muted-foreground" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">API vs Interface web</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Cette application utilise les <span className="font-medium text-foreground">API payantes</span> des
              providers, dont les conditions de confidentialite sont bien plus strictes que
              les interfaces web gratuites (ChatGPT, Gemini, etc.).
              Via API, vos donnees ne sont <span className="font-medium text-foreground">jamais</span> utilisees
              pour l&apos;entrainement des modeles, sauf consentement explicite.
            </p>
          </div>
        </div>
      </div>

      {/* Providers cloud */}
      <div className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Providers cloud
        </h3>
        <div className="space-y-1.5">
          {PROVIDERS.map((provider) => {
            const config = levelConfig[provider.level]
            const Icon = config.icon
            return (
              <div
                key={provider.name}
                className="rounded-lg border border-border/60 p-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Icon className={`size-4 ${config.color}`} />
                    <span className="text-sm font-medium text-foreground">{provider.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      provider.level === 'safe'
                        ? 'bg-emerald-500/10 text-emerald-500'
                        : provider.level === 'good'
                          ? 'bg-primary/10 text-primary'
                          : 'bg-amber-500/10 text-amber-500'
                    }`}>
                      {config.label}
                    </span>
                  </div>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      window.open(provider.policyUrl)
                    }}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                    title="Politique de confidentialite"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 pl-[26px]">
                  <p className="text-xs text-muted-foreground">
                    <span className="text-foreground/60">Retention :</span> {provider.retention}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <span className="text-foreground/60">Entrainement :</span> {provider.training}
                  </p>
                </div>
                {provider.note && (
                  <p className="mt-1 pl-[26px] text-[11px] italic text-muted-foreground">
                    {provider.note}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Providers locaux */}
      <div className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Providers locaux
        </h3>
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="size-4 text-emerald-500" />
            <span className="text-sm font-medium text-foreground">
              {LOCAL_PROVIDERS.join(' & ')}
            </span>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
              100% local
            </span>
          </div>
          <p className="mt-1.5 pl-[26px] text-xs text-muted-foreground">
            Zero risque — le modele tourne entierement sur votre machine.
            Aucune donnee ne quitte votre ordinateur.
          </p>
        </div>
      </div>

      {/* Footer */}
      <p className="text-[11px] leading-relaxed text-muted-foreground/60">
        Ces informations refletent les politiques API connues a la date de mars 2026.
        Consultez les liens ci-dessus pour les conditions a jour de chaque provider.
      </p>
    </section>
  )
}
