# Serviços e preços por material

Aplicar após a publicação do código compatível. Os novos valores dependem do banco; antes da migração a aplicação respeita os valores instalados, inclusive os R$ 5 antigos de esterilização.

1. Executar inteiro `database/commerce/05-servicos-esterilizacao-hastes.sql` no SQL Editor. Ativa esterilização R$ 10/unidade, haste de labret selecionada R$ 5/unidade e anodização gratuita. Preserva a obrigatoriedade/compatibilidade das medidas e os pagamentos já gerados. Os adicionais ficam fora dos descontos progressivo, cupom, Pix e atacado e do mínimo de joias para frete grátis.
2. Executar inteiro `database/admin/02-precos-por-material.sql`. Instala a ferramenta em Administração → Preços por material. Não reajusta preços ao instalar. A prévia mostra o material, percentual, quantidade e exemplos; a confirmação aplica preços de joias simples e variações habilitadas de produtos publicados. Preços promocionais recebem o mesmo percentual; a base de atacado acompanha os preços de catálogo. Pedidos e cobranças salvos não mudam.

Os scripts são transacionais e repetíveis. O reajuste tem controle de concorrência pela prévia, chave de operação para impedir aplicação duplicada e backup dos valores anteriores. Reajustes deliberadamente novos se acumulam sobre os valores atuais. Campanhas que protegem preços podem impedir a operação inteira; conferir a campanha antes de tentar novamente.

A vitrine troca as fotografias dos cards a cada 3 segundos no celular e durante hover no desktop, sem alterar a seleção de variação de compra. Os cards usam até seis imagens, com uma consulta compartilhada por página; pausam fora da tela, em aba oculta e com preferência por movimento reduzido. Sem galeria disponível, preservam a imagem principal. O seletor de variação começa sem escolha automática; links com uma variação explícita continuam selecionando essa variação.

A faixa passa a anunciar “5% OFF no Pix ou 3x sem juros”. **A condição de juros é definida na conta Mercado Pago.** O banner não configura as taxas no provedor. Conferir se o parcelamento sem juros até 3x já está habilitado nessa conta; as condições efetivas continuam aparecendo no formulário seguro antes de pagar.

Validação local: integração real das funções SQL em banco descartável com aprovação de Pix, descontos só sobre joias, totais por unidade, recibo, repetição de webhook e cobrança anterior à mudança. Reajuste de material testa prévia sem escrita, conflito de preços, escopo por material, variações, repetição e bloqueio anônimo. Testes de grid verificam timer, hover, visibilidade e movimento reduzido. Não houve acesso ao banco de produção ou compra real durante estes testes.
