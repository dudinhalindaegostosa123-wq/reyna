export interface LabelChoice {
  id:string
  company:string
  service:string
  cents:number
  days:number|null
}

export interface LabelJobView {
  orderId:string
  operation:string
  state:string
  expires:string
  stale:boolean
  charged:number
  choices:LabelChoice[]
  issues:string[]
  remoteId:string
  remotePrice:number|null
  agency:string
  cnae:string
  lastError?:string
}
