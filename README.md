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

---

**Powered by thIAguinho Soluções Automotiva**
