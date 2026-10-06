# ORÁCULO AUTOMOTIVO — IA MECÂNICO

Sistema de diagnóstico automotivo orientado por evidências.

> **Não adivinha. Testa.**

## O que já existe

- PWA mobile-first para uso em oficina;
- triagem por veículo, sintomas, DTCs e medições;
- motor local de ranking técnico;
- próximos testes guiados com registro do resultado;
- fontes rastreáveis;
- biblioteca técnica com status real: **indexada** x **apenas registrada**;
- histórico local de casos;
- funcionamento offline dos arquivos estáticos;
- deploy automático por GitHub Pages.

## Base técnica inicial

A primeira versão usa conhecimento derivado dos materiais fornecidos ao projeto:

- **Dacia-Duster-Renault-Duster_2009-2017.pdf** — 2.372 páginas;
- **2011-RENAULT DUSTER 1.6 16V.pdf** — esquema de injeção Valeo V42;
- **[LEXUS]_Esquemas_electricos_Lexus_2002_a_2005.pdf** — EWD;
- **PLATAFORMA+AUTO+DATA (1).pdf** — classificado corretamente como página de acesso, não como base técnica.

Arquivos grandes registrados para ingestão posterior:

- CONHECIMENTO.ZIP
- SIMPLO-2019.rar
- ePER-CatalogoPartes.rar
- AUTODATA 3.45.rar

O sistema **não finge** que um arquivo compactado já foi lido. Ele só vira conhecimento após extração e indexação.

## Arquitetura

    Google Drive / acervo original
            ↓
    inventário + extração
            ↓
    normalização técnica
            ↓
    índice de conhecimento
            ↓
    motor de diagnóstico
            ↓
    teste → resultado → reavaliação
            ↓
    caso confirmado da oficina

## Publicação

O workflow .github/workflows/pages.yml publica o projeto no GitHub Pages a cada push na main.

Se o Pages ainda não estiver ativado:

**Settings → Pages → Build and deployment → Source → GitHub Actions**

Depois, o endereço esperado é:

https://tsvalencio-ia.github.io/MECANICO/

## Próxima fase

A próxima evolução não é “colocar PDFs no prompt”. É construir o indexador dos acervos grandes, preservar diagramas/páginas e conectar histórico real de oficina.

Detalhes: docs/INGESTAO.md

---

**Powered by thIAguinho Soluções Digitais**
