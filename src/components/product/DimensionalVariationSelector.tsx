'use client'
import {useId,useState} from 'react'
import {dimensionValues,dimensionAvailable,selectDimension,dimensionLabel,type VariationDimensions} from '@/lib/variation-dimensions'
export default function DimensionalVariationSelector({model,selectedId,disabled=false,onChange}:{model:VariationDimensions;selectedId:string;disabled?:boolean;onChange:(id:string)=>void}){
 const id=useId()
 const [state,setState]=useState(()=>({id:selectedId,values:dimensionValues(model,selectedId)}))
 // Track externally selected URLs/SKUs while keeping incomplete local choices between steps.
 const current=state.id===selectedId?state:{id:selectedId,values:dimensionValues(model,selectedId)}
 if(state.id!==selectedId)setState(current)
 return <div className="mb-4 grid grid-cols-2 gap-2.5">
  {model.fields.map((field,index)=>{
   const waiting=model.fields.slice(0,index).some(previous=>!current.values[previous.key])
   const hint=waiting?(field.kind==='length' && model.fields.some(item=>item.kind==='gauge')?'Primeiro escolha a espessura.':'Escolha a medida anterior.'):field.kind==='gauge'?'É a grossura da haste.':field.kind==='length'?'Medida da haste, sem contar as pontas.':''
   return <div key={field.key}>
    <label htmlFor={`${id}-${index}`} className="mb-1 flex min-h-8 items-end text-[11px] font-medium leading-4 text-store-muted">{field.label}</label>
    <select id={`${id}-${index}`} value={current.values[field.key] || ''} disabled={disabled || waiting} onChange={event=>{
     const next=selectDimension(model,current.values,field.key,event.target.value)
     setState(next);onChange(next.id)
    }} className="min-h-[46px] w-full rounded-xl border border-store-border bg-store-surface px-2 text-base outline-none focus:border-[#9F8968] disabled:opacity-50 sm:text-sm">
     <option value="">Selecionar</option>
     {field.values.map(value=>{const available=dimensionAvailable(model,current.values,field.key,value);return <option key={value} value={value} disabled={!available}>{dimensionLabel(value)}{available?'':' — Indisponível'}</option>})}
    </select>
    {hint && <p className="mt-1 text-[10px] leading-4 text-store-muted">{hint}</p>}
   </div>
  })}
 </div>
}
