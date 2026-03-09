import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import fr from '@/locales/fr.json'
import en from '@/locales/en.json'

const detectLanguage = (): string => {
  const lang = navigator.language.split('-')[0]
  return ['fr', 'en'].includes(lang) ? lang : 'fr'
}

i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en }
  },
  lng: detectLanguage(),
  fallbackLng: 'fr',
  supportedLngs: ['fr', 'en'],
  interpolation: {
    escapeValue: false
  }
})

export default i18n
