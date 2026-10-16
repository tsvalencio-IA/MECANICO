# thIAguinho Soluções Automotiva — IA Mecânico

Aplicação mobile-first de apoio ao diagnóstico automotivo.

## Aplicação

- interface principal em formato de conversa;
- mascote oficial **thIAguinho**, com **IA** destacada na identidade;
- logotipo automotivo com engrenagem + veículo + diagnóstico eletrônico;
- tema automático, claro e escuro;
- PWA instalável;
- contexto opcional de marca, modelo, ano, motor, câmbio e quilometragem;
- análise local temporária de foto e vídeo de tela de scanner;
- OCR extrai texto e DTCs sem enviar a mídia para Firebase;
- acesso direto sem cadastro, e-mail, senha ou tela de login; identificação anônima automática apenas para separar o histórico;
- histórico automático no Firebase Realtime Database;
- base técnica fica no motor interno e não é listada na interface;
- motor de diagnóstico prioriza hipóteses, valores documentados e próximo teste;
- resultados de testes podem ser registrados e usados na continuidade do caso.

## Firebase

Projeto configurado no cliente para:

- Authentication: Anonymous
- Realtime Database: `usuarios/{uid}/casos/{caseId}`

As fotos e vídeos **não são gravados no Firebase**. Somente texto extraído, códigos, mensagens e histórico do diagnóstico.

Se a conexão com o Firebase falhar, o diagnóstico continua e o histórico fica no aparelho. Um snapshot antigo da nuvem não deve apagar casos locais mais recentes. Sem conta identificada, o histórico pertence à identidade anônima desse navegador; não há recuperação automática em outro aparelho.

## Desenvolvimento e validação

Não há dependências npm nem build da aplicação. Use Node.js com `node:test` e Python 3. Sirva o diretório pai do checkout para preservar o prefixo `/MECANICO/` do PWA:

```bash
python3 -m http.server 8000 --bind 127.0.0.1 --directory /workspace
```

Em outro terminal, no checkout:

```bash
node --test scripts/test_*.cjs
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts -p 'test_*.py' -v
```

O smoke de navegador requer Playwright e Chromium (já disponíveis no ambiente de nuvem):

```bash
node scripts/smoke_browser.cjs
```

Ele usa o servidor local, testa conversa/histórico/PWA, busca remota e OCR real `por+eng`, e intercepta os SDKs Firebase para não criar dados sintéticos de produção. `MECANICO_SMOKE_URL` e `CHROMIUM_EXECUTABLE` permitem ajustar servidor local e executável. Para testar um índice recém-construído, defina `MECANICO_KNOWLEDGE_DIR` com o diretório do índice.

## Qualidade do diagnóstico — 16/10/2026

- Uma resposta como “180 em cada” na etapa de compressão é registrada mesmo sem unidade. A pergunta seguinte pede apenas psi/bar/kPa; a unidade e as condições do ensaio ficam vinculadas à leitura, inclusive após reabrir o caso. Valores iguais não são tratados como comprovação de compressão normal.
- Na partida sem giro, uma leitura como “12V” pede a condição da medição e conserva o valor. As tensões antes/durante são registradas separadamente; respostas incompletas recebem explicação. Código de motor, referência indisponível e novas medições são recebidos nas etapas de procedimento, sem repetir o pedido como se a resposta não tivesse sido enviada.
- DTCs retirados, negados ou apenas hipotéticos não entram na leitura atual nem reaparecem de uma foto antiga.
- “Não comunica”, autorização desconhecida e medições ainda não realizadas mantêm seu significado; uma hipótese não vira resultado de teste.
- Falha sem DTC avança para condição de funcionamento e leituras disponíveis.
- Resultados normais, alterados e medidos de testes genéricos ficam registrados. A etapa continua ao reabrir o caso, sem considerar uma medida isolada como aprovação ou condenação de peça.
- A busca usa a janela do DTC mesmo fora do preview, exige o tema técnico e filtra incompatibilidades explícitas de modelo, ano e motor. Falhas de rede transitórias permitem nova tentativa.
- Referências mostram o tipo de extração e as lacunas de aplicação. Os originais dos manuais locais não acompanham o checkout; seus resumos não são apresentados como documentos originais verificados.
- O indexador reconhece códigos hexadecimais e códigos separados por espaços, preserva a procedência e identifica revisões para invalidar caches após reconstrução.

Resultados, comandos, cobertura e pendências estão em [docs/VALIDACAO.md](docs/VALIDACAO.md). Testes de software não medem acurácia de reparos reais.

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

Verificação: `node --test scripts/test_*.cjs`. A reprodução inclui a conversa P0303, correções por texto, respostas curtas, histórico, comparação de uma peça por vez e leitura após reparo.

---

**Powered by thIAguinho Soluções Automotiva**
