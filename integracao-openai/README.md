# Integração OpenAI do MECÂNICO IA — TESTE ISOLADO

**Status:** implementação de staging, NÃO publicada em produção. Esta integração usa a OpenAI API Responses; **não** executa o Plugin privado do ChatGPT. Reaproveita instruções e conteúdo de 19 arquivos originais somente após importação privada. A API tem cobrança independente da assinatura do ChatGPT.

## Inventário e isolamento

- Interface: `chat-openai.html`, página separada e responsiva. Mantém mensagens de texto apenas no armazenamento deste navegador de teste, não modifica os registros do Firebase. O site `app-v134.html` e `js/app.js` permanecem inalterados.
- Servidor: `integracao-openai/server.mjs`, Node >=20, sem pacotes npm; `/health` e `/api/chat`.
- Chave da OpenAI apenas no servidor (`OPENAI_API_KEY`). Nunca adicionar chave em arquivo HTML, GitHub ou APK.
- Login Firebase obrigatório por ID token RS256, com assinatura validada via certificados públicos Google; requer `AUTHORIZED_FIREBASE_UIDS` privado no ambiente do servidor. Bloqueia chamadas sem chave, sem biblioteca e sem allowlist.
- Biblioteca: arquivos importados para diretório `integracao-openai/private/` ignorado pelo Git; não enviar a biblioteca privada ao repositório público. A busca traz até 3 blocos textuais documentais por mensagem; **não confirma** aplicação automaticamente.
- Limitação de abuso inicial: 5 solicitações a cada 5 minutos e 40 por dia por UID **por processo**. Não é uma garantia de orçamento em múltiplas instâncias ou reinicializações. Implantação pública exige bloqueio de gastos e quotas persistentes.
- As fotos passam ao modelo somente após seleção e confirmação do usuário. Não enviar placas ou informações pessoais.

## Preparação privada no servidor

1. Tenha o arquivo ZIP **privado** do Plugin em ambiente seguro, fora do repositório.
2. Importe a biblioteca localmente (não fazer commit):

   ```bash
   python3 integracao-openai/importar_acervo.py /caminho/thiaguinho-mecanico-ia-privado-v0.1.0.zip integracao-openai/private
   ```

3. Configure as variáveis no servidor privado, **sem publicar seus valores**:

   ```text
   OPENAI_API_KEY=<chave no armazenamento de segredos do servidor>
   OPENAI_MODEL=gpt-6.1-terra
   AUTHORIZED_FIREBASE_UIDS=<UID Firebase autorizado>
   ALLOWED_ORIGINS=https://tsvalencio-ia.github.io
   MECANICO_PRIVATE_KNOWLEDGE_DIR=/caminho/privado
   PORT=8787
   ```

4. Inicie: `node integracao-openai/server.mjs`.
5. Rode `node --test tests/openai-core.test.mjs` e verifique `GET /health`. O retorno `configured:true` **não** prova qualidade diagnóstica nem saldo de API.
6. Disponibilize o servidor sob HTTPS com controle de segredos, orçamento persistente e autenticação. O GitHub Pages sozinho não executa esse Node.js.
7. Só depois de servidor validado e autorização para produção, configure o endereço na página de teste e considere merge para `main`.

## Teste de regressão

- Clio 2003 1.6 K4M: cinco registros `12`, `08`, `13`, `99`, `99`, chicote do cânister quebrado sem reparo comprovado, melhora parcial, marcha lenta atual. Não converter códigos. Não usar manual K7M como K4M.
- Hilux 2018 2.8 AT: tranco R após troca de ATF, excesso corrigido sem eliminar tranco, scanner sem DTC relatado, após 15 minutos de bateria desligada tranco não reapareceu, inclusive após rodagem quente. Não afirmar apagamento de adaptações nem aplicação do manual A340/A343.
- Checar que referências retornadas têm ID R, caminho, página, estado e declaração de aplicação não confirmada salvo evidência forte para a ECU exata.

## O que NÃO está pronto

Nenhuma chave foi configurada, nenhuma chamada OpenAI paga foi feita e nenhum servidor foi publicado. A biblioteca não foi carregada em um servidor externo, apenas no pacote de desenvolvimento. O histórico de teste da página não é o mesmo histórico do app-v134. A implantação e eventual fusão com a interface existente exigem validação e autorização específicas.
