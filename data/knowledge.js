window.ORACLE_KNOWLEDGE = {
  version: "1.0.0",
  updatedAt: "2026-10-06",
  philosophy: [
    "Nunca condenar componente apenas por sintoma ou DTC.",
    "Separar alimentação, aterramento, sinal, comando, componente e condição mecânica.",
    "Quando houver valor documental específico, usar o valor somente no veículo/sistema compatível.",
    "Quando não houver dado específico, declarar que o passo é heurística de oficina.",
    "Depois do reparo, limpar falhas quando aplicável, reproduzir a condição original e repetir a leitura."
  ],

  /* Registro interno. Não é exibido na interface. */
  sources: [
    {id:"duster-workshop", vehicle:"Renault/Dacia Duster", system:"manual de oficina e diagnóstico", indexed:true},
    {id:"duster-v42", vehicle:"Renault Duster 1.6 16V", system:"injeção Valeo V42 / esquema elétrico", indexed:true},
    {id:"lexus-ewd", vehicle:"Lexus IS 300", system:"diagramas elétricos EWD", indexed:true}
  ],

  dtcs: {
    "P0300": {label:"Falha de combustão aleatória/múltipla",aliases:["DF065"],scope:["renault","duster"]},
    "P0301": {label:"Falha de combustão cilindro 1",aliases:["DF059"],scope:["renault","duster"]},
    "P0302": {label:"Falha de combustão cilindro 2",aliases:["DF060"],scope:["renault","duster"]},
    "P0303": {label:"Falha de combustão cilindro 3",aliases:["DF061"],scope:["renault","duster"]},
    "P0304": {label:"Falha de combustão cilindro 4",aliases:["DF062"],scope:["renault","duster"]},
    "P0335": {label:"Sinal do sensor de rotação / PMS",aliases:["DF120"],scope:["renault","duster"]},
    "P0420": {label:"Eficiência do catalisador",aliases:["DF394"],scope:["renault","duster"]},
    "P0130": {label:"Circuito da sonda lambda antes do catalisador",aliases:["DF092"],scope:["renault","duster"]},
    "P0136": {label:"Circuito da sonda lambda depois do catalisador",aliases:["DF093"],scope:["renault","duster"]},
    "P0120": {label:"Circuito do potenciômetro da borboleta pista 1",aliases:["DF095"],scope:["renault","duster"]},
    "P0220": {label:"Circuito do potenciômetro da borboleta pista 2",aliases:["DF096"],scope:["renault","duster"]},
    "P0500": {label:"Sinal de velocidade do veículo",aliases:["DF091"],scope:["renault","duster"]},
    "P0560": {label:"Tensão de alimentação da ECU",aliases:["DF047"],scope:["renault","duster"]},
    "P0627": {label:"Comando do relé da bomba de combustível",aliases:["DF085"],scope:["renault","duster"]},

    "DF001": {label:"Circuito do sensor de temperatura do líquido de arrefecimento",aliases:["P0115"],scope:["renault","duster","v42"]},
    "DF002": {label:"Circuito do sensor de temperatura do ar",aliases:["P0095"],scope:["renault","duster","v42"]},
    "DF018": {label:"Comando do relé do eletroventilador em baixa velocidade",aliases:["P0480"],scope:["renault","duster","v42"]},
    "DF026": {label:"Circuito de comando do injetor do cilindro 1",aliases:["P0201"],scope:["renault","duster","v42"]},
    "DF027": {label:"Circuito de comando do injetor do cilindro 2",aliases:["P0202"],scope:["renault","duster","v42"]},
    "DF028": {label:"Circuito de comando do injetor do cilindro 3",aliases:["P0203"],scope:["renault","duster","v42"]},
    "DF029": {label:"Circuito de comando do injetor do cilindro 4",aliases:["P0204"],scope:["renault","duster","v42"]},
    "DF038": {label:"Falha interna do computador de injeção",aliases:["P0606"],scope:["renault","duster","v42"]},
    "DF047": {label:"Tensão de alimentação do computador",aliases:["P0560"],scope:["renault","duster","v42"]},
    "DF085": {label:"Circuito de comando do relé da bomba de combustível",aliases:["P0627"],scope:["renault","duster","v42"]},
    "DF088": {label:"Circuito do sensor de detonação",aliases:["P0325"],scope:["renault","duster","v42"]},
    "DF342": {label:"Circuito da luz indicadora de avaria",scope:["renault","duster","v42"]},
    "DF361": {label:"Circuito de bobina de ignição 1-4",aliases:["P1351"],scope:["renault","duster","v42"]},
    "DF398": {label:"Correção / mistura - investigar pressão, entrada falsa de ar, vazamentos e vedação de injetor",aliases:["P0170"],scope:["renault","duster","v42"]},
    "DF409": {label:"Circuito do sensor de nível de combustível",aliases:["P0461"],scope:["renault","duster","v42"]},
    "DF457": {label:"Alvo do volante / referência de PMS",aliases:["P0315"],scope:["renault","duster","v42"]},
    "DF974": {label:"Circuito do potenciômetro do pedal - pista 1",aliases:["P0225"],scope:["renault","duster","v42"]},
    "DF975": {label:"Circuito do potenciômetro do pedal - pista 2",aliases:["P2120"],scope:["renault","duster","v42"]}
    ,"DF011": {label:"Tensão de alimentação dos sensores nº 1",aliases:["P0641"],scope:["renault","duster","v42"]}
    ,"DF012": {label:"Tensão de alimentação dos sensores nº 2",aliases:["P0651"],scope:["renault","duster","v42"]}
    ,"DF015": {label:"Circuito de comando do relé principal",aliases:["P0657"],scope:["renault","duster","v42"]}
    ,"DF050": {label:"Circuito do interruptor do freio",aliases:["P0571"],scope:["renault","duster","v42"]}
    ,"DF078": {label:"Circuito de comando da borboleta motorizada",aliases:["P2100"],scope:["renault","duster","v42"]}
    ,"DF079": {label:"Controle automático da borboleta motorizada",aliases:["P2119"],scope:["renault","duster","v42"]}
    ,"DF081": {label:"Circuito da válvula de purga do cânister",aliases:["P0443"],scope:["renault","duster","v42"]}
    ,"DF082": {label:"Circuito do aquecedor da sonda lambda anterior",aliases:["P0135"],scope:["renault","duster","v42"]}
    ,"DF083": {label:"Circuito do aquecedor da sonda lambda posterior",aliases:["P0141"],scope:["renault","duster","v42"]}
    ,"DF101": {label:"Conexão multiplexada ESP",aliases:["C121"],scope:["renault","duster","v42"]}
    ,"DF102": {label:"Sinal de potência disponível do alternador",aliases:["P2503"],scope:["renault","duster","v42"]}
    ,"DF109": {label:"Falha de combustão com baixo nível de combustível",aliases:["P0313"],scope:["renault","duster","v42"]}
    ,"DF362": {label:"Circuito das bobinas de ignição 2-3",aliases:["P1352"],scope:["renault","duster","v42"]}
    ,"DF532": {label:"Sinal de carga do alternador",aliases:["P2502"],scope:["renault","duster","v42"]}
    ,"DF556": {label:"Coerência entre posição do pedal e borboleta",aliases:["P2135"],scope:["renault","duster","v42"]}
    ,"DF631": {label:"Sinal do interruptor da luz de freio",aliases:["P0703"],scope:["renault","duster","v42"]}
    ,"DF648": {label:"Falha interna / processamento do computador",aliases:["P060B"],scope:["renault","duster","v42"]}
    ,"DF721": {label:"Superaquecimento do motor",aliases:["P0217"],scope:["renault","duster","v42"]}
    ,"DF884": {label:"Relé da bomba do circuito adicional de combustível",aliases:["P2632"],scope:["renault","duster","v42"]}
    ,"DF887": {label:"Coerência entre freio e posição do acelerador",aliases:["P0226"],scope:["renault","duster","v42"]}
    ,"DF894": {label:"Válvula solenoide do circuito adicional de combustível",aliases:["P1633"],scope:["renault","duster","v42"]}
    ,"DF992": {label:"Circuito do relé do aquecedor adicional 1",aliases:["P1644"],scope:["renault","duster","v42"]}
    ,"DF993": {label:"Circuito do relé do aquecedor adicional 2",aliases:["P1645"],scope:["renault","duster","v42"]}
    ,"DF994": {label:"Circuito do relé do aquecedor adicional 3",aliases:["P1646"],scope:["renault","duster","v42"]}
    ,"DF1015": {label:"Coerência do sinal do interruptor do freio",aliases:["P0504"],scope:["renault","duster","v42"]}
    ,"DF1017": {label:"Falha de processamento do computador",aliases:["P061A"],scope:["renault","duster","v42"]}
    ,"DF1058": {label:"Coerência da pressão de admissão",aliases:["P0106"],scope:["renault","duster","v42"]}
    ,"DF1063": {label:"Conexão multiplexada ESP",aliases:["C415"],scope:["renault","duster","v42"]}
    ,"DF1068": {label:"Tensão do sensor de pressão do refrigerante do A/C",aliases:["P0530"],scope:["renault","duster","v42"]}
    ,"DF1072": {label:"Comando do relé do compressor do ar-condicionado",aliases:["P0645"],scope:["renault","duster","v42"]}
    ,"DF1074": {label:"Posição incoerente da borboleta motorizada",aliases:["P0638"],scope:["renault","duster","v42"]}
    ,"DF1355": {label:"Conexão multiplexada do regulador de torque",aliases:["P1656"],scope:["renault","duster","v42"]}
  },

  parameters: {
    "PR002":"Carga do alternador",
    "PR015":"Torque do motor",
    "PR030":"Posição do pedal do acelerador",
    "PR037":"Pressão do refrigerante do ar-condicionado",
    "PR041":"Pressão de sobrealimentação",
    "PR055":"Rotação do motor",
    "PR059":"Temperatura do ar de admissão",
    "PR064":"Temperatura do líquido de arrefecimento",
    "PR071":"Tensão de alimentação do computador",
    "PR084":"Tensão do sensor de temperatura do líquido",
    "PR089":"Velocidade do veículo",
    "PR097":"Valor programado do batente inferior da borboleta",
    "PR098":"Tensão da sonda lambda anterior",
    "PR099":"Tensão da sonda lambda posterior",
    "PR102":"OCR da válvula de purga do cânister",
    "PR118":"Posição medida da borboleta - pista 1",
    "PR119":"Posição medida da borboleta - pista 2",
    "PR138":"Correção de riqueza",
    "PR139":"Adaptação de riqueza em funcionamento",
    "PR147":"Tensão do potenciômetro do pedal - pista 1",
    "PR148":"Tensão do potenciômetro do pedal - pista 2",
    "PR215":"Tensão de alimentação de sensores nº 1",
    "PR216":"Tensão de alimentação de sensores nº 2",
    "PR312":"Vácuo do coletor de admissão",
    "PR313":"Pressão linearizada do coletor",
    "PR344":"Tensão do sensor de pressão",
    "PR427":"Sinal médio de detonação",
    "PR429":"Posição medida da borboleta",
    "PR444":"Correção integral da marcha lenta",
    "PR446":"Resistência do aquecedor da sonda O2 anterior",
    "PR447":"Resistência do aquecedor da sonda O2 posterior",
    "PR448":"Avanço de ignição",
    "PR469":"Valor de detonação do cilindro 1",
    "PR471":"Valor de detonação do cilindro 2",
    "PR473":"Valor de detonação do cilindro 3",
    "PR475":"Valor de detonação do cilindro 4",
    "PR492":"Consigna de posição da borboleta motorizada",
    "PR538":"Tensão medida da borboleta - pista 2",
    "PR539":"Tensão medida da borboleta - pista 1",
    "PR606":"Correção adaptativa da marcha lenta",
    "PR624":"Offset de programação da regulação de riqueza",
    "PR625":"Ganho de programação da regulação de riqueza",
    "PR770":"Offset do comando de válvulas",
    "PR814":"Número de resistências de aquecimento ativas",
    "PR831":"Contador de falhas de combustão",
    "PR832":"Contador de falhas de combustão",
    "PR833":"Contador de falhas de combustão",
    "PR834":"Contador de falhas de combustão",
    "PR847":"Tensão do sensor de temperatura do ar de admissão",
    "PR872":"Tensão do sensor de pressão do refrigerante",
    "PR877":"Temperatura estimada do óleo do motor",
    "PR887":"Valor programado de segurança da borboleta",
    "PR931":"Pressão bruta de sobrealimentação",
    "PR1026":"Contador de perda de sincronismo do virabrequim",
    "PR1029":"Potência do alternador",
    "PR1129":"Duração do contato de freio nº 1",
    "PR1153":"Duração do contato de freio nº 2"
  },

  facts: [
    {
      id:"v42-refrigerant-pressure",
      brands:["renault","dacia"],models:["duster"],engines:[],systems:["ar-condicionado","pressão"],
      keywords:["pr037","refrigerante","ar condicionado","ar-condicionado","pressão a/c","pressao a/c"],
      value:"No PR037 do V42, a pressão do refrigerante deve ficar entre 2 bar e 27 bar na condição de verificação indicada pelo procedimento.",
      sourceIds:["duster-workshop"],documented:true
    },
    {
      id:"k4m-injector-resistance",
      brands:["renault","dacia"],models:["duster"],engines:["k4m","1.6"],systems:["injeção","injetor"],
      keywords:["injetor","bico","resistencia","resistência","ohm","df026","df027","df028","df029"],
      value:"Nos injetores do K4M, a resistência indicada no procedimento V42 é 11 Ω a 20 Ω, medida entre 0 °C e 40 °C.",
      sourceIds:["duster-workshop"],documented:true
    },
    {
      id:"k7m-injector-resistance",
      brands:["renault","dacia"],models:["duster"],engines:["k7m"],systems:["injeção","injetor"],
      keywords:["injetor","bico","resistencia","resistência","ohm","df026","df027","df028","df029"],
      value:"Nos injetores do K7M, a resistência indicada no procedimento V42 é 9,2 Ω a 17 Ω, medida entre 0 °C e 40 °C.",
      sourceIds:["duster-workshop"],documented:true
    },
    {
      id:"v42-coolant-sensor",
      brands:["renault","dacia"],models:["duster"],engines:[],systems:["arrefecimento","injeção"],
      keywords:["df001","temperatura","ect","sensor agua","sensor água","resistencia","resistência"],
      value:"Para DF001 no V42, o procedimento aceita 100 Ω a 10 kΩ para o sensor de temperatura do líquido em temperatura ambiente; fora disso, o sensor é reprovado pelo procedimento.",
      sourceIds:["duster-workshop"],documented:true
    },
    {
      id:"v42-pedal-position",
      brands:["renault","dacia"],models:["duster"],engines:[],systems:["pedal","acelerador"],
      keywords:["pedal","acelerador","pr030","posição","posicao","df974","df975"],
      value:"No parâmetro PR030 do V42: pedal sem carga ≤ 16% e carga total ≥ 85%.",
      sourceIds:["duster-workshop"],documented:true
    },
    {
      id:"v42-idle-integral",
      brands:["renault","dacia"],models:["duster"],engines:[],systems:["borboleta","marcha lenta"],
      keywords:["borboleta","marcha lenta","pr444","programar","adaptação","adaptacao"],
      value:"No TEST 3 do V42, PR444 deve ficar entre 5 N·m e 10 N·m com motor em marcha lenta, aquecido a 75 °C, sem consumidores; a leitura é feita pelo menos 20 min após atingir 75 °C.",
      sourceIds:["duster-workshop"],documented:true
    },
    {
      id:"v42-engine-torque",
      brands:["renault","dacia"],models:["duster"],engines:[],systems:["injeção"],
      keywords:["pr015","torque motor","marcha lenta","torque"],
      value:"PR015, com motor funcionando e líquido de arrefecimento acima de 80 °C: 20 N·m a 40 N·m.",
      sourceIds:["duster-workshop"],documented:true
    },
    {
      id:"v42-knock-resistance",
      brands:["renault","dacia"],models:["duster"],engines:[],systems:["detonação","sensor"],
      keywords:["df088","detonação","detonacao","pinking","knock","resistencia","resistência"],
      value:"Para DF088 no V42, o procedimento exige resistência interna do sensor de detonação maior que 10 MΩ.",
      sourceIds:["duster-workshop"],documented:true
    },
    {
      id:"k4m-coils",
      brands:["renault","dacia"],models:["duster"],engines:["k4m","1.6"],systems:["ignição"],
      keywords:["bobina","ignicao","ignição","df361","p0301","p0302","p0303","p0304"],
      value:"O K4M usa quatro bobinas tipo lápis. O TEST 14 manda inspecionar conectores das quatro bobinas e confirmar produção de arco com o testador de bobina especificado.",
      sourceIds:["duster-workshop"],documented:true
    },
    {
      id:"v42-fuel-pump-test",
      brands:["renault","dacia"],models:["duster"],engines:[],systems:["combustível","bomba"],
      keywords:["bomba","combustivel","combustível","df085","p0627","ac015","não pega","nao pega"],
      value:"No TEST 1 do V42, a bomba e o relé são comandados por AC015; o procedimento confirma alimentação da bomba, continuidade do circuito e aterramento antes de condenar componente.",
      sourceIds:["duster-workshop"],documented:true
    },
    {
      id:"v42-after-repair",
      brands:["renault","dacia"],models:["duster"],engines:[],systems:["diagnóstico"],
      keywords:["depois","reparo","apagar falha","road test","teste rodagem"],
      value:"Após reparo nos procedimentos V42: tratar demais falhas, limpar memória quando aplicável, fazer teste de rodagem e repetir a leitura com o equipamento de diagnóstico.",
      sourceIds:["duster-workshop"],documented:true
    }
  ],

  rules: [
    {
      id:"duster-v42-misfire",
      evidence:"documented+shop",
      title:"Falha de combustão - Duster 1.6 16V / K4M / V42",
      brands:["renault","dacia"],models:["duster"],engines:["1.6","k4m"],
      dtcs:["P0300","P0301","P0302","P0303","P0304","DF059","DF060","DF061","DF062","DF361"],
      keywords:["falha","falhando","rateia","engasga","cilindro","misfire","vibra","bobina","vela"],
      sourceIds:["duster-workshop","duster-v42"],
      hypotheses:[
        {name:"Ignição do cilindro afetado",why:"O K4M usa bobinas individuais; o procedimento V42 manda verificar conectores e confirmar produção de arco antes de substituir a bobina.",weight:96},
        {name:"Injetor / alimentação / comando",why:"Os injetores têm alimentação +12 V e comando individual; o procedimento manda medir resistência e testar acionamento.",weight:91},
        {name:"Compressão / condição mecânica",why:"Se centelha e injeção estiverem confirmadas, a causa deve ser separada da parte elétrica antes de trocar mais componentes.",weight:82},
        {name:"Mistura / entrada falsa de ar / combustível",why:"Falha múltipla ou em vários cilindros aumenta a prioridade de uma causa comum.",weight:76}
      ],
      tests:[
        {id:"k4m-coil-check",title:"Confirmar ignição do cilindro",procedure:"Inspecione conector da bobina, alimentação e comando. Confirme centelha com método apropriado. No procedimento de fábrica, o TEST 14 usa testador específico; não condene bobina apenas pelo P030X.",good:"centelha e alimentação/comando confirmados",bad:"sem centelha ou circuito incorreto"},
        {id:"k4m-injector-ohms",title:"Medir o injetor",procedure:"Com o circuito isolado e temperatura entre 0 °C e 40 °C, meça o injetor do cilindro afetado. No K4M, o procedimento V42 especifica 11 Ω a 20 Ω. Confirme também +12 V e comando.",good:"11 Ω a 20 Ω e comando presente",bad:"fora de 11 Ω a 20 Ω, sem alimentação ou sem comando"},
        {id:"compression-compare",title:"Comparar compressão",procedure:"Compare os cilindros por teste de compressão/relativa. Se o cilindro afetado estiver abaixo dos demais, investigue vedação, válvulas e sincronismo antes de insistir na elétrica.",good:"cilindros equilibrados",bad:"cilindro afetado inferior"}
      ],
      warnings:["P030X identifica o cilindro com falha, não a peça defeituosa.","Após o reparo, repetir leitura e teste na condição que fazia a falha aparecer."]
    },
    {
      id:"duster-v42-injector-circuit",
      evidence:"documented",
      title:"Circuito de injetor V42",
      brands:["renault","dacia"],models:["duster"],engines:["k4m","1.6","k7m"],
      dtcs:["DF026","DF027","DF028","DF029"],
      keywords:["injetor","bico","circuito","aberto","curto","cc.0","cc.1"],
      sourceIds:["duster-workshop"],
      hypotheses:[
        {name:"Injetor fora da resistência especificada",why:"O procedimento exige medição do injetor antes de substituição.",weight:95},
        {name:"Falta de +12 V no injetor",why:"O V42 manda confirmar +12 V no terminal de alimentação do injetor.",weight:92},
        {name:"Chicote entre injetor e ECU",why:"O procedimento exige continuidade, isolamento e ausência de resistência parasita no comando individual.",weight:90}
      ],
      tests:[
        {id:"injector-resistance",title:"Resistência do injetor",procedure:"Meça entre 0 °C e 40 °C. K4M: 11-20 Ω. K7M: 9,2-17 Ω.",good:"dentro da faixa do motor",bad:"fora da faixa"},
        {id:"injector-12v",title:"Alimentação do injetor",procedure:"Com ignição ligada, confirme +12 V no circuito de alimentação do injetor. Se faltar, siga o circuito de alimentação/relé antes de condenar ECU.",good:"+12 V presente",bad:"+12 V ausente"},
        {id:"injector-command",title:"Comando individual",procedure:"Confirme comando no fio individual e integridade do chicote entre injetor e ECU. Compare com um cilindro funcional quando necessário.",good:"comando e chicote corretos",bad:"sem comando ou chicote alterado"}
      ],
      warnings:["Não aplicar a faixa K4M ao K7M.","Não condenar ECU antes de provar alimentação, chicote e injetor."]
    },
    {
      id:"duster-v42-no-start",
      evidence:"documented+shop",
      title:"Não pega / morre - V42",
      brands:["renault","dacia"],models:["duster"],engines:["1.6","k4m","k7m"],
      dtcs:["P0335","DF120","P0627","DF085","P0560","DF047","DF457"],
      keywords:["não pega","nao pega","morre","apagou","sem partida","sem pulso","sem combustivel","sem combustível"],
      sourceIds:["duster-workshop","duster-v42"],
      hypotheses:[
        {name:"Referência de rotação / PMS",why:"Sem rotação válida a estratégia de ignição e injeção não consegue sincronizar.",weight:96},
        {name:"Alimentação da ECU / queda de tensão",why:"DF047 é tratado como tensão de alimentação do computador e o procedimento manda movimentar/verificar chicote ECU-bateria.",weight:94},
        {name:"Relé / alimentação da bomba",why:"DF085 e TEST 1 mandam comandar o relé, confirmar saída e continuidade antes de substituir a bomba.",weight:91},
        {name:"Autorização de partida / imobilizador",why:"Se alimentação, rotação, combustível e centelha estiverem corretos, a autorização de partida deve ser confirmada.",weight:70}
      ],
      tests:[
        {id:"crank-rpm",title:"RPM durante a partida",procedure:"Observe RPM no scanner enquanto aciona o motor. Se ficar em zero ou instável, priorize sensor de PMS/rotação, alvo do volante, conector e chicote.",good:"RPM coerente durante partida",bad:"0 RPM ou leitura instável"},
        {id:"ecu-load",title:"Alimentação da ECU sob carga",procedure:"Confirme bateria, pós-chave e aterramentos sob carga e procure queda de tensão. Movimente o chicote ECU-bateria se a falha for intermitente.",good:"tensões e terras estáveis",bad:"queda, corte ou oscilação"},
        {id:"fuel-ac015",title:"Comando da bomba",procedure:"Acione a bomba/relé pelo scanner quando disponível. Confirme operação, alimentação na bomba e aterramento; depois separe elétrica de pressão/entrega.",good:"comando, alimentação e entrega presentes",bad:"um dos três ausente"}
      ],
      warnings:["Desconectar/reconectar conector pode mascarar mau contato.","ECU é hipótese final depois de provar alimentação, terra, rede e sinais essenciais."]
    },
    {
      id:"duster-v42-coolant",
      evidence:"documented",
      title:"Sensor de temperatura / eletroventilador V42",
      brands:["renault","dacia"],models:["duster"],engines:[],
      dtcs:["DF001","DF018"],
      keywords:["temperatura","esquenta","esquentando","ventoinha","eletroventilador","df001","df018","ect"],
      sourceIds:["duster-workshop","duster-v42"],
      hypotheses:[
        {name:"Leitura ECT incorreta",why:"DF001 trata tensão baixa/alta e microcorte do sensor de temperatura.",weight:94},
        {name:"Relé / circuito de baixa velocidade do eletroventilador",why:"DF018 possui teste específico de relé, comando e alimentação.",weight:90},
        {name:"Problema de circulação/troca térmica",why:"Se leitura e acionamento elétrico estiverem corretos, a investigação migra para o sistema mecânico de arrefecimento.",weight:78}
      ],
      tests:[
        {id:"ect-cold",title:"Coerência do ECT a frio",procedure:"Com motor frio, compare a temperatura do scanner com a ambiente. Se houver grande desvio, teste sensor e chicote.",good:"ECT próximo da temperatura ambiente",bad:"leitura incoerente"},
        {id:"ect-resistance",title:"Resistência do ECT",procedure:"No procedimento DF001, a resistência em temperatura ambiente deve estar entre 100 Ω e 10 kΩ.",good:"100 Ω a 10 kΩ em ambiente",bad:"fora da faixa"},
        {id:"fan-relay",title:"Relé e potência do eletroventilador",procedure:"Comande a baixa velocidade pelo scanner quando possível e separe: comando da ECU, relé, alimentação de potência e motor da ventoinha.",good:"comando e potência presentes",bad:"falta comando, relé ou potência"}
      ],
      warnings:["Não abrir sistema pressurizado quente.","Temperatura alta por si só não comprova junta de cabeçote."]
    },
    {
      id:"duster-v42-pedal-throttle",
      evidence:"documented",
      title:"Pedal / borboleta / marcha lenta V42",
      brands:["renault","dacia"],models:["duster"],engines:[],
      dtcs:["P0120","P0220","DF095","DF096","DF974","DF975"],
      keywords:["pedal","acelerador","borboleta","marcha lenta","acelerando sozinho","racing","pr030","pr444"],
      sourceIds:["duster-workshop"],
      hypotheses:[
        {name:"Sinal do pedal fora da faixa",why:"PR030 possui limites de coerência para repouso e carga total.",weight:94},
        {name:"Borboleta / adaptação de batente",why:"TEST 3 usa PR444 e orienta programação do batente quando a correção está acima do limite.",weight:89},
        {name:"Chicote / conectores do pedal e ECU",why:"O procedimento manda verificar seis conexões entre pedal e ECU.",weight:85}
      ],
      tests:[
        {id:"pedal-pr030",title:"PR030 do pedal",procedure:"Sem carga, PR030 deve ser ≤16%. Em carga total, ≥85%. Verifique progressividade sem saltos.",good:"repouso ≤16%, total ≥85% e progressivo",bad:"fora da faixa ou com falhas"},
        {id:"throttle-pr444",title:"PR444 em marcha lenta",procedure:"Com motor aquecido a 75 °C, sem consumidores e após 20 min nessa condição, PR444 deve ficar entre 5 e 10 N·m. Acima de 10 N·m o procedimento orienta programar o batente da borboleta.",good:"5-10 N·m",bad:"fora da faixa"}
      ],
      warnings:["Não forçar borboleta eletrônica manualmente sem procedimento.","Confirmar compatibilidade do sistema antes de usar os valores V42."]
    },
    {
      id:"duster-v42-charging",
      evidence:"documented+shop",
      title:"Carga / alternador / baixa tensão",
      brands:["renault","dacia"],models:["duster"],engines:[],
      dtcs:["P0560","DF047"],
      keywords:["alternador","bateria","carga","tensão","tensao","descarrega","luz bateria","baixa tensão","baixa tensao"],
      sourceIds:["duster-workshop"],
      hypotheses:[
        {name:"Queda de tensão em alimentação ou aterramento",why:"A tensão medida sem carga pode parecer normal mesmo com resistência de contato.",weight:95},
        {name:"Alternador / módulo de sinal",why:"TEST 2 compara a carga sem consumidores e com consumidores e verifica o circuito de sinal do alternador.",weight:89},
        {name:"Bateria com capacidade reduzida",why:"A bateria precisa ser separada do sistema de carga por teste de capacidade/queda durante partida.",weight:82}
      ],
      tests:[
        {id:"charge-load",title:"Carga com e sem consumidores",procedure:"Meça a carga e observe o parâmetro do alternador no scanner quando disponível; ligue consumidores e confirme resposta do sistema. Faça queda de tensão nos cabos positivo e negativo.",good:"carga responde e quedas são baixas",bad:"carga não responde ou há queda anormal"},
        {id:"battery-crank",title:"Bateria durante partida",procedure:"Observe tensão e corrente/queda durante partida e teste capacidade da bateria. Não condene alternador por bateria fraca nem bateria por conexão ruim.",good:"bateria sustenta a partida",bad:"queda excessiva / capacidade insuficiente"}
      ],
      warnings:["Falhas de baixa tensão podem criar múltiplos DTCs secundários.","Limpar falhas somente depois de estabilizar alimentação."]
    },
    {
      id:"duster-v42-pump",
      evidence:"documented",
      title:"Bomba / relé de combustível V42",
      brands:["renault","dacia"],models:["duster"],engines:[],
      dtcs:["P0627","DF085"],
      keywords:["bomba","combustível","combustivel","relé","rele","sem pressão","sem pressao","não pega","nao pega"],
      sourceIds:["duster-workshop","duster-v42"],
      hypotheses:[
        {name:"Comando do relé",why:"DF085 prevê circuito aberto, curto à massa ou curto a +12 V no comando do relé.",weight:96},
        {name:"Saída de potência do relé / alimentação da bomba",why:"O procedimento manda verificar a saída do circuito de potência durante AC015.",weight:93},
        {name:"Chicote / aterramento da bomba",why:"TEST 1 exige continuidade e aterramento antes de substituir componente.",weight:90}
      ],
      tests:[
        {id:"pump-command",title:"AC015 / relé da bomba",procedure:"Se o scanner permitir, execute AC015. Escute o relé e a bomba e meça a saída do relé.",good:"relé comanda e saída chega à bomba",bad:"sem comando ou sem saída"},
        {id:"pump-ground",title:"Alimentação e terra na bomba",procedure:"Confirme alimentação e aterramento na bomba sob carga. Se ambos estiverem corretos, só então teste pressão/entrega da bomba.",good:"alimentação/terra corretos",bad:"alimentação ou terra ausente"}
      ],
      warnings:["Não substituir bomba sem separar comando elétrico de falha hidráulica."]
    },
    {
      id:"duster-v42-knock",
      evidence:"documented",
      title:"Sensor de detonação V42",
      brands:["renault","dacia"],models:["duster"],engines:[],
      dtcs:["DF088"],
      keywords:["detonação","detonacao","knock","pinking","batida pino"],
      sourceIds:["duster-workshop"],
      hypotheses:[
        {name:"Sensor / aperto / contato mecânico",why:"O procedimento manda verificar limpeza, condição e aperto do sensor.",weight:95},
        {name:"Chicote blindado / continuidade",why:"O chicote é blindado e deve ser testado quanto a continuidade e isolamento.",weight:90}
      ],
      tests:[
        {id:"knock-ohms",title:"Resistência interna",procedure:"O procedimento V42 exige resistência interna maior que 10 MΩ.",good:">10 MΩ",bad:"≤10 MΩ"},
        {id:"knock-harness",title:"Conector, aperto e chicote",procedure:"Confirme montagem/aperto, conector limpo e integridade das ligações até a ECU.",good:"montagem e chicote corretos",bad:"falha de montagem ou circuito"}
      ],
      warnings:["Não confundir ruído mecânico real com falha elétrica do sensor."]
    },
    {
      id:"lexus-is300-start",
      evidence:"documented",
      title:"Lexus IS 300 - partida / ignição / alimentação",
      brands:["lexus"],models:["is 300","is300"],engines:[],
      dtcs:[],
      keywords:["não pega","nao pega","partida","starter","ignição","ignicao","alternador","carga","sem partida"],
      sourceIds:["lexus-ewd"],
      hypotheses:[
        {name:"Alimentação e fusíveis principais",why:"O EWD liga bateria, fusíveis e chave de ignição aos circuitos de partida e ECM.",weight:95},
        {name:"Comando de partida / condição P-N",why:"O circuito de partida inclui condição Park/Neutral nos veículos automáticos.",weight:90},
        {name:"ECM / ignição / bobinas",why:"O diagrama relaciona ECM, igniter/bobinas e alimentação do sistema.",weight:84}
      ],
      tests:[
        {id:"lexus-power-trace",title:"Rastrear alimentação",procedure:"Comece na bateria e fusíveis principais e siga o diagrama até chave/relé/carga afetada. O ponto onde a tensão desaparece define a etapa seguinte.",good:"alimentação chega ao próximo estágio",bad:"alimentação se perde em um ponto"},
        {id:"lexus-start-signal",title:"Sinal de partida",procedure:"Confirme comando de partida e condição P/N quando aplicável; depois confirme chegada do comando ao motor de partida.",good:"comando chega ao starter",bad:"comando não chega"}
      ],
      warnings:["Use somente o diagrama correspondente ao ano/sistema do veículo."]
    },

    /* Heurísticas gerais: não carregam valores específicos de fabricante. */
    {
      id:"generic-wiring",
      evidence:"heuristic",
      title:"Falha elétrica / intermitente",
      brands:[],models:[],engines:[],dtcs:[],
      keywords:["intermitente","chicote","elétric","eletric","conector","oxidação","oxidacao","mau contato","sem sinal","curto"],
      sourceIds:[],
      hypotheses:[
        {name:"Conector / terminal / chicote",why:"Falha que muda com vibração, temperatura ou manipulação exige inspeção de terminais e chicote.",weight:91},
        {name:"Alimentação ou aterramento sob carga",why:"Tensão em circuito aberto pode esconder resistência de contato.",weight:88}
      ],
      tests:[
        {id:"wiggle-monitor",title:"Manipulação monitorada",procedure:"Monitore o parâmetro/sinal enquanto movimenta conectores e trechos do chicote. Procure terminal recuado, aberto, oxidado, aquecido ou contaminado.",good:"sem alteração e contatos íntegros",bad:"falha reage à manipulação"},
        {id:"voltage-drop",title:"Queda de tensão",procedure:"Teste positivo e aterramento com o circuito trabalhando. Compare com circuito funcional quando não houver especificação disponível.",good:"quedas baixas e estáveis",bad:"queda anormal ou oscilação"}
      ],
      warnings:["Desconectar e reconectar pode esconder temporariamente mau contato."]
    },
    {
      id:"generic-overheat",
      evidence:"heuristic",
      title:"Superaquecimento",
      brands:[],models:[],engines:[],dtcs:["P0217"],
      keywords:["esquenta","esquentando","superaquece","temperatura","ferve","ventoinha","eletroventilador"],
      sourceIds:[],
      hypotheses:[
        {name:"Leitura de temperatura / sensor",why:"Primeiro confirme se a temperatura vista pelo módulo corresponde à temperatura real.",weight:92},
        {name:"Comando e potência do eletroventilador",why:"Separe comando lógico, relé, alimentação e motor da ventoinha.",weight:89},
        {name:"Circulação e troca térmica",why:"Com elétrica correta, investigue fluxo, válvula termostática, bomba, radiador e presença de gases/ar.",weight:84}
      ],
      tests:[
        {id:"temp-compare",title:"Temperatura real x scanner",procedure:"A frio, compare scanner com ambiente. Durante aquecimento, confirme evolução com medição independente quando possível.",good:"leituras coerentes",bad:"scanner e temperatura real divergem"},
        {id:"fan-separate",title:"Separar comando de potência",procedure:"Verifique se há solicitação de ventoinha, se o relé comuta e se chega alimentação ao motor.",good:"comando e potência corretos",bad:"falha identificada em um estágio"}
      ],
      warnings:["Não abrir reservatório pressurizado quente.","Não condenar junta de cabeçote apenas por temperatura alta."]
    },
    {
      id:"generic-hard-brake",
      evidence:"heuristic",
      title:"Pedal de freio duro / assistência a vácuo",
      brands:[],models:[],engines:[],dtcs:[],
      keywords:["freio duro","pedal duro","servo freio","hidrovacuo","hidrovácuo","vácuo","vacuo"],
      sourceIds:[],
      hypotheses:[
        {name:"Falta de vácuo para o servo",why:"Pedal que endurece intermitentemente exige confirmar a fonte de vácuo e retenção.",weight:94},
        {name:"Mangueira / válvula de retenção / vazamento",why:"Vazamento pode afetar assistência de freio e também mistura/marcha lenta em alguns motores.",weight:90},
        {name:"Servo-freio",why:"Só ganha prioridade depois de confirmar que o vácuo chega e é retido corretamente.",weight:79}
      ],
      tests:[
        {id:"vacuum-source",title:"Medir vácuo disponível",procedure:"Confirme vácuo na linha do servo em marcha lenta e durante a condição que endurece o pedal.",good:"vácuo presente e estável",bad:"vácuo baixo ou desaparece"},
        {id:"check-valve",title:"Retenção e estanqueidade",procedure:"Teste mangueira, conexões e válvula de retenção. Após desligar o motor, verifique se a assistência mantém reserva por algumas aplicações do pedal.",good:"retém vácuo",bad:"perde vácuo rapidamente"}
      ],
      warnings:["Falha de assistência não significa necessariamente falha hidráulica de frenagem, mas exige atenção imediata."]
    },
    {
      id:"generic-trans-no-engage",
      evidence:"heuristic",
      title:"Câmbio automático não engata",
      brands:[],models:[],engines:[],dtcs:[],
      keywords:["câmbio não engata","cambio nao engata","não engata","nao engata","sem marcha","d não entra","r não entra","falsa impressão de engate","falsa impressao de engate"],
      sourceIds:[],
      hypotheses:[
        {name:"Nível/pressão hidráulica ou alimentação do circuito",why:"Ausência total de tração em todas as posições exige separar pressão/fluido de comando eletrônico.",weight:94},
        {name:"Reconhecimento de faixa / seletor",why:"O módulo precisa reconhecer corretamente P-R-N-D e condições de habilitação.",weight:89},
        {name:"TCM / chicote / alimentação após substituição",why:"Após troca de conjunto, confirme compatibilidade, alimentação, comunicação e necessidade de programação/aprendizado antes de abrir o câmbio.",weight:86},
        {name:"Acoplamento mecânico / conversor / diferencial",why:"Se pressão e comando existem, confirme transmissão mecânica de torque.",weight:80}
      ],
      tests:[
        {id:"range-scan",title:"Faixa reconhecida no scanner",procedure:"Compare posição real da alavanca com o parâmetro de faixa do módulo em P-R-N-D. Se divergir, não avance para condenação interna.",good:"todas as faixas reconhecidas",bad:"faixa ausente ou incoerente"},
        {id:"trans-power",title:"Alimentação/comunicação do TCM",procedure:"Confirme tensão, aterramentos, comunicação e identificação/calibração do módulo/conjunto instalado.",good:"alimentação e comunicação corretas",bad:"falha de alimentação, rede ou compatibilidade"},
        {id:"hydraulic-pressure",title:"Pressão hidráulica",procedure:"Se o procedimento do câmbio permitir, medir pressão de linha nas posições indicadas pelo fabricante. Não invente valor sem a especificação daquele câmbio.",good:"pressão conforme especificação",bad:"pressão ausente/fora do especificado"}
      ],
      warnings:["Não aplicar procedimento de outro câmbio apenas porque o veículo/modelo é parecido.","Após troca de transmissão/módulo, programação e aprendizado podem ser obrigatórios conforme a aplicação."]
    },
    {
      id:"generic-oil-pressure",
      evidence:"heuristic",
      title:"Luz / pressão de óleo",
      brands:[],models:[],engines:[],dtcs:[],
      keywords:["pressão de óleo","pressao de oleo","luz de óleo","luz de oleo","interruptor óleo","interruptor oleo","bomba de óleo","bomba de oleo"],
      sourceIds:[],
      hypotheses:[
        {name:"Nível/viscosidade/óleo inadequado",why:"Antes de desmontar, confirme quantidade e condição do óleo.",weight:94},
        {name:"Sensor/interruptor ou circuito",why:"Uma indicação incorreta deve ser separada de pressão mecânica realmente baixa.",weight:91},
        {name:"Pressão mecânica baixa",why:"Somente manômetro confirma pressão real; a causa pode estar em bomba, pescador, folgas ou válvula reguladora.",weight:88}
      ],
      tests:[
        {id:"oil-level",title:"Confirmar nível e condição",procedure:"Veículo nivelado e conforme procedimento do fabricante, confirme nível, especificação e contaminação do óleo.",good:"nível/especificação corretos",bad:"nível ou condição incorreta"},
        {id:"oil-gauge",title:"Manômetro mecânico",procedure:"Instale manômetro no ponto correto e compare a pressão fria/quente e em rotação com a especificação exata do motor.",good:"pressão dentro da especificação",bad:"pressão abaixo da especificação"}
      ],
      warnings:["Não condenar bomba apenas pelo interruptor ou pela luz.","Se houver ruído mecânico ou pressão real baixa, evite manter o motor funcionando."]
    },
    {
      id:"generic-catalyst-restriction",
      evidence:"heuristic",
      title:"Perda de potência / suspeita de escape restrito",
      brands:[],models:[],engines:[],dtcs:["P0420"],
      keywords:["xoxo","sem força","sem potencia","sem potência","catalisador","escape entupido","abafado","não sobe giro","nao sobe giro"],
      sourceIds:[],
      hypotheses:[
        {name:"Restrição de escape / catalisador",why:"Contrapressão elevada pode limitar enchimento do motor e provocar perda de potência.",weight:88},
        {name:"Falha de ignição/mistura que danificou o catalisador",why:"Catalisador pode ser consequência de outra falha; é preciso corrigir a causa primária.",weight:84},
        {name:"Alimentação de combustível / carga do motor",why:"Perda de potência também pode vir de combustível, sincronismo ou sensores de carga.",weight:78}
      ],
      tests:[
        {id:"exhaust-diff",title:"Confirmar restrição",procedure:"Use método apropriado para medir contrapressão/vácuo ou comparar comportamento com ponto de escape aliviado, respeitando segurança e procedimento do veículo.",good:"sem evidência de restrição",bad:"evidência clara de restrição"},
        {id:"misfire-before-cat",title:"Procurar causa primária",procedure:"Antes de trocar catalisador, verifique falha de ignição, mistura rica, consumo de óleo e injetor com vazamento.",good:"causas primárias descartadas",bad:"há falha que pode danificar o novo catalisador"}
      ],
      warnings:["P0420 não prova entupimento; mede eficiência do catalisador em muitas aplicações."]
    }
  ]
};