# Validação do conhecimento e do diagnóstico

Data: 16/10/2026. Runtime da PWA: 1.6.2, com novos identificadores de cache dos scripts. Busca compacta: 2.1.0.

## Escopo e critérios

A validação exercita comportamento de software e busca documental: preservar o relato do mecânico, selecionar o próximo teste coerente, evitar aplicação explicitamente incompatível e registrar o resultado sem tratá-lo como prova automática da causa. Os cenários são regressões de conversas e casos de referência controlados. Não representam reparos executados ou uma taxa de acerto em oficina.

## Verificações executadas

Resultado nesta máquina: **152 testes Node.js e sete testes Python passaram**, sem falhas ou skips. Também passaram as verificações de sintaxe dos dez arquivos JavaScript de aplicação/worker/smoke e o passo de arquivos críticos/arquitetura de privacidade do CI.

| Verificação | Evidência |
| --- | --- |
| Diagnóstico | Continuidade P0301/P0303, correções de bobina/vela, múltiplos cilindros, partida, negações, RPM/autorizações desconhecidas, medições não realizadas, ausência de DTC e reabertura de testes genéricos |
| Busca compacta | Tema técnico, janela DTC fora do preview, códigos diferentes, Gol/Golf, modelos numéricos e compostos, motor/combustível/ano conflitantes, fontes sem aplicação completa, recuperação após falhas e revisão de cache |
| Integridade do catálogo | Identidades únicas, referências resolvidas, procedência dos resumos locais e escopo dos códigos de fabricante |
| Indexador | CLI com corpus controlado, códigos hexadecimais/espaçados, página/chunk/hash/status preservados, reconstrução sem sobras, saída determinística, entrada inválida e revisão de conteúdo |
| Navegador Chromium | Acesso sem senha, diagnóstico com correção de resultado, histórico local, PWA, falha de comunicação com 0 RPM, falha sem DTC, busca real e foto sintética com OCR `por+eng` |
| OCR real | Leitura `DTC PO303`; confirmação explícita de P0303 pela interface antes de iniciar o diagnóstico |

No smoke local versionado, os SDKs Firebase são interceptados para manter os casos sintéticos locais. Ele testa o funcionamento com nuvem indisponível. Após a autorização de publicação, foi executada também uma validação no site público com uma identidade anônima nova: diagnóstico, histórico, PWA, busca, OCR, gravação com confirmação do servidor e leitura independente no Realtime Database passaram. Os cinco casos de teste e o usuário anônimo dessa validação foram removidos ao terminar; históricos preexistentes não foram usados nem alterados.

TLS foi mantido ativo. O Chromium precisou de acesso em leitura e escrita ao NSS para usar a CA já instalada no ambiente.

## Correção da conversa P0304 com compressão

A reprodução enviada pelo usuário percorre comparação de bobina e vela, ensaio sem vazamento do injetor e resposta “180 em cada”. A leitura sem unidade passa a ser salva, seguida por uma pergunta curta sobre psi/bar/kPa. “PSI” isolado completa a leitura anterior. As condições do ensaio são perguntadas quando ainda não foram informadas e não alteram a condição original da falha. Correções como “Não, 150 psi em cada” substituem a leitura. Quantidade de cilindros e temperatura do motor não entram na lista de pressões.

O estado persiste ao reabrir o caso. Valores ignorados em snapshots antigos podem ser recuperados exclusivamente de mensagens do mecânico posteriores ao ensaio de injetor registrado, nunca de texto gerado pelo assistente. A leitura fica vinculada aos resultados antecedentes; mudanças nesses resultados e novos casos não reutilizam medições antigas. Uma correção do cilindro 4 não é aplicada aos demais cilindros.

A igualdade relatada não confirma normalidade mecânica. Ausência de vazamento do injetor não comprova comando ou vazão corretos. A interpretação exige a unidade, as condições e a referência aplicável.

## Correção da conversa de partida sem giro

A sequência “não gira → dá clique → 12V → P35 → 1214 → SADAS” passa a preservar a tensão sem atribuir uma condição por conta própria. O sistema pergunta se os 12 V foram medidos antes ou durante a tentativa; as respostas seguintes recebem feedback específico e não inventam DTC, motor ou uma segunda tensão. Após receber as duas leituras, segue para a verificação dos terminais. Terminais negados como firmes, soltos ou danificados não são registrados como bons por conterem “sem oxidação”.

As três etapas finais de referência de partida agora recebem código de motor, ausência de referência e informações adicionais. Um código sintaticamente plausível é registrado como relato, sem comprovar compatibilidade ou determinar pinagem. Sem documentação aplicável, o caso fica explicitamente pendente e pode ser retomado com a referência ou novas medições; não se inventa um procedimento elétrico. Trechos de manual são reconhecidos, mas sua interpretação técnica não é validada automaticamente.

O estado parcial persiste ao reabrir o caso. Históricos antigos com “12V” recuperam o valor como leitura sem condição; texto do assistente não fornece uma tensão ausente. A mudança do sintoma ou de gira/não gira invalida as evidências dependentes do cenário anterior.

## Índice real reconstruído

Origem: branch `knowledge`, commit `2e8e0648d4123c715f73a458927520f6be2fd727`. Foram lidos os três shards compactados (13.167.862 bytes), com verificação TLS e validação dos JSONs/gzip. Não foi necessário baixar novamente o arquivo original de aproximadamente 2,9 GB.

| Métrica | Resultado |
| --- | ---: |
| Registros | 20.736 |
| Chaves DTC no índice publicado anterior | 228 |
| Chaves DTC após reconstrução | 294 |
| Termos indexados | 178.305 |
| Registros `source_extracted` | 9.660 |
| Registros `ocr_unverified` | 6.862 |
| Registros `unverified_strings` | 4.214 |

As chaves DTC são ocorrências sintáticas nos documentos, não 294 diagnósticos completos. `source_extracted` informa como o texto foi obtido; não comprova a validade da instrução ou sua aplicação ao veículo. OCR e strings de binários preservam suas limitações.

Revisão do índice reconstruído: `63115589ecb7731841ef8af3a7b173ce17c1768a8048cf49137fe952edc1147f`.

Os 20.736 registros, o mapa de buckets e todas as entradas DTC foram conferidos quanto à preservação de origem, página, método, confiança de extração e hash. O Chromium retornou três fontes de correia dentada/Golf tanto com o índice publicado quanto com o reconstruído. Essa consulta sem ano/motor demonstra busca documental; não autoriza aplicar os intervalos desses documentos a um Golf de outra geração.

## Cobertura e limites conhecidos

- DF026/Duster continua ausente do corpus remoto, inclusive após a reconstrução. A aplicação dispõe de um resumo local V42, condicionado ao sistema e à aplicação, com o original indisponível no checkout. A busca não deve preencher essa lacuna com material de outro veículo.
- Os nomes de manuais locais foram registrados conforme `docs/INGESTAO.md`. Não foram inventados páginas, hashes ou URLs para os PDFs ausentes. Anos explicitamente fora das referências locais são rejeitados; valores técnicos específicos exigem informação do ano.
- A exportação Firebase fornecida contém 26 casos sob oito identificadores anônimos. A auditoria não encontrou reparos confirmados com ausência da falha nas condições originais. Esses dados não permitem calcular sensibilidade, taxa de acerto ou sucesso de reparo. Nenhuma conversa ou identificador pessoal foi copiado para os testes ou esta documentação.
- A interpretação de linguagem e a compatibilidade são baseadas em regras. Formas de relato fora da cobertura podem exigir confirmação; os testes não comprovam entendimento irrestrito.
- A integração Firebase exige `www.gstatic.com`, `identitytoolkit.googleapis.com`, `securetoken.googleapis.com` e `mecanico-b222e-default-rtdb.firebaseio.com`. O bloqueio inicial de rede desta máquina deixou de ocorrer durante a publicação; autenticação anônima, gravação e leitura foram então verificadas no site público. As regras continuam impedindo leitura anônima sem identidade e separando os históricos por UID.

## Reproduzir

No checkout:

```bash
node --test scripts/test_*.cjs
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts -p 'test_*.py' -v
```

Com servidor local iniciado e Playwright/Chromium disponíveis:

```bash
node scripts/smoke_browser.cjs
```

Para reconstruir o índice a partir de um diretório contendo `manifest.json` e `brain/` do branch `knowledge`:

```bash
python3 scripts/build_compact_knowledge.py --knowledge-dir /caminho/knowledge --out /caminho/compact
MECANICO_KNOWLEDGE_DIR=/caminho/compact node scripts/smoke_browser.cjs
```

Nesta máquina, os diretórios preparados estão em `/workspace/.cloud-setup/MECANICO/knowledge-source` e `/workspace/.cloud-setup/MECANICO/knowledge-compact`. Os artefatos volumosos ficam fora do checkout.

## Publicação pública confirmada

A primeira publicação desta revisão da aplicação foi enviada ao `main` no commit `201cd4f19695e3f17cf9ee24d8d1990e406a72dd`. O GitHub Pages concluiu build e deploy com sucesso: [execução 38928638957](https://github.com/tsvalencio-IA/MECANICO/actions/runs/38928638957). A [validação do código](https://github.com/tsvalencio-IA/MECANICO/actions/runs/38928640021) também passou.

Site: https://tsvalencio-ia.github.io/MECANICO/

O índice foi reconstruído e publicado pelo [workflow 38928640154](https://github.com/tsvalencio-IA/MECANICO/actions/runs/38928640154), com sucesso. O branch `knowledge-compact` passou ao commit `1e4655442dbe37252b703928752cbfb636454a60`; seu manifest tem a mesma revisão, contagens e procedência do índice validado localmente.

O endereço público e os arquivos atualizados responderam HTTP 200. O smoke no Chromium passou no próprio domínio público, com o índice publicado de 20.736 registros e 294 chaves DTC e com o teste de persistência Firebase descrito acima.

O workflow `pages.yml` valida o código. A publicação existente do GitHub Pages é executada separadamente pelo workflow dinâmico `pages build and deployment` após atualizar o `main`. Não foi necessário trocar a configuração de hospedagem.

A comprovação de precisão em oficina requer casos adicionais com veículo/motor identificados, medições, defeito confirmado, reparo efetuado e repetição da condição original sem falha. Esse resultado não foi presumido a partir dos testes de software.
