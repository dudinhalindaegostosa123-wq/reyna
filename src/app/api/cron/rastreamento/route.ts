import { syncLegacyShipments } from '@/lib/legacy-tracking-server'
import { timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { saleUuid } from '@/lib/admin-sales'
import { remoteCart } from '@/lib/label-cart-server'
import {
  inspectShipment,
  labelShipmentRequest,
} from '@/lib/label-purchase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Job = {
  order_id: string
  remote_id: string
  operation: string
  lease_id: string
}

type Result = 'synced' | 'skipped' | 'failed'

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}

function authorized(
  request: Request,
  secret: string
) {
  const supplied = Buffer.from(
    request.headers.get('authorization') || ''
  )

  const expected = Buffer.from(
    `Bearer ${secret}`
  )

  return (
    supplied.length === expected.length &&
    timingSafeEqual(supplied, expected)
  )
}

function failureCode(error: unknown): string {
  const message =
    error instanceof Error ? error.message : ''

  const name =
    error instanceof Error ? error.name : ''

  if (
    name === 'AbortError' ||
    name === 'TimeoutError'
  ) {
    return 'PROVIDER_TIMEOUT'
  }

  if (message === 'PURCHASE_CONFIG') {
    return 'PROVIDER_CONFIGURATION'
  }

  if (message === 'PURCHASE_SERVICE') {
    return 'SERVICE_MISMATCH'
  }

  if (message === 'PURCHASE_REMOTE_STATE') {
    return 'REMOTE_STATE_UNKNOWN'
  }

  if (message === 'PURCHASE_PROVIDER') {
    return 'PROVIDER_UNAVAILABLE'
  }

  if (message === 'TRACKING_DATABASE') {
    return 'DATABASE_UNAVAILABLE'
  }

  if (message === 'TRACKING_LINK') {
    return 'LINK_CHANGED'
  }

  return 'TRACKING_SYNC_FAILED'
}

export async function GET(request: Request) {
  const started = Date.now()
  const secret =
    process.env.CRON_SECRET?.trim() || ''

  if (secret.length < 32) {
    return json(
      {
        ok: false,
        error: 'CRON_CONFIGURATION',
      },
      503
    )
  }

  if (!authorized(request, secret)) {
    return json(
      {
        ok: false,
        error: 'UNAUTHORIZED',
      },
      401
    )
  }

  // Deployments de preview não consultam os envios.
  if (
    process.env.VERCEL_ENV &&
    process.env.VERCEL_ENV !== 'production'
  ) {
    return json({
      ok: true,
      skipped: true,
      reason: 'PREVIEW',
    })
  }

  const url =
    process.env.SUPABASE_URL?.trim()

  const key =
    process.env.SUPABASE_SECRET_KEY?.trim()

  const providerConfigured = Boolean(
    process.env.MELHOR_ENVIO_TOKEN?.trim()
  )

  if (!url || !key || !providerConfigured) {
    return json(
      {
        ok: false,
        error: 'TRACKING_CONFIGURATION',
      },
      503
    )
  }

  const db = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: 'no-store',
          signal: AbortSignal.timeout(8000),
        }),
    },
  })

  let synced = 0
  let skipped = 0
  let failed = 0
  let legacy: { installed: boolean | null; synced: number; failed: number } = { installed: null, synced: 0, failed: 0 }

  try {
    const config = await db
      .from('serenity_shipping_settings')
      .select('contact_email')
      .eq('singleton', true)
      .single()

    const contact = String(
      config.data?.contact_email || ''
    ).trim()

    if (
      config.error ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)
    ) {
      return json(
        {
          ok: false,
          error: 'TRACKING_CONTACT_CONFIGURATION',
        },
        503
      )
    }

    const finish = async (
      job: Job,
      values: Record<string, unknown>
    ) => {
      const result = await db.rpc(
        'serenity_tracking_finish',
        {
          p_order: job.order_id,
          p_remote: job.remote_id,
          p_operation: job.operation,
          p_lease: job.lease_id,
          ...values,
        }
      )

      if (
        result.error ||
        typeof result.data !== 'boolean'
      ) {
        throw new Error('TRACKING_DATABASE')
      }

      return result.data
    }

    const syncOne = async (
      job: Job
    ): Promise<Result> => {
      try {
        const found = await db
          .from('serenity_label_jobs')
          .select(
            'state,remote_id,operation,selected,context'
          )
          .eq('order_id', job.order_id)
          .single()

        if (found.error) {
          throw new Error('TRACKING_DATABASE')
        }

        if (
          !found.data ||
          found.data.state !== 'prepared' ||
          found.data.remote_id !== job.remote_id ||
          found.data.operation !== job.operation
        ) {
          throw new Error('TRACKING_LINK')
        }

        // Somente consulta. Não compra nem gera etiquetas.
        const response = await labelShipmentRequest(
          'info',
          job.remote_id,
          contact
        )

        // Confere o ID, a identificação e o serviço do envio.
        const remote = inspectShipment(
          response,
          found.data
        )

        const value = remoteCart(response)
        const candidate =
          value.tracking ?? value.tracking_code

        const tracking =
          typeof candidate === 'string' &&
          /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(
            candidate.trim()
          )
            ? candidate.trim()
            : null

        const saved = await finish(job, {
          p_status: remote.status,
          p_paid: remote.paid,
          p_generated: remote.generated,
          p_blocked: remote.blocked,
          p_cents: remote.cents,
          p_tracking_code: tracking,
          p_error: null,
        })

        return saved ? 'synced' : 'skipped'
      } catch (error) {
        const code = failureCode(error)

        // Sem dados pessoais ou credenciais nos logs.
        console.error('[tracking]', { code })

        try {
          const saved = await finish(job, {
            p_error: code,
          })

          return saved ? 'failed' : 'skipped'
        } catch {
          // A reserva expira se o banco estiver indisponível.
          return 'failed'
        }
      }
    }

    // Dois envios por lote e até três lotes por execução.
    for (let batch = 0; batch < 3; batch++) {
      if (
        batch > 0 &&
        Date.now() - started > 10000
      ) {
        break
      }

      const claimed = await db.rpc(
        'serenity_tracking_claim',
        {
          p_limit: 2,
        }
      )

      if (claimed.error) {
        throw new Error('TRACKING_DATABASE')
      }

      const jobs: unknown = claimed.data

      if (
        !Array.isArray(jobs) ||
        jobs.length > 2 ||
        jobs.some(
          job =>
            !job ||
            typeof job !== 'object' ||
            !saleUuid(job.order_id) ||
            !saleUuid(job.remote_id) ||
            !saleUuid(job.operation) ||
            !saleUuid(job.lease_id)
        )
      ) {
        throw new Error('TRACKING_DATABASE')
      }

      if (!jobs.length) break

      const results = await Promise.all(
        (jobs as Job[]).map(syncOne)
      )

      for (const result of results) {
        if (result === 'synced') {
          synced++
        } else if (result === 'skipped') {
          skipped++
        } else {
          failed++
        }
      }

      if (jobs.length < 2) break
    }

    if (Date.now() - started < 20000) {
      legacy = await syncLegacyShipments(db, contact)
      synced += legacy.synced
      failed += legacy.failed
    }

    if (Date.now() - started < 20000 && process.env.SERENITY_EMAIL_ENABLED === 'true' && process.env.VERCEL_ENV === 'production') {
      try {
        const { safeDrainOrderEmails } = await import('@/lib/order-email-server')
        await safeDrainOrderEmails(db)
      } catch { console.error('[order-email]', { code: 'EMAIL_WORKER_FAILED' }) }
    }
    if (synced) {
      revalidatePath('/admin/pedidos')
      revalidatePath(
        '/admin/pedidos/[id]',
        'page'
      )
      revalidatePath('/admin/frete')
      revalidatePath('/admin/etiquetas')
      revalidatePath('/admin/historico')
    }

    return json(
      {
        ok: failed === 0,
        synced,
        skipped,
        failed,
        legacy,
      },
      failed ? 503 : 200
    )
  } catch (error) {
    console.error('[tracking]', {
      code: failureCode(error),
    })

    return json(
      {
        ok: false,
        error: 'TRACKING_DATABASE',
        synced,
        skipped,
        failed,
      },
      503
    )
  }
}
