# Copiar fotos do Supabase original

O CSV contém links WordPress em `serenitypiercings.com.br/wp-content/uploads`.
A execução recebida em captura mostrou HTTP 403 nesses links. Isso não é uma
falha de autenticação no destino Supabase: o servidor de imagens recusou o acesso.
Não repetir a mesma transferência esperando que as credenciais do destino
resolvam a recusa da origem.

## Alternativa preparada

O workflow **Copiar fotos do Supabase original** lê os produtos, variações e
mídias publicados e acessíveis à chave pública do projeto original. Baixa os
arquivos já migrados no bucket público `produtos` e os grava no projeto novo.
A origem é restrita a GET. Não existe exclusão de arquivos ou alteração da origem.

Os UUIDs dos dois bancos podem ser diferentes. Os vínculos são refeitos pelos
`woo_id` dos produtos/variações; uma variação só é associada ao produto correto.
Itens do banco original ausentes do CSV/destino são contados separadamente no
resumo. A execução não importa produtos novos nem dados de compradores.

No GitHub, em Settings → Secrets and variables → Actions → Repository secrets:

- `SUPABASE_URL`: manter a Project URL do projeto **novo**.
- `SUPABASE_SECRET_KEY`: manter a chave administrativa do projeto **novo**.
- `SOURCE_SUPABASE_URL`: adicionar a Project URL do projeto **original**.
- `SOURCE_SUPABASE_PUBLISHABLE_KEY`: adicionar a chave Publishable ou a chave
  antiga `anon` do projeto **original**. Não precisa de chave administrativa.

Depois executar Actions → Copiar fotos do Supabase original → Run workflow → main.
O workflow compartilha a fila de concorrência da transferência antiga, para não
executar duas gravações simultâneas. Ele depende de a importação de produtos já
ter terminado no banco novo e de o bucket `produtos` existir e ser público.

Os arquivos ficam em `copia-supabase-v1` com nomes derivados do SHA-256 do conteúdo.
Objetos existentes não são sobrescritos; em caso de conflito, o conteúdo existente
é baixado e seu checksum é conferido antes de reutilizar. Cada mídia é vinculada
assim que seus arquivos ficam disponíveis. Repetir a cópia usa o mesmo ID de mídia.
O limite é 25 MB por imagem e 900 MB de novos uploads por execução; a quota real
do Supabase também se aplica. O código não converte imagens ou as recomprime.

O resumo separa vínculos gravados, arquivos enviados/reutilizados, itens sem
correspondência no catálogo e falhas. Falhas de acesso ou download impedem afirmar
que a cópia foi completa. A execução termina com erro se há mídias com falha ou
se nenhuma associação foi gravada, preservando as associações já concluídas.

## Verificação

Testes locais cobrem paginação além de 500 registros, correspondência dos IDs,
recusa de associação com pai incorreto, preservação de bytes, retomada por checksum,
recusa de escrita na origem, HTML no lugar de imagem e tratamento de HTTP 403.
A cópia real exige os Secrets da origem; não foi executada nesta máquina.

## Velocidade e retomada

A cópia processa até quatro mídias em paralelo. Um bloqueio por caminho impede
baixar simultaneamente o mesmo arquivo para diferentes associações; o limite de
bytes considera também uploads em andamento. O workflow permite até 330 minutos.

Na retomada, o script lê os vínculos já gravados e lista os objetos existentes no
prefixo `copia-supabase-v1`. Uma mídia com os mesmos metadados e todos os arquivos
presentes é contada em `retomadas`, sem baixar novamente. Um vínculo incompleto
ou com arquivo ausente é reparado pelo fluxo normal, com checksum na reutilização
de um objeto existente. Essa retomada reaproveita a cópia concluída, e não é um
mecanismo de sincronização de edições posteriores nos arquivos da origem.

É possível cancelar uma execução lenta e iniciar **Run workflow → main** após
uma atualização do código. Os uploads e vínculos já concluídos permanecem no
Supabase. Re-run da execução antiga usa a versão antiga do workflow/script;
para usar a otimização é necessário criar uma execução nova.
