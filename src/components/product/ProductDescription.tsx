import { plainText } from '@/lib/data'
import { rewriteStemDescription } from '@/lib/stem-description'

interface DescriptionBlock {
  type: 'paragraph' | 'list' | 'heading' | 'table'
  lines: string[]
}

function descriptionBlocks(value: string, includesStem=false): DescriptionBlock[] {
  const tables: string[][] = []
  const prepared = String(value || '')
    .replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, table => {
      const rows=Array.from(table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)).map(row=>Array.from(row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)).map(cell=>{ const text=plainText(cell[1]).trim(); return includesStem ? rewriteStemDescription(text) : text }))
      if(!rows.length || rows.some(row=>row.length<2))return table
      tables.push(rows.map(row=>JSON.stringify(row)))
      return '\n\n[DESCRIPTION_TABLE] '+(tables.length-1)+'\n\n'
    })
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(
      /<h[1-6]\b[^>]*>/gi,
      '\n\n[DESCRIPTION_HEADING] '
    )
    .replace(/<\/h[1-6]\s*>/gi, '\n\n')
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<\/li\s*>/gi, '\n')
    .replace(/<\/(?:ul|ol)\s*>/gi, '\n\n')
    .replace(/<\/(?:p|div|section|article)\s*>/gi, '\n\n')
    .replace(/<\/(?:td|th)\s*>\s*<(?:td|th)\b[^>]*>/gi, ' · ')
    .replace(/<\/tr\s*>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')

  const text = (includesStem ? rewriteStemDescription(plainText(prepared)) : plainText(prepared))
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()

  if (!text) return []

  const blocks: DescriptionBlock[] = []

  let paragraph: string[] = []
  let list: string[] = []

  const flushParagraph = () => {
    if (!paragraph.length) return

    blocks.push({
      type: 'paragraph',
      lines: paragraph,
    })

    paragraph = []
  }

  const flushList = () => {
    if (!list.length) return

    blocks.push({
      type: 'list',
      lines: list,
    })

    list = []
  }

  text.split('\n').forEach(rawLine => {
    const line = rawLine.trim()

    if (!line) {
      flushParagraph()
      flushList()
      return
    }

    if (line.startsWith('[DESCRIPTION_TABLE]')) {
      flushParagraph(); flushList()
      blocks.push({type:'table',lines:tables[Number(line.replace('[DESCRIPTION_TABLE]','').trim())] || []})
      return
    }

    if (line.startsWith('[DESCRIPTION_HEADING]')) {
      flushParagraph()
      flushList()

      const heading = line
        .replace('[DESCRIPTION_HEADING]', '')
        .trim()

      if (heading) {
        blocks.push({
          type: 'heading',
          lines: [heading],
        })
      }

      return
    }

    if (/^[•●▪]\s*/.test(line) || /^[-–]\s+/.test(line)) {
      flushParagraph()

      list.push(
        line.replace(/^(?:[•●▪]\s*|[-–]\s+)/, '')
      )

      return
    }

    flushList()
    paragraph.push(line)
  })

  flushParagraph()
  flushList()

  return blocks
}

export default function ProductDescription({
  value,
  includesStem=false,
}: {
  value: string
  includesStem?: boolean
}) {
  const blocks = descriptionBlocks(value,includesStem)

  if (!blocks.length) return null

  return (
    <div className="space-y-4 break-words text-[13px] leading-7 text-store-muted">
      {blocks.map((block, index) => {
        if (block.type === 'table') {
          return <div key={index} className="overflow-hidden rounded-xl border border-store-border">
            <table className="w-full table-fixed border-collapse text-left text-[13px] leading-6">
              <caption className="border-b border-store-border bg-store-surface px-4 py-3 text-left text-sm font-medium text-store-text">{block.lines.some(row=>(JSON.parse(row) as string[]).length>2) ? 'Medidas e variações' : 'Ficha técnica'}</caption>
              <tbody>{block.lines.map((row,rowIndex)=>{
                const cells=JSON.parse(row) as string[]
                const [label,...values]=cells
                const header=rowIndex===0 && cells.length>2 && /^(?:código|referência|sku)$/i.test(label)
                return <tr key={rowIndex} className="border-b border-store-border last:border-b-0">
                  <th scope={header ? 'col' : 'row'} className="w-[40%] break-words bg-store-surface px-3 py-3 align-top font-medium text-store-text sm:px-4">{label}</th>
                  {values.map((value,cellIndex)=>header ? <th scope="col" key={cellIndex} className="break-words bg-store-surface px-3 py-3 align-top font-medium text-store-text sm:px-4">{value}</th> : <td key={cellIndex} className="break-words px-3 py-3 align-top sm:px-4">{value}</td>)}
                </tr>
              })}</tbody>
            </table>
          </div>
        }
        if (block.type === 'heading') {
          return (
            <h3
              key={index}
              className="pt-2 text-sm font-medium leading-6 text-store-text"
            >
              {block.lines[0]}
            </h3>
          )
        }

        if (block.type === 'list') {
          return (
            <ul
              key={index}
              className="list-disc space-y-2 pl-5 marker:text-[#B49A73]"
            >
              {block.lines.map((line, lineIndex) => (
                <li key={lineIndex}>
                  {line}
                </li>
              ))}
            </ul>
          )
        }

        return (
          <p key={index}>
            {block.lines.map((line, lineIndex) => (
              <span key={lineIndex}>
                {lineIndex > 0 && <br />}
                {line}
              </span>
            ))}
          </p>
        )
      })}
    </div>
  )
}

