import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { LEGACY_LABEL_TABLES, LEGACY_LABEL_RPCS } from './label-scope'
import type { LabelScope } from './label-scope'

// Somente depois de adminDatabase(): não muda a autorização do usuário.
export function scopedLabelDatabase(db: SupabaseClient, scope: LabelScope = 'current'): SupabaseClient {
  if (scope === 'current') return db
  if (scope !== 'legacy') throw new Error('LABEL_SCOPE')
  return new Proxy(db, {
    get(target, property) {
      if (property === 'from') return (table: string) => target.from(LEGACY_LABEL_TABLES[table] || table)
      if (property === 'rpc') return (name: string, args: Record<string, unknown>) => {
        if (!LEGACY_LABEL_RPCS.includes(name)) throw new Error('LABEL_SCOPE_RPC')
        return target.rpc(name.replace('serenity_label_', 'serenity_legacy_label_') + '_v1', args)
      }
      const value = Reflect.get(target, property)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}
