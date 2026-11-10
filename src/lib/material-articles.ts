import { TITANIUM_CARE } from './titanium-copy'
type MaterialArticle = {
  id:string; title:string; lead?:string; paragraphs:string[];
  sections?:{title:string;paragraphs:string[]}[];
  care:string;href:string;label:string
}
export const MATERIAL_ARTICLES:MaterialArticle[] = [
  {
    id: 'titanio', title: 'Titânio grau implante: o que significa?',
    paragraphs: [
      'O titânio é um metal leve, resistente à corrosão e utilizado em joias para piercing. A expressão “grau implante” deve estar ligada a uma especificação técnica e à documentação do fabricante: ela não se resume à cor prateada ou à palavra titânio no nome da peça.',
      'A ASTM F136 é uma especificação para uma liga de titânio destinada a aplicações em implantes cirúrgicos. O titânio certificado conforme essa norma está entre as opções citadas pela Association of Professional Piercers para joias de perfuração inicial. Confira a especificação e a disponibilidade de documentação de cada produto.',
      'O titânio pode ter acabamento natural ou receber cor por anodização. A anodização altera a camada superficial de óxido para produzir cores; não transforma a peça em ouro. Polimento, dimensões e encaixe também precisam ser adequados à perfuração.',
    ],
    care: TITANIUM_CARE,
    href: '/materiais/titanio', label: 'Entenda melhor o titânio grau implante',
  },
  {
    id: 'titanio-revestido', title: 'Titânio revestido de ouro 24K',
    lead: 'A sofisticação do ouro 24K com a resistência extraordinária do titânio grau implante.',
    paragraphs: [
      'Nossas joias combinam a excelência do titânio com a beleza do ouro 24K, utilizando a avançada tecnologia Physical Vapor Deposition (Deposição Física de Vapor) para proporcionar um acabamento dourado sofisticado, resistente e duradouro.',
    ],
    sections: [
      {title:'Uma tecnologia que vai além da aparência', paragraphs:[
        'Diferentemente de uma pintura convencional, o processo Physical Vapor Deposition acontece em uma câmara a vácuo, onde o revestimento é formado em escala atômica, criando uma ligação de alta aderência com a superfície do titânio.',
        'Isso significa que o acabamento dourado não funciona como uma tinta comum que simplesmente descasca em películas. É um revestimento tecnológico desenvolvido para oferecer excelente fixação, resistência e durabilidade.',
      ]},
      {title:'A beleza do ouro, sem precisar de uma joia maciça', paragraphs:[
        'O ouro 24K é utilizado para proporcionar a tonalidade dourada e sofisticada da joia, enquanto sua estrutura permanece em titânio grau implante.',
        'Como o ouro é utilizado no acabamento, e não em toda a estrutura, essa tecnologia permite criar joias elegantes e resistentes por um valor muito mais acessível do que o ouro maciço.',
      ]},
      {title:'Resistência e durabilidade excepcionais', paragraphs:[
        'O titânio grau implante é reconhecido por sua leveza, resistência à corrosão e excelente compatibilidade com o organismo.',
        'Já o acabamento aplicado por Physical Vapor Deposition oferece alta aderência e resistência ao desgaste cotidiano.',
        'Como acontece com qualquer superfície metálica, atritos muito intensos ou riscos profundos podem danificar o acabamento e revelar a cor natural do titânio por baixo. Isso é diferente do descascamento característico de uma pintura comum.',
      ]},
      {title:'Tecnologia, beleza e qualidade', paragraphs:[
        'Na Serenity Piercings, unimos materiais de excelência e tecnologias avançadas para oferecer joias que combinam conforto, sofisticação e durabilidade.',
        'A beleza do ouro 24K. A excelência do titânio. A qualidade que você merece.',
      ]},
    ],
    care: 'Atrito, polidores, perfumes e produtos químicos podem desgastar o revestimento. Não use produtos para polir metais sem orientação do fabricante.',
    href: '/categoria/piercings-de-titanio', label: 'Explorar joias de titânio',
  },
  {
    id: 'ouro-18k', title: 'Ouro 18K maciço: composição e acabamento',
    paragraphs: [
      'O ouro 18K contém 75% de ouro e 25% de outros metais que formam a liga. Em uma joia maciça, essa liga compõe o corpo da peça, em vez de estar apenas em uma camada de revestimento. “Maciço” descreve aqui o material, não necessariamente uma construção sem partes ocas.',
      'A composição dos outros metais influencia a tonalidade e a adequação ao uso. Para piercing, especialmente em perfurações iniciais, é importante conferir a liga, a ausência de componentes aos quais você tenha sensibilidade e as orientações do fabricante e do piercer.',
      'Mesmo uma joia de ouro precisa ter dimensões, acabamento e fecho apropriados à anatomia. O teor de ouro, sozinho, não garante conforto nem ausência de reações individuais.',
    ],
    care: 'Proteja a joia de impactos e guarde as peças separadamente para reduzir riscos. Quando necessário, procure orientação para limpeza e manutenção de pedras e encaixes.',
    href: '/categoria/piercings-de-ouro-18k', label: 'Explorar joias de ouro 18K',
  },
  {
    id: 'bioflex', title: 'Bioflex: flexibilidade e indicações de uso',
    paragraphs: [
      'Bioflex é uma denominação comercial associada a materiais poliméricos flexíveis usados em algumas joias. Uma peça transparente ou flexível não pode ser considerada equivalente apenas pela aparência: composição, procedência e documentação precisam ser conferidas.',
      'A indicação depende do produto e da situação da perfuração. Não presuma que todo polímero possa ser esterilizado da mesma forma ou seja adequado para uso prolongado e perfurações recentes. Peça ao profissional que avalie a peça específica e consulte as instruções do fabricante.',
      'Flexibilidade não substitui a escolha correta do comprimento, da espessura ou do encaixe. Se a peça apresentar danos, alterações de superfície ou desconforto, procure orientação antes de continuar usando.',
    ],
    care: 'Respeite as restrições de temperatura e os métodos de limpeza informados pelo fabricante. Não improvise esterilização doméstica.',
    href: '/busca?q=bioflex', label: 'Consultar Bioflex no catálogo',
  },
]

