# Ponte gratuita MECÂNICO IA ↔ ChatGPT — versão simplificada

## Como usar

1. No MECÂNICO IA, clique em **Conversar com thIAguinho** (botão visível logo abaixo do veículo).
2. A nova tela já seleciona o caso que está aberto no site, quando o histórico estiver disponível. Você pode escolher outro carro ou conferir/editar a ficha.
3. Clique em **Conversar com thIAguinho GPT**. O navegador tenta **copiar a ficha e abrir o ChatGPT no mesmo gesto**.
4. **No ChatGPT, cole a ficha e envie a mensagem.** Fotos originais precisam ser anexadas manualmente.
5. Para guardar link da conversa ou orientação no histórico, abra **Guardar conversa ou orientação**. Esse passo é opcional.

Se o navegador impedir a cópia, clique em **Conferir ou corrigir informações** e **Copiar ficha novamente**. Se bloquear a janela, use o link alternativo que aparece na tela. O site nunca envia automaticamente os dados ao ChatGPT.

## Preservação e limites

- O ChatGPT abre em uma janela ou aba independente; não pode ser incorporado nem controlado pelo site usando a assinatura atual.
- Plugin privado: https://chatgpt.com/plugins/plugins_6ad9272d2a2481918b90a44ef8868d54.
- **Não utiliza API paga**, Gemini ou serviços de inferência externos ao Plugin do ChatGPT.
- A interface atual, o sistema de diagnóstico, a biblioteca local, as fotografias e as regras Firebase não foram substituídos.
- A ficha preserva linhas repetidas de scanner e identifica OCR como não verificado. Não reclassifica respostas da IA como medições nem reparos comprovados.
- A conversa não é sincronizada automaticamente com o Firebase. Links e orientações são registrados manualmente em nós separados: `usuarios/{uid}/gptLinks/{caseId}` e `usuarios/{uid}/gptNotas/{caseId}` (quando a autenticação do histórico estiver disponível); uma cópia fica no navegador.
- A identidade Firebase anônima não garante continuidade automática entre dispositivos.
- O Plugin privado só está disponível para contas com autorização no ChatGPT.
- O conteúdo copiado pode conter dados de cliente: confira a ficha e remova dados identificáveis antes de enviar.

## Testes

`node --test scripts/test_gpt_ponte.cjs` — oito testes, incluindo fluxo simplificado.

A visualização real em Android/iPhone e a aceitação da janela pelo navegador precisam ser verificadas nesses dispositivos.
