export default function AdminCatalogSetupNotice() {
  return <main className="mx-auto max-w-2xl px-6 py-12">
    <h1 className="text-2xl font-medium">Ativar edição e busca de produtos</h1>
    <p className="mt-5 text-sm leading-7">O banco novo ainda precisa das funções do editor administrativo. Os produtos e as imagens cadastrados serão preservados.</p>
    <p className="mt-4 text-sm leading-7">Abra o SQL abaixo, copie seu conteúdo e execute no SQL Editor do Supabase da Lunarity. Depois recarregue este painel.</p>
    <a href="https://github.com/dudinhalindaegostosa123-wq/reyna/blob/main/database/admin/07-editor-produtos.sql" target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex min-h-[44px] items-center underline underline-offset-4">Abrir SQL do editor de produtos ↗</a>
  </main>
}
