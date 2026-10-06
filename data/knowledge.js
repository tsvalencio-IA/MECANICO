window.ORACLE_KNOWLEDGE = {
  version: "0.1.0",
  updatedAt: "2026-10-06",
  philosophy: [
    "Nunca condenar componente antes de verificar alimentação, aterramento e sinal quando aplicável.",
    "Distinguir fato documental, inferência técnica e hipótese de oficina.",
    "Toda resposta importante deve apontar a fonte ou declarar que é heurística.",
    "Após reparo, repetir leitura de falhas, teste funcional e, quando aplicável, teste de rodagem."
  ],
  sources: [
    {
      id: "duster-workshop",
      title: "Dacia-Duster-Renault-Duster_2009-2017.pdf",
      type: "Manual de oficina / diagnóstico",
      state: "indexed",
      pages: 2372,
      size: "27,4 MB",
      vehicles: ["Renault Duster", "Dacia Duster"],
      systems: ["motor", "injeção", "diesel", "elétrica", "UCH", "ABS/ESP", "climatização", "carroceria", "câmbio", "direção"],
      ref: "MR-453-X79",
      notes: "Base extensa com especificações, procedimentos, tabelas de falhas, testes, parâmetros e fluxos de diagnóstico."
    },
    {
      id: "duster-v42",
      title: "2011-RENAULT DUSTER 1.6 16V.pdf",
      type: "Esquema elétrico",
      state: "indexed",
      pages: 2,
      size: "2 páginas",
      vehicles: ["Renault Duster 1.6 16V 2011+"],
      systems: ["injeção Valeo V42", "ECU", "bobinas", "injetores", "CKP", "MAP", "ECT", "TPS", "sondas", "eletroventilador"],
      ref: "DICATEC • Valeo V42",
      notes: "Diagrama gráfico de injeção com alimentação, relés, sensores, atuadores e conectores."
    },
    {
      id: "lexus-ewd",
      title: "[LEXUS]_Esquemas_electricos_Lexus_2002_a_2005.pdf",
      type: "Diagramas elétricos",
      state: "indexed",
      pages: 43,
      size: "43 páginas",
      vehicles: ["Lexus IS 300 2002"],
      systems: ["partida", "ignição", "carga", "ECM", "bomba combustível", "injeção", "iluminação"],
      ref: "EWD451U",
      notes: "Diagramas elétricos com alimentação, ignição, partida, ECM, bobinas, sensores e circuitos associados."
    },
    {
      id: "autodata-link",
      title: "PLATAFORMA+AUTO+DATA (1).pdf",
      type: "Página de acesso",
      state: "indexed",
      pages: 1,
      size: "1 página",
      vehicles: [],
      systems: [],
      ref: "Documento de acesso",
      notes: "Não contém a base AutoData. Apenas uma página com referência a plataforma externa."
    },
    {
      id: "knowledge-zip",
      title: "CONHECIMENTO.ZIP",
      type: "Acervo compactado",
      state: "registered",
      pages: null,
      size: "2,69 GB",
      vehicles: [],
      systems: ["acervo geral"],
      ref: "Google Drive",
      notes: "Arquivo de origem registrado; conteúdo interno ainda precisa ser extraído e indexado."
    },
    {
      id: "simplo",
      title: "SIMPLO-2019.rar",
      type: "Base técnica compactada",
      state: "registered",
      pages: null,
      size: "10,60 GB",
      vehicles: [],
      systems: ["diagnóstico", "manuais", "esquemas"],
      ref: "Google Drive",
      notes: "Registrado no inventário. Não tratado como conhecimento lido até extração/indexação."
    },
    {
      id: "eper",
      title: "ePER-CatalogoPartes.rar",
      type: "Catálogo de peças compactado",
      state: "registered",
      pages: null,
      size: "6,24 GB",
      vehicles: [],
      systems: ["catálogo de peças", "aplicação", "códigos"],
      ref: "Google Drive",
      notes: "Registrado no inventário. Deve alimentar relações peça ↔ aplicação ↔ código após extração."
    },
    {
      id: "autodata345",
      title: "AUTODATA 3.45.rar",
      type: "Base técnica compactada",
      state: "registered",
      pages: null,
      size: "7,76 GB",
      vehicles: [],
      systems: ["dados técnicos", "manutenção", "diagnóstico"],
      ref: "Google Drive",
      notes: "Registrado no inventário. Ainda não indexado."
    }
  ],
  dtcs: {
    "P0300": {label:"Falha de combustão aleatória/múltipla", source:"duster-workshop", aliases:["DF065"]},
    "P0301": {label:"Falha de combustão cilindro 1", source:"duster-workshop", aliases:["DF059"]},
    "P0302": {label:"Falha de combustão cilindro 2", source:"duster-workshop", aliases:["DF060"]},
    "P0303": {label:"Falha de combustão cilindro 3", source:"duster-workshop", aliases:["DF061"]},
    "P0304": {label:"Falha de combustão cilindro 4", source:"duster-workshop", aliases:["DF062"]},
    "P0335": {label:"Sinal do sensor de rotação / PMS", source:"duster-workshop", aliases:["DF120"]},
    "P0420": {label:"Eficiência do catalisador", source:"duster-workshop", aliases:["DF394"]},
    "P0130": {label:"Circuito sonda lambda antes do catalisador", source:"duster-workshop", aliases:["DF092"]},
    "P0136": {label:"Circuito sonda lambda depois do catalisador", source:"duster-workshop", aliases:["DF093"]},
    "P0120": {label:"Circuito potenciômetro da borboleta pista 1", source:"duster-workshop", aliases:["DF095"]},
    "P0220": {label:"Circuito potenciômetro da borboleta pista 2", source:"duster-workshop", aliases:["DF096"]},
    "P0500": {label:"Sinal de velocidade do veículo", source:"duster-workshop", aliases:["DF091"]},
    "P0560": {label:"Tensão de alimentação da ECU", source:"duster-workshop", aliases:["DF047"]},
    "P0627": {label:"Comando do relé da bomba de combustível", source:"duster-workshop", aliases:["DF085"]}
  },
  rules: [
    {
      id:"misfire-duster-v42",
      title:"Falha de combustão — Duster 1.6 16V / Valeo V42",
      brands:["renault","dacia"],
      models:["duster"],
      engines:["1.6","k4m"],
      dtcs:["P0300","P0301","P0302","P0303","P0304","DF059","DF060","DF061","DF062"],
      keywords:["falha","falhando","rateia","engasga","cilindro","misfire","vibra"],
      sourceIds:["duster-workshop","duster-v42"],
      hypotheses:[
        {name:"Ignição do cilindro afetado", why:"A falha individual deve ser separada entre centelha, combustível e condição mecânica antes de substituir componentes.", weight:92},
        {name:"Injetor / comando do injetor", why:"O sistema Valeo V42 possui comando individual de injetores e a documentação separa falhas de circuito por cilindro.", weight:84},
        {name:"Compressão / condição mecânica", why:"Se ignição e injeção estiverem confirmadas, o teste mecânico passa a ter prioridade.", weight:74},
        {name:"Mistura / combustível / entrada falsa de ar", why:"Falha múltipla ou em mais de um cilindro exige olhar causa comum antes de componentes individuais.", weight:68}
      ],
      tests:[
        {id:"spark-swap",title:"Separar ignição de combustível",procedure:"Com a falha presente, confirme centelha e faça teste comparativo do componente de ignição do cilindro afetado sem comprar peça. Se a falha migrar junto com o componente, a evidência muda de cilindro.",good:"falha não migrou",bad:"falha migrou com o componente"},
        {id:"injector-command",title:"Confirmar comando do injetor",procedure:"Verifique alimentação e pulso/comando do injetor do cilindro afetado. Compare com cilindro funcional. Não condene ECU sem verificar chicote e conector.",good:"alimentação e comando presentes",bad:"alimentação ou comando ausente"},
        {id:"compression",title:"Confirmar integridade mecânica",procedure:"Faça compressão relativa ou convencional e compare cilindros. Diferença relevante exige investigar vedação antes de insistir em ignição/injeção.",good:"compressões equilibradas",bad:"cilindro com compressão inferior"}
      ],
      warnings:["Não trocar bobina, vela ou injetor apenas pelo P030X.","Depois do reparo: apagar falhas, repetir leitura e testar em condição que reproduzia o defeito."]
    },
    {
      id:"duster-no-start-ckp",
      title:"Não pega / morre — alimentação, rotação e combustível",
      brands:["renault","dacia"],
      models:["duster"],
      engines:["1.6","k4m"],
      dtcs:["P0335","DF120","P0627","DF085","P0560","DF047"],
      keywords:["não pega","nao pega","morre","apagou","sem partida","não funciona","nao funciona","sem pulso"],
      sourceIds:["duster-workshop","duster-v42"],
      hypotheses:[
        {name:"Sinal de rotação / PMS (CKP)",why:"Sem referência de rotação confiável a estratégia de injeção/ignição pode ser interrompida.",weight:94},
        {name:"Alimentação principal / relé / tensão ECU",why:"O esquema V42 mostra alimentação da ECU e relés principais como pontos estruturais do sistema.",weight:90},
        {name:"Comando e alimentação da bomba",why:"A tabela de falhas da injeção inclui circuito de comando do relé da bomba.",weight:85},
        {name:"Imobilizador / autorização de partida",why:"Se alimentação, rotação e combustível estiverem corretos, autorização de partida precisa ser verificada.",weight:66}
      ],
      tests:[
        {id:"rpm-crank",title:"RPM durante partida",procedure:"No scanner, observe rotação do motor enquanto aciona a partida. Se o valor permanecer zero, priorize CKP, conector, chicote e alimentação/referência conforme o circuito.",good:"scanner lê RPM coerente",bad:"0 rpm ou sinal instável"},
        {id:"ecu-supply",title:"Carga real na alimentação",procedure:"Confirme +12 V, pós-chave e aterramentos da ECU/relés sob carga. Use lâmpada de teste quando apropriado, não apenas tensão em circuito aberto.",good:"alimentações e terras sustentam carga",bad:"queda de tensão ou alimentação ausente"},
        {id:"fuel-relay",title:"Bomba de combustível",procedure:"Confirme comando do relé, alimentação da bomba e pressão/entrega. Separe falha elétrica de falha hidráulica.",good:"comando e pressão corretos",bad:"comando, alimentação ou pressão incorretos"}
      ],
      warnings:["Um sensor CKP pode falhar intermitente e o manuseio do chicote pode alterar temporariamente a falha.","Não substituir ECU antes de provar alimentação, terra, rede e sinais essenciais."]
    },
    {
      id:"generic-wiring",
      title:"Falha elétrica / intermitente — método de chicote",
      brands:[],
      models:[],
      engines:[],
      dtcs:[],
      keywords:["intermitente","chicote","elétric","eletric","conector","oxidação","oxidacao","mau contato","sem sinal","curto"],
      sourceIds:["duster-workshop"],
      hypotheses:[
        {name:"Conector / terminal / chicote",why:"O manual orienta inspeção física, travamento, oxidação, deformação e manipulação monitorada do circuito.",weight:88},
        {name:"Alimentação ou aterramento sob carga",why:"Medição sem carga pode mascarar resistência de contato; confirmar queda de tensão evita falso diagnóstico.",weight:82}
      ],
      tests:[
        {id:"connector-inspection",title:"Inspeção dirigida de conector",procedure:"Inspecione travas, terminais recuados ou abertos, oxidação, marcas de calor, contaminação e dano próximo à saída dos fios. Manipule o chicote enquanto monitora o parâmetro ou circuito.",good:"sem alteração e contatos íntegros",bad:"falha reage à manipulação ou há dano visual"},
        {id:"continuity",title:"Continuidade com circuito isolado",procedure:"Com as extremidades desconectadas quando o procedimento permitir, compare a continuidade com o valor esperado da documentação. No manual Duster consultado, vários testes orientam continuidade próxima de 1 Ω ± 1 Ω por ligação.",good:"continuidade dentro do esperado",bad:"aberto ou resistência elevada"}
      ],
      warnings:["Desconectar e reconectar pode esconder temporariamente mau contato.","Não perfure isolação de chicote sem necessidade; preserve vedação e terminais."]
    },
    {
      id:"lexus-start-charge",
      title:"Lexus IS 300 — partida, ignição e carga",
      brands:["lexus"],
      models:["is 300","is300"],
      engines:[],
      dtcs:[],
      keywords:["não pega","nao pega","partida","starter","carga","alternador","ignição","ignicao","sem partida"],
      sourceIds:["lexus-ewd"],
      hypotheses:[
        {name:"Distribuição de alimentação / fusíveis principais",why:"O EWD mostra bateria, fusíveis principais, chave de ignição e ramificações de alimentação antes dos consumidores.",weight:90},
        {name:"Circuito de partida / relé / posição P-N",why:"O diagrama liga chave de ignição, starter e sinal de posição Park/Neutral no caminho de partida.",weight:86},
        {name:"ECM / ignição",why:"O EWD também relaciona ECM, igniter e bobinas ao sistema de ignição.",weight:78}
      ],
      tests:[
        {id:"lexus-power",title:"Rastrear alimentação pelo EWD",procedure:"Comece na bateria e nos fusíveis principais; confirme tensão e continuidade pelo circuito até chave/relé/carga afetada, usando o diagrama EWD451U.",good:"alimentação chega ao estágio seguinte",bad:"alimentação some em um ponto do circuito"},
        {id:"lexus-starter",title:"Comando de partida",procedure:"Confirme sinal de partida, condição Park/Neutral quando automático e comando no starter. O ponto onde o sinal desaparece define a próxima verificação.",good:"comando chega ao starter",bad:"comando não chega"}
      ],
      warnings:["Use o diagrama do ano/sistema correspondente; não extrapole pinagem para outro modelo sem confirmar."]
    },
    {
      id:"generic-overheat",
      title:"Superaquecimento — separar circulação, comando e troca térmica",
      brands:[],
      models:[],
      engines:[],
      dtcs:["P0217","DF721"],
      keywords:["esquenta","esquentando","superaquece","temperatura","ferve","ventoinha","eletroventilador"],
      sourceIds:["duster-workshop","duster-v42"],
      hypotheses:[
        {name:"Comando do eletroventilador / relés",why:"A documentação V42 representa relés de velocidades do eletroventilador e sensor ECT no circuito.",weight:86},
        {name:"Leitura incorreta de temperatura",why:"ECT incoerente altera decisão de comando e pode gerar diagnóstico errado se a temperatura real não for comparada.",weight:80},
        {name:"Circulação / troca térmica",why:"Se leitura e comando elétrico estiverem corretos, a investigação deve migrar para circulação e capacidade térmica.",weight:74}
      ],
      tests:[
        {id:"ect-compare",title:"Comparar ECT com temperatura real",procedure:"A frio, compare ECT com temperatura ambiente. Durante aquecimento, acompanhe evolução e compare com medição independente quando possível.",good:"leitura coerente e progressiva",bad:"leitura deslocada, travada ou intermitente"},
        {id:"fan-command",title:"Comando das velocidades da ventoinha",procedure:"Confirme se a ECU solicita o acionamento e se relé/alimentação entregam tensão ao eletroventilador. Separe comando de potência.",good:"comando e potência presentes",bad:"falta comando ou falta potência"}
      ],
      warnings:["Não abrir reservatório pressurizado quente.","Não condenar junta do cabeçote apenas por temperatura alta; primeiro documente evidências."]
    }
  ]
};