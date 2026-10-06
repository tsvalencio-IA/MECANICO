# Pipeline de ingestão — Oráculo Automotivo

## Objetivo

Transformar acervos grandes em conhecimento consultável sem colocar dezenas de GB dentro do GitHub.

## Regra de ouro

O arquivo original é imutável. A ingestão gera derivados: inventário, texto extraído, tabelas, páginas/diagramas referenciados e índice de busca.

## Camadas

1. **Origem**
   - Google Drive / armazenamento de arquivos.
   - PDFs, ZIPs, RARs, imagens, bases e catálogos.

2. **Inventário**
   - nome, hash, tamanho, tipo, marca/modelo/ano quando identificável.
   - status: registrado → extraído → indexado → validado.

3. **Extração**
   - texto por página/seção;
   - tabelas estruturadas;
   - DTCs e equivalências;
   - componentes, pinos, conectores, fusíveis e relés;
   - imagens/diagramas preservados com referência à página.

4. **Normalização**
   - marca → modelo → ano → motor → câmbio → sistema → componente;
   - sintoma → DTC → teste → valor esperado → resultado → próxima ação.

5. **Busca**
   - lexical: códigos, pinos, referências exatas;
   - semântica: sintomas e procedimentos;
   - filtros fortes por veículo e sistema;
   - reranking por fonte e compatibilidade.

6. **Resposta**
   - separar claramente:
     - fato documental;
     - inferência técnica;
     - histórico de oficina;
     - hipótese ainda não confirmada.

## Fontes registradas em 06/10/2026

- Dacia-Duster-Renault-Duster_2009-2017.pdf — indexação inicial disponível.
- 2011-RENAULT DUSTER 1.6 16V.pdf — esquema Valeo V42.
- [LEXUS]_Esquemas_electricos_Lexus_2002_a_2005.pdf — EWD.
- PLATAFORMA+AUTO+DATA (1).pdf — apenas página de acesso.
- CONHECIMENTO.ZIP — ~2,69 GB — registrado, ainda não extraído.
- SIMPLO-2019.rar — ~10,60 GB — registrado, ainda não extraído.
- ePER-CatalogoPartes.rar — ~6,24 GB — registrado, ainda não extraído.
- AUTODATA 3.45.rar — ~7,76 GB — registrado, ainda não extraído.

## Critérios para o IA Mecânico

- Não inventar pinagem, torque, pressão ou tolerância.
- Não usar dado de modelo/ano diferente sem declarar a extrapolação.
- Não condenar ECU ou módulo antes de alimentação, aterramento, rede e sinais essenciais.
- Sempre registrar a fonte e a seção/página quando disponível.
- Após reparo, prever verificação final e teste na condição original da falha.
