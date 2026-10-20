# Backend MECÂNICO IA (isolado)
Serviço Vercel Node.js, sem acesso privilegiado ao Firebase e sem dependências externas.
POST /api/diagnose exige usuário com Firebase ID token RS256 válido para o projeto mecanico-b222e e Origin https://tsvalencio-ia.github.io.
Os únicos dados aceitos para IA são textos, contexto técnico e snippets selecionados pela busca local. Não recebe fotos, vídeos nem exportações integrais.
Credenciais de terceiros nunca são embutidas na aplicação pública. Em Vercel, OIDC deve estar habilitado para autenticar no AI Gateway; como alternativa, GROQ_API_KEY via variável privada do projeto.
GET /api/diagnose retorna disponibilidade sem expor credenciais.
Limite por instância 8 requests/15 minutos/identidade/IP é apenas proteção preliminar. Exigir controle distribuído de orçamento/quota antes de volume de produção.
O provedor pode processar os textos transmitidos; cliente precisa optar explicitamente antes do envio.
Modelo inicial openai/gpt-oss-120b; não é validação da precisão de oficina. O sistema local permanece operacional se a IA estiver indisponível.
