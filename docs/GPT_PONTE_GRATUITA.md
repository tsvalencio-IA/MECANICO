# Ponte gratuita MECÂNICO IA ↔ Plugin privado thIAguinho

## O que funciona (sem API paga)
- Na tela existente `app-v134.html`, link `GPT ↗` abre a página isolada `gpt-ponte.html` em nova aba/janela. O chat local original não é substituído.
- A página lê o histórico local `thiaguinho_history` do mesmo navegador/origem (até 50 casos) e prepara uma ficha editável com veículo, relatos cronológicos, leituras de scanner de origem incerta e testes registrados.
- O mecânico revisa e copia a ficha, abre o Plugin **privado** no ChatGPT e cola manualmente. O ChatGPT usa a Skill/biblioteca do Plugin, não a API paga.
- O mecânico pode salvar manualmente o link de conversa e registrar respostas como **orientações da IA não comprovadas**. Ficam em armazenamento local e, se disponível, em **novos nós separados** do Firebase: `usuarios/{uid}/gptNotas/{caseId}` e `usuarios/{uid}/gptLinks/{caseId}`.
- Nenhum dado é enviado ao ChatGPT até o mecânico copiar/colar. Fotos/vídeos originais exigem envio manual no ChatGPT.

## O que NÃO funciona automaticamente
- Sem servidor MCP autenticado no Plugin atual, ele não pode consultar/salvar por conta própria no Firebase nem controlar uma aba externa do ChatGPT.
- O site não recebe respostas automaticamente, não transfere fotos, não cria conversas com texto preinserido e não associa automaticamente URL a um chat.
- O histórico do Firebase utiliza identidade anônima por navegador; não há garantia de acesso entre dispositivos.
- Popup depende das permissões do navegador; se bloqueado, a abertura padrão de uma nova aba pelo link continua possível.
- A página nova não substitui o chat anterior nem altera o motor diagnóstico, regras de banco ou a biblioteca.

## Privacidade e segurança
- Endereço fixo do Plugin: https://chatgpt.com/plugins/plugins_6ad9272d2a2481918b90a44ef8868d54
- Links salvos aceitam apenas `https://chatgpt.com/c/...`, `/share/...` ou `/plugins/...`.
- Não armazenar tokens de autenticação em URL, copiar chaves ou usar API de modelos.
- Recomenda-se omitir dados de clientes na ficha revisada antes de transferir ao ChatGPT.
- Os registros da IA devem ser revisados por profissional e não são provas de reparo, medição ou aplicação de documento.

## Validação
- `node --test scripts/test_gpt_ponte.cjs`: seis testes sobre preservação de duplicatas, proveniência, URLs e limites.
- Scripts inline da página validados com `node --check`.
- Teste de navegador não concluído no ambiente de autoria (acesso à navegação bloqueado pelo executor).
- **Não mesclar automaticamente em produção sem validação manual na branch/ambiente isolado.**

## Futuro conector MCP (não implantado)
É necessário um servidor HTTPS seguro, autenticação vinculada ao usuário e permissões por caso. Nunca transformar o Firebase em leitura pública, colocar credenciais Admin no navegador ou instalar um MCP sem verificar a autenticação. Isso é uma evolução separada, sem necessidade da API paga de geração de texto.
