# Plano de Implementação: Avaliação de Professores (RateMyProfessor UFSC)

Este documento detalha a arquitetura, o fluxo de dados e as funcionalidades para a integração do sistema de avaliação de professores no MyUFSC.

## 1. Pipeline de Dados e Scraper (Rust)
- [ ] **Normalização de Nomes:** Criar função rigorosa de normalização de strings no scraper (remover acentos, converter para maiúsculas, remover espaços duplos) para gerar o "ID" único do professor (ex: `JOAO DA SILVA`).
- [ ] **Mapeamento Professor ↔ Disciplina:** Atualizar o scraper de horários (`scrapers/schedule`) para extrair a relação de quais professores ministram quais disciplinas e popular a tabela de relacionamento.

## 2. Banco de Dados (Schema no PGLite/Postgres)
- [x] **Tabela `professor_courses` (Relacionamento):**
  - `professor_id` (Nome normalizado).
  - `course_id` (Código da disciplina, ex: `FSC7152`).
- [x] **Tabela `reviews` (Avaliações e Respostas unificadas):**
  - `id`: Identificador único do comentário/avaliação.
  - `professor_id`: Nome normalizado do professor.
  - `course_id`: Código da disciplina relacionada.
  - `author_hash`: Hash do usuário (para prevenir spam, não exibido publicamente).
  - `parent_id`: `null` para avaliação principal, ou ID da avaliação pai para respostas.
  - `text`: Texto do comentário (Máximo 500 caracteres).
  - `scores`: JSON contendo `{ overall: 1-5, difficulty: 1-5, didactics: 1-5 }` (Apenas preenchido se `parent_id` for `null`).
- [x] **Regras Anti-Spam:** Criar restrição de unicidade (Unique Constraint) para `(author_hash, professor_id, course_id)` onde `parent_id IS NULL` (Apenas uma avaliação com nota por matéria/professor por usuário).
- [x] **Regras anti-Odio:** Implementar mecanismos para detectar e filtrar avaliações com conteúdo ofensivo ou discriminatório. (filtrar palavrões, xingamentos, etc).

## 3. Backend e APIs (Estratégia Fast vs On-Demand)
- [x] **Endpoint "Fast Payload" (`/api/professors/aggregates`):**
  - **Objetivo:** Renderização ultra-rápida na UI.
  - **Lógica:** Recebe os cursos/currículos de interesse do usuário (`currentDegree`, `interestedDegrees`), busca as disciplinas e retorna APENAS os professores relevantes.
  - **Retorno:** Dicionário leve mapeando `Nome do Professor -> { overall, difficulty, didactics, totalReviews }`.
- [x] **Endpoint "Slow Payload" (`/api/professors/[id]/details`):**
  - **Objetivo:** Carregar os detalhes, textos e threads sob demanda.
  - **Retorno:**
    - Quebra de notas por disciplina (ex: "Nota 4.5 em INE5404, mas 2.0 em INE5408").
    - Lista paginada de avaliações principais (`parent_id IS NULL`).
    - Respostas atreladas a cada avaliação (Thread de 1 nível de profundidade).
- [x] **Gerador de Pseudônimos (Anonimato Consistente):**
  - Lógica no servidor (ou client) para gerar nomes temáticos da UFSC.
  - Autor da thread = `"Autor da Avaliação"`.
  - Respostas = `hash(author_hash + thread_id) -> Animal + Número` (ex: "Capivara042", "Jacaré003", "Sagui314").

## 4. Interface do Usuário (Frontend)
- [x] **Badges de Avaliação na UI:**
  - Inserir badges visuais (ex: `⭐ 4.2`) ao lado do nome do professor no `AvailableCoursesModal`, no `Timetable` e na visualização de grade.
  - Esquema de cores: Verde (>4.0), Amarelo (3.0 - 4.0), Vermelho (<3.0).
- [x] **Drawer de Detalhes do Professor (Slide-out lateral):**
  - Abre ao clicar no nome ou na nota de um professor.
  - Exibe cabeçalho com notas agregadas globais.
  - Exibe quebra de notas por disciplina.
  - Exibe o Feed de Avaliações (Textos de até 500 caracteres, disciplinas avaliadas e threads de comentários com avatares de animais).
- [x] **Modal "Escrever Avaliação":**
  - Dropdown para selecionar a disciplina cursada (filtrado para intersecção entre: disciplinas que o usuário cursou/está cursando E disciplinas que o professor leciona).
  - 3 Sliders de nota (Geral, Dificuldade, Didática).
  - Textarea com contador de caracteres ao vivo (`0/500`).
  - Botão "Enviar".
- [x] **Modal de Resposta (Reply):**
  - Versão simplificada do modal acima, apenas com o Textarea (0/500 caracteres) para responder a uma thread existente.
- [ ] **Página "Diretório de Professores" (Opcional/Futuro):**
  - Rota `/professores` com barra de busca global para pesquisar qualquer professor por nome ou departamento.
