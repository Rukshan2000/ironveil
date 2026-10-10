/**
 * Groq API key for Kestrel's chat orders, for deploys that can't set environment variables. Paste the key between the
 * quotes. A VITE_GROQ_API_KEY env var, when present, still wins. Anyone who loads the game can read this key from the
 * bundle, so keep a spend limit on it and rotate it if it leaks. Empty = Kestrel uses the offline keyword orders.
 */
const PASTED_KEY = ''

export const GROQ_API_KEY: string | undefined = (import.meta.env.VITE_GROQ_API_KEY as string | undefined) || PASTED_KEY || undefined
