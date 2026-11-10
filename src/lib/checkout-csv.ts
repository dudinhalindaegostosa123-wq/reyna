interface ContactRow {name:string;email:string;phone:string;status:string;lastActivity:string}
function cell(value:unknown){
 let text=String(value ?? '')
 // Quotes alone do not stop spreadsheet formulas; escape formula-leading cells too.
 if(/^[\s\uFEFF]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text))text="'"+text
 return '"'+text.replace(/"/g,'""')+'"'
}
export function checkoutEmailsCsv(rows:ContactRow[]){
 const emails=new Set<string>(),lines:string[]=[]
 for(const row of rows){
  const email=row.email.trim().toLowerCase()
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || emails.has(email))continue
  emails.add(email)
  lines.push([row.name,email,row.phone,row.status,row.lastActivity].map(cell).join(';'))
 }
 return '\uFEFF'+[['Nome','E-mail','WhatsApp','Situação','Última atividade (UTC)'].map(cell).join(';'),...lines].join('\r\n')+'\r\n'
}
