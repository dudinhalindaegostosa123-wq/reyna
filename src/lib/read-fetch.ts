import 'server-only'
/** A single bounded retry for reads only. Never retries POST/RPC/payment mutations. */
export async function readFetch(input: RequestInfo | URL, init: RequestInit = {}, fetcher: typeof fetch = fetch): Promise<Response> {
 const request=input instanceof Request ? input : null
 const method=(init.method || request?.method || 'GET').toUpperCase()
 if(method!=='GET' && method!=='HEAD') return fetcher(input,init)
 const parent=init.signal || request?.signal
 for(let attempt=0;attempt<2;attempt++) {
  const timeout=AbortSignal.timeout(4500)
  const signal=parent ? AbortSignal.any([parent,timeout]) : timeout
  try {
   const response=await fetcher(input,{...init,signal})
   if(attempt===0 && [502,503,504].includes(response.status) && !parent?.aborted) {
    try { await response.body?.cancel() } catch {}
    continue
   }
   return response
  } catch(error) {
   const failure=error as {name?:string;message?:string;code?:string;cause?:{code?:string}}
   const transient=['TimeoutError','AbortError'].includes(failure?.name || '') || failure?.message==='fetch failed' || ['ETIMEDOUT','ECONNRESET','UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT'].includes(failure?.cause?.code || failure?.code || '')
   if(attempt!==0 || parent?.aborted || !transient) throw error
  }
 }
 throw new Error('READ_UNAVAILABLE')
}
