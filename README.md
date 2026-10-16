# thIAguinho Soluções Automotiva — IA Mecânico

Aplicação mobile-first de apoio ao diagnóstico automotivo.

## Versão 1.0

- interface principal em formato de conversa;
- mascote oficial **thIAguinho**, com **IA** destacada na identidade;
- logotipo automotivo com engrenagem + veículo + diagnóstico eletrônico;
- tema automático, claro e escuro;
- PWA instalável;
- contexto opcional de marca, modelo, ano, motor, câmbio e quilometragem;
- análise local temporária de foto e vídeo de tela de scanner;
- OCR extrai texto e DTCs sem enviar a mídia para Firebase;
- Auth anônimo automático;
- histórico automático no Firebase Realtime Database;
- base técnica fica no motor interno e não é listada na interface;
- motor de diagnóstico prioriza hipóteses, valores documentados e próximo teste;
- resultados de testes podem ser registrados e usados na continuidade do caso.

## Firebase

Projeto configurado no cliente para:

- Authentication: Anonymous
- Realtime Database: `usuarios/{uid}/casos/{caseId}`

As fotos e vídeos **não são gravados no Firebase**. Somente texto extraído, códigos, mensagens e histórico do diagnóstico.

## Publicação

GitHub Pages:

https://tsvalencio-ia.github.io/MECANICO/

## Continuidade do diagnóstico — 16/10/2026

- Runtime preservado em **1.6.2**, com diagnóstico no navegador e conhecimento compacto sem Cloud Functions.
- Resultados explícitos sobre bobina ou vela podem corrigir um teste anterior, mesmo quando outra pergunta está aberta. O histórico mantém os relatos anteriores; o próximo passo usa o resultado mais recente e desconsidera os testes que dependiam de um resultado corrigido.
- Uma falha que migrou de cilindro direciona a confirmação para o componente comparado. A troca de várias peças exige uma comparação isolada antes de recomendar substituição. O reparo ainda precisa ser verificado nas condições informadas.
- O motor cadastrado permite apresentar o próximo ensaio de injetor. A identificação específica é complementar; não se inventam procedimentos de alta pressão, pinagens, torques ou limites por falta dela.
- A busca por ensaios de injetor e compressão procura o procedimento, sem exigir que a mesma página repita o DTC. Referências incompatíveis de sistema, veículo ou motorização são filtradas.
- Ao reabrir um caso, os botões da etapa pendente voltam a funcionar sem duplicar a última resposta. Em históricos antigos, correções ignoradas podem ser recuperadas dos relatos do usuário ainda presentes, vinculadas aos testes registrados. Texto do assistente não serve como evidência.

Verificação: `node --test scripts/test_pwa.cjs scripts/test_media.cjs scripts/test_diagnosis.cjs`. A reprodução inclui a conversa P0303, correções por texto, respostas curtas, histórico, comparação de uma peça por vez e leitura após reparo.

---

**Powered by thIAguinho Soluções Automotiva**
