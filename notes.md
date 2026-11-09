[Geral]
  corrigir:
    possivel bug em cold start (usuario logando na conta de primeira) nao da fetch no schedule corretamente 
    Paginação de reviews parece fazer o loading da dashboard de disciplinas carregar mais lento (provavel fetch antes)
    Verificar os testes como um todo
    Verificar o .claude melhor
    Verificar o CI
    AI team provavelmente eventualmente removido 
    sprints/ removido 

  possibilidades:
    mudar as guidelines do CLAUDE e do CONTRIBUTING levemente

  bom:
    .github parece ser bom e estruturar uma parte antes não feita mesmo

[Gerador]
  corrigir:
    mudar icone do gerador de planos para algo que se assemelhe menos à IA ()
    Texto de opção mostrando "só a noite" hardcoded
    1 opcao apenas sendo usada (provavel bug)
    "Para se formar, ainda faltam 360h de atividades complementares..." -> não tem essa info no schedule atual, ver sobre

  possibilidades:
    considerar opção de não auto-escolher as optativas (já que são livres pro usuário)
    fazer o pop up ser mais largo pra caber mais semestres 
    muitos arquivos para "uma feature", reorganizar os algoritmos possivelmente
    separar os testes para um folder especifico
    
  bom:
    TODO o resto (boas ideias, só basta verificar os algoritmos e as eventuais )
    feature bem comentada e sugerida por usuarios
    em especial: ressalvas do plano, os multiplos semestres do plano terem uma propria area scrollable
    
[Progresso]
  corrigir:

  possibilidades:
    corrigir a arvore de dependencias pra disciplinas optativas
    
  bom:
    scroll funciona e bug de visualizacao corrigido (bastante comentado)


[Cronograma]
  corrigir:
    update no tamanho de eventos maiores do que celula -> 13h30 com calculo errado, por exemplo.
    adição de eventos -> lista de dias com tamanho menor do que o esperado, "Segunda" fica com pouco espaço

  possibilidades:
    decidir se manter a visualização em blocos ou continuar com a draggable e tamanho variavel

  bom:
    ótimo chooser de dias e tambem seletor de horario (horarios variaveis pra eventos é uma ideia interessante)
