/**
 * Tests for the deterministic curriculum PDF parser (scrapers/curriculum/parser.ts).
 *
 * The parser reads `pdftotext -bbox-layout` HTML; these tests build that HTML by
 * hand so they need neither poppler nor PDF fixtures. Coordinates mirror the real
 * CAGR template: table rows are 7.4pt, ementas 6.5pt, headings 11.1pt, the page
 * header 8.3pt; columns start at x=40 (code), 82 (name), 255 (type), 283 (H/A),
 * 316 (aulas), 350 (equivalents), 415 (prerequisites), 535 (Pré CH).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseCurriculumBBox,
  parseCurriculumBBoxDetailed,
  phaseFromHeading,
  habilitacaoLabels,
  trackFromSection,
  titleCaseIfUpper,
  enfaseVariant,
} from "@/scrapers/curriculum/parser";

const TABLE = 7.4;
const DESC = 6.475;
const HEADING = 11.1;
const HEADER = 8.3;

type W = [x: number, y: number, h: number, text: string];

/** One table/desc line: words laid out left to right from the given columns. */
function line(y: number, h: number, cells: [number, string][]): W[] {
  return cells.flatMap(([x, text]) =>
    text.split(" ").map((t, i) => [x + i * 30, y, h, t] as W),
  );
}

function page(words: W[]): string {
  const body = words
    .map(
      ([x, y, h, t]) =>
        `<word xMin="${x}" yMin="${y}" xMax="${x + 25}" yMax="${y + h}">${t}</word>`,
    )
    .join("\n");
  return `<page width="595" height="842">\n${body}\n</page>`;
}

const pageHeader: W[] = [
  ...line(40, HEADER, [[40, "Curso: 208 - CIÊNCIAS DA COMPUTAÇÃO"]]),
  ...line(52, HEADER, [[40, "Currículo: 20271"]]),
  ...line(70, HEADER, [[40, "Habilitação: Bacharelado"]]),
];
const footer = line(800, TABLE, [[40, "04/11/2026 01:11 SeTIC - Página: 2 de 9"]]);
const columnHeader = (y: number) =>
  line(y, TABLE, [
    [40, "Disciplina"],
    [255, "Tipo"],
    [283, "H/A"],
    [316, "Aulas"],
    [350, "Equivalentes"],
    [415, "Pré-Requisito"],
  ]);

function fixture(): string {
  return page([
    ...pageHeader,
    ...line(100, HEADING, [[275, "Fase 05"]]),
    ...columnHeader(115),
    // Ementa ABOVE the row, then the row, then the wrapped name below.
    ...line(130, DESC, [[82, "Problemas computacionais como problemas"]]),
    ...line(138, DESC, [[82, "de linguagem."]]),
    ...line(148, TABLE, [
      [40, "INE5820"],
      [82, "Linguagens Formais e Modelos de"],
      [255, "Ob"],
      [283, "72"],
      [316, "4"],
      [350, "INE5421"],
      [415, "(INE5802 eh"],
    ]),
    ...line(157.2, TABLE, [
      [82, "Representação"],
      [415, "INE5803)"],
    ]),
    // A row with no equivalents: its prerequisite must not drift left.
    ...line(180, DESC, [[82, "Paralelismo."]]),
    ...line(190, TABLE, [
      [40, "INE5830"],
      [82, "Computação Paralela"],
      [255, "Ob"],
      [283, "72"],
      [316, "4"],
      [415, "INE5822"],
      [535, "2000 hs Ob"],
    ]),
    // A "(*)" note in the slot right under a row belongs to that row.
    ...line(204, DESC, [[82, "(*) Verificar pré-requisitos."]]),
    ...footer,
  ]) +
    page([
      ...pageHeader,
      ...line(100, HEADING, [[275, "Fase 02"]]),
      ...columnHeader(115),
      ...line(130, DESC, [[82, "Algoritmos e Estruturas de Dados Não-"]]),
      ...line(148, TABLE, [
        [40, "INE5810"],
        [82, "Estruturas Não-"],
        [255, "Ob"],
        [283, "90"],
        [316, "5"],
        [415, "INE5806"],
      ]),
      ...line(157.2, TABLE, [[82, "Lineares"]]),
      ...line(180, TABLE, [
        [40, "-"],
        [82, "Optativa I"],
        [255, "Op"],
        [283, "72"],
        [316, "4"],
      ]),
      ...line(200, TABLE, [
        [40, "AGR5041"],
        [82, "Estágio"],
        [255, "Es"],
        [283, "72"],
        [316, "4"],
      ]),
      ...line(220, HEADING, [[275, "Outras"]]),
      ...line(240, TABLE, [
        [40, "INE5619"],
        [82, "Gerência de Redes"],
        [255, "op"],
        [283, "72"],
        [316, "4"],
        [415, "INE5619"],
      ]),
      ...line(260, TABLE, [
        [40, "INE5889"],
        [82, "Atividades Complementares"],
        [255, "Ob"],
      ]),
      // Another phase word after "Fase NN" headings is a section, not phase 1.
      ...line(280, HEADING, [[275, "1ª Módulo Introdutório"]]),
      ...line(300, TABLE, [
        [40, "EGR7999"],
        [82, "Projeto Livre"],
        [255, "Ob"],
        [283, "72"],
        [316, "4"],
      ]),
      ...footer,
    ]);
}

const parsed = parseCurriculumBBox(fixture());
const byId = new Map(parsed.courses.map((c) => [c[0], c]));

test("reads the curriculum header", () => {
  assert.equal(parsed.id, 208);
  assert.equal(parsed.version, 20271);
  assert.equal(parsed.name, "208 - CIÊNCIAS DA COMPUTAÇÃO");
});

test("splits equivalents and prerequisites by column, across wrapped lines", () => {
  const c = byId.get("INE5820")!;
  assert.deepEqual(c[6], ["INE5421"], "equivalents");
  assert.deepEqual(c[5], ["INE5802", "INE5803"], "prerequisites");
});

test("a prerequisite with no equivalent beside it stays a prerequisite", () => {
  const c = byId.get("INE5830")!;
  assert.deepEqual(c[5], ["INE5822"]);
  assert.deepEqual(c[6], []);
});

test("joins wrapped names and takes the ementa printed above the row", () => {
  assert.equal(byId.get("INE5820")![1], "Linguagens Formais e Modelos de Representação");
  assert.equal(
    byId.get("INE5820")![4],
    "Problemas computacionais como problemas de linguagem.",
  );
  assert.equal(byId.get("INE5810")![1], "Estruturas Não-Lineares", "line-wrap hyphen");
});

test("credits come from Aulas and workload from H/A", () => {
  const c = byId.get("INE5810")!;
  assert.equal(c[2], 5);
  assert.equal(c[3], 90);
});

test("a (*) note under a row goes to that row, not the next ementa", () => {
  assert.equal(byId.get("INE5830")![4], "Paralelismo. (*) Verificar pré-requisitos.");
});

test("phase comes from section headings only, in any wording", () => {
  assert.equal(byId.get("INE5820")![8], 5);
  assert.equal(byId.get("INE5810")![8], 2, "second page's heading");
  assert.equal(parsed.totalPhases, 5);
});

test("named electives have no phase; placeholder slots keep theirs", () => {
  const slot = byId.get("OPT0001")!;
  assert.equal(slot[1], "Optativa I");
  assert.equal(slot[7], false);
  assert.equal(slot[8], 2);
  assert.equal(byId.get("INE5619")![8], null);
});

test("elective slots are optional placeholders even when the PDF types them Ob", () => {
  const html = page([
    ...pageHeader,
    ...line(100, HEADING, [[275, "Fase 07"]]),
    ...line(130, TABLE, [
      [40, "-"],
      [82, "Optativa I"],
      [255, "Ob"],
      [283, "54"],
      [316, "3"],
    ]),
  ]);
  const [slot] = parseCurriculumBBox(html).courses;
  assert.deepEqual([slot[0], slot[7], slot[8]], ["OPT0001", false, 7]);
});

test("Es rows are kept as mandatory; lowercase types are recognized", () => {
  assert.equal(byId.get("AGR5041")![7], true);
  assert.equal(byId.get("INE5619")![7], false);
});

test("a mandatory row under a non-phase heading inherits the last phase heading", () => {
  // Not phase-less: the plan generator would schedule phase-0 mandatory courses first.
  assert.equal(byId.get("INE5889")![8], 2);
  assert.equal(byId.get("INE5889")![2], 0, "missing Aulas → 0");
});

test("a heading with a different phase word than the curriculum's is a section", () => {
  assert.equal(byId.get("EGR7999")![8], 2, "inherited, not '1ª Módulo' = 1");
});

test("reports which rows only inherited their phase", () => {
  const { curriculum, inheritedPhaseRows } = parseCurriculumBBoxDetailed(fixture());
  const ids = [...inheritedPhaseRows].map((i) => curriculum.courses[i][0]).sort();
  assert.deepEqual(ids, ["EGR7999", "INE5889"]);
});

test("drops self-referencing prerequisites", () => {
  assert.deepEqual(byId.get("INE5619")![5], []);
});

test("page furniture never leaks into courses", () => {
  assert.equal(parsed.courses.length, 8);
  for (const c of parsed.courses) {
    assert.doesNotMatch(c[4], /SeTIC|Página|Habilitação/);
  }
});

test("phaseFromHeading", () => {
  const cases: [string, number | null][] = [
    ["Fase 01", 1],
    ["3ª Fase", 3],
    ["10ª FASE", 10],
    ["4ª.Fase", 4],
    ["NªFase-Sugestão".replace("N", "2"), 2],
    ["1º Período", 1],
    ["2° Semestre", 2],
    ["1ª Módulo", 1],
    ["Oitava Fase", 8],
    ["Fase 9 e 10", 9],
    ["INTERNATO MÉDICO - 09ª FASE", 9],
    ["Disciplinas Optativas", null],
    ["Outras", null],
    ["null", null],
    ["ÁREA 2: AGROECOLOGIA", null],
    ["Atividades Complementares - Portaria nº 441/PROGRAD/2015", null],
  ];
  for (const [heading, phase] of cases) {
    assert.equal(phaseFromHeading(heading), phase, heading);
  }
});

test("habilitações: one row per course, each track's placement in its TrackMap", () => {
  const header = (hab: string): W[] => [
    ...line(40, HEADER, [[40, "Curso: 310 - CIÊNCIAS SOCIAIS"]]),
    ...line(52, HEADER, [[40, "Currículo: 20071"]]),
    ...line(70, HEADER, [[40, `Habilitação: ${hab}`]]),
  ];
  const row = (y: number, code: string, name: string, type: string): W[] =>
    line(y, TABLE, [
      [40, code],
      [82, name],
      [255, type],
      [283, "72"],
      [316, "4"],
    ]);
  const html =
    page([
      ...header("Bacharelado e Licenciatura em Ciências Sociais"),
      ...line(100, HEADING, [[275, "Fase 01"]]),
      ...row(130, "SPO7102", "Ciência Política", "Ob"),
      ...line(160, HEADING, [[275, "Fase 02"]]),
      ...row(190, "SPO7202", "Teoria Política", "Ob"),
    ]) +
    page([
      ...header("Licenciatura em Ciências Sociais"),
      ...line(100, HEADING, [[275, "Fase 01"]]),
      ...row(130, "ANT7101", "Antropologia", "Ob"),
      ...row(150, "-", "Optativa I", "Op"),
      ...line(170, HEADING, [[275, "Disciplinas Optativas"]]),
      ...row(190, "MEN7021", "Estágio", "Op"),
    ]) +
    page([
      ...header("Bacharelado em Ciências Sociais"),
      ...line(100, HEADING, [[275, "Fase 01"]]),
      ...row(130, "ANT7101", "Antropologia", "Ob"),
      ...row(150, "-", "Optativa I", "Op"),
      ...line(170, HEADING, [[275, "Fase 07"]]),
      ...row(190, "MEN7021", "Estágio", "Ob"),
      ...row(210, "CSO7808", "TCC", "Ob"),
    ]);
  const { courses, habilitacoes } = parseCurriculumBBox(html);
  // The shared core is not a track; the tracks keep document order.
  assert.deepEqual(
    habilitacoes?.map((h) => h.label),
    ["Licenciatura", "Bacharelado"],
  );
  assert.deepEqual(
    courses.map((c) => [c[0], c[7], c[8], c[9]]),
    [
      ["SPO7102", true, 1, undefined], // core: every track
      ["SPO7202", true, 2, undefined],
      ["ANT7101", true, 1, undefined], // same placement in both → shared
      ["OPT0001", false, 1, { "0": [false, 1] }], // each track keeps its slots
      ["OPT0002", false, 1, { "1": [false, 1] }],
      // elective in Licenciatura, mandatory phase 7 in Bacharelado
      ["MEN7021", true, 7, { "0": [false, null], "1": [true, 7] }],
      ["CSO7808", true, 7, { "1": [true, 7] }],
    ],
  );
});

test("an elective in the core stays an elective for tracks that don't require it", () => {
  const header = (hab: string): W[] => [
    ...line(40, HEADER, [[40, "Curso: 331 - GEOGRAFIA"]]),
    ...line(52, HEADER, [[40, "Currículo: 20071"]]),
    ...line(70, HEADER, [[40, `Habilitação: ${hab}`]]),
  ];
  const row = (y: number, code: string, type: string): W[] =>
    line(y, TABLE, [[40, code], [82, "Disciplina"], [255, type], [283, "72"], [316, "4"]]);
  const html =
    page([
      ...header("Bacharelado e Licenciatura em Geografia"),
      ...line(100, HEADING, [[275, "Fase 01"]]),
      ...row(130, "GCN7101", "Ob"),
      ...line(160, HEADING, [[275, "Fase 02"]]),
      ...row(190, "GCN7201", "Ob"),
      ...line(220, HEADING, [[275, "Disciplinas Optativas"]]),
      ...row(250, "GCN7500", "Op"),
    ]) +
    page([
      ...header("Licenciatura em Geografia"),
      ...line(100, HEADING, [[275, "Fase 05"]]),
      ...row(130, "MEN7001", "Ob"),
    ]) +
    page([
      ...header("Bacharelado em Geografia"),
      ...line(100, HEADING, [[275, "Fase 05"]]),
      ...row(130, "GCN7500", "Ob"),
    ]);
  const { courses, habilitacoes } = parseCurriculumBBox(html);
  assert.deepEqual(habilitacoes?.map((h) => h.label), ["Licenciatura", "Bacharelado"]);
  const gcn = courses.find((c) => c[0] === "GCN7500")!;
  assert.deepEqual(gcn[9], { "0": [false, null], "1": [true, 5] });
});

test("no tracks when a habilitação group is not a whole course plan (Psicologia)", () => {
  const header = (hab: string): W[] => [
    ...line(40, HEADER, [[40, "Curso: 319 - PSICOLOGIA"]]),
    ...line(52, HEADER, [[40, "Currículo: 20101"]]),
    ...line(70, HEADER, [[40, `Habilitação: ${hab}`]]),
  ];
  const row = (y: number, code: string, type = "Ob"): W[] =>
    line(y, TABLE, [[40, code], [82, "Disciplina"], [255, type], [283, "72"], [316, "4"]]);
  const html =
    // UFSC files the first phases under one habilitação...
    page([
      ...header("Licenciatura em Psicologia"),
      ...line(100, HEADING, [[275, "Fase 01"]]),
      ...row(130, "PSI7101"),
      ...line(160, HEADING, [[275, "Fase 02"]]),
      ...row(190, "PSI7201"),
    ]) +
    // ...and other groups only hold a few later courses.
    page([
      ...header("Bacharelado e Psicólogo"),
      ...line(100, HEADING, [[275, "Fase 08"]]),
      ...row(130, "PSI7808"),
    ]) +
    page([
      ...header("Bacharelado em Psicologia"),
      ...line(100, HEADING, [[275, "Fase 07"]]),
      ...row(130, "PSI7013"),
    ]);
  const { courses, habilitacoes } = parseCurriculumBBox(html);
  assert.equal(habilitacoes, undefined);
  assert.deepEqual(
    courses.map((c) => [c[0], c[8], c[9]]),
    [
      ["PSI7101", 1, undefined],
      ["PSI7201", 2, undefined],
      ["PSI7808", 8, undefined],
      ["PSI7013", 7, undefined],
    ],
  );
});

test("trackFromSection reads the choice written in a section title", () => {
  const cases: [string, string | null][] = [
    ["Fase 07 - NÚCLEO PROFISSIONALIZANTE : BACHARELADO", "Bacharelado"],
    ["9ª FASE - NÚCLEO PROFISSIONALIZANTE:LICENCIATURA EM PSICOLOGIA", "Licenciatura em Psicologia"],
    ["5ª Fase - Terminalidade: Linguagens e suas Tecnologias.", "Linguagens e suas Tecnologias"],
    ["APROFUNDAMENTO II [Fase 7]-Educ Infantil e Séries Iniciais Fundamental", "Educ Infantil e Séries Iniciais Fundamental"],
    ["Fase 03", null],
    ["Disciplinas Optativas", null],
  ];
  for (const [title, track] of cases) assert.equal(trackFromSection(title), track, title);
});

test("núcleos in section titles are the tracks, not the habilitação groups (Psicologia)", () => {
  const header = (hab: string): W[] => [
    ...line(40, HEADER, [[40, "Curso: 319 - PSICOLOGIA"]]),
    ...line(52, HEADER, [[40, "Currículo: 20101"]]),
    ...line(70, HEADER, [[40, `Habilitação: ${hab}`]]),
  ];
  const row = (y: number, code: string, type = "Ob"): W[] =>
    line(y, TABLE, [[40, code], [82, "Disciplina"], [255, type], [283, "72"], [316, "4"]]);
  const html =
    // UFSC files the núcleo comum AND both núcleos under one group...
    page([
      ...header("Licenciatura em Psicologia"),
      ...line(100, HEADING, [[275, "Fase 01"]]),
      ...row(130, "PSI7101"),
      ...line(160, HEADING, [[275, "Fase 02"]]),
      ...row(190, "PSI7201"),
      ...line(220, HEADING, [[275, "Fase 07 - NÚCLEO PROFISSIONALIZANTE : BACHARELADO"]]),
      ...row(250, "PSI7709"),
      ...line(280, HEADING, [[275, "DISCIPLINAS COMPLEMENTARES NÚCLEO COMUM:"]]),
      ...row(310, "ANT7003"),
      ...line(340, HEADING, [[275, "7ª FASE - NÚCLEO PROFISSIONALIZANTE: LICENCIATURA EM PSICOLOGIA"]]),
      ...row(370, "PSI7707"),
    ]) +
    // ...and more of each núcleo under other groups.
    page([
      ...header("Bacharelado em Psicologia"),
      ...line(100, HEADING, [[275, "Fase 08 - NÚCLEO PROFISSIONALIZANTE: BACHARELADO"]]),
      ...row(130, "PSI7023"),
    ]) +
    page([
      ...header("Psicólogo e Licenciatura em Psicologia"),
      ...line(100, HEADING, [[275, "7ª FASE - NÚCLEO PROFISSIONALIZANTE: LICENCIATURA EM PSICOLOGIA"]]),
      ...row(130, "ANT7003"),
    ]);
  const { courses, habilitacoes } = parseCurriculumBBox(html);
  assert.deepEqual(habilitacoes?.map((h) => h.label), ["Bacharelado", "Licenciatura em Psicologia"]);
  const view = (t: number) =>
    courses
      .filter((c) => (c[9] ? c[9][String(t)] : [c[7], c[8]])?.[0] === true)
      .map((c) => c[0]);
  assert.deepEqual(view(0), ["PSI7101", "PSI7201", "PSI7709", "PSI7023"]);
  // ANT7003's "complementares" listing does not make it part of the Bacharelado.
  assert.deepEqual(view(1), ["PSI7101", "PSI7201", "PSI7707", "ANT7003"]);
});

test("habilitacaoLabels keeps only what differs", () => {
  assert.deepEqual(
    habilitacaoLabels(["Licenciatura em Letras - Inglês", "Bacharelado em Letras - Inglês"]),
    ["Licenciatura", "Bacharelado"],
  );
  assert.deepEqual(
    habilitacaoLabels([
      "Licenciatura em Pedagogia, habilitação Educação Infantil",
      "Licenciatura em Pedagogia, habilitação Séries Iniciais",
    ]),
    ["Educação Infantil", "Séries Iniciais"],
  );
});

// ── Psicologia 2010.1: núcleos, notes, ênfases ──────────────────────────────

const psiHeader = (hab: string): W[] => [
  ...line(40, HEADER, [[40, "Curso: 319 - PSICOLOGIA"]]),
  ...line(52, HEADER, [[40, "Currículo: 20101"]]),
  ...line(70, HEADER, [[40, `Habilitação: ${hab}`]]),
];
/** A row whose name may wrap: each extra name line goes 9.2pt below. */
const psiRow = (y: number, code: string, name: string[] = ["Disciplina"], ha = "72"): W[] => [
  ...line(y, TABLE, [[40, code], [82, name[0]], [255, "Ob"], [283, ha], [316, "4"]]),
  ...name.slice(1).flatMap((part, i) => line(y + 9.2 * (i + 1), TABLE, [[82, part]])),
];
const viewOf = (
  courses: ReturnType<typeof parseCurriculumBBox>["courses"],
  track: number,
  enfases: number[] = [],
) =>
  courses
    .filter((c) => {
      const placement = c[9] ? c[9][String(track)] : [c[7], c[8]];
      if (placement?.[0] !== true) return false;
      const ref = c[10];
      return !ref || enfases[ref[0]] === ref[1];
    })
    .map((c) => `${c[0]}@${c[9] ? c[9][String(track)]![1] : c[8]}`);

test("Observações notes in the 8pt font are read: a note can require a course for a track", () => {
  const html =
    page([
      ...psiHeader("Licenciatura em Psicologia"),
      ...line(100, HEADING, [[275, "Fase 01"]]),
      ...psiRow(130, "PSI7101"),
      ...line(160, HEADING, [[275, "Fase 02"]]),
      ...psiRow(190, "PSI7201"),
      ...line(220, HEADING, [[275, "Fase 07 - NÚCLEO PROFISSIONALIZANTE : BACHARELADO"]]),
      ...psiRow(250, "PSI7508"),
      ...line(280, HEADING, [[275, "7ª FASE - NÚCLEO PROFISSIONALIZANTE: LICENCIATURA EM PSICOLOGIA"]]),
      ...psiRow(310, "MEN5421"),
      // The notes are set in the page-header font, the sentence wraps.
      ...line(400, HEADER, [[40, "Observações"]]),
      ...line(416, HEADER, [[55, "Parágrafo Único - As disciplinas PSI7508 são obrigatórias para efeito de"]]),
      ...line(426, HEADER, [[40, "integralização de LICENCIATURA em PSICOLOGIA. Portaria 360/PROGRAD/2014."]]),
    ]) +
    page([
      ...psiHeader("Licenciatura em Psicologia"),
      ...line(100, HEADER, [[40, "Legenda: Tipo: Ob=Disciplina Obrigatória"]]),
    ]);
  const { courses } = parseCurriculumBBox(html);
  assert.deepEqual(viewOf(courses, 0), ["PSI7101@1", "PSI7201@2", "PSI7508@7"]);
  assert.deepEqual(viewOf(courses, 1), ["PSI7101@1", "PSI7201@2", "PSI7508@7", "MEN5421@7"]);
});

function psicologia2010(): string {
  const enfaseRows = (y: number, base: string, codes: [string, string][], slot: string): W[] =>
    codes.flatMap(([code, letter], i) =>
      psiRow(y + i * 30, code, [`${base} ${letter}`, `(${slot}ª ênfase`, "escolhida)"], "216"),
    );
  return (
    page([
      ...psiHeader("Licenciatura em Psicologia"),
      ...line(100, HEADING, [[275, "Fase 01"]]),
      ...psiRow(130, "PSI7101"),
      ...line(160, HEADING, [[275, "Fase 02"]]),
      ...psiRow(190, "PSI7201"),
      ...line(220, HEADING, [[275, "Fase 07 - NÚCLEO PROFISSIONALIZANTE : BACHARELADO"]]),
      ...psiRow(250, "PSI7709"),
      ...line(280, HEADING, [[275, "7ª FASE - NÚCLEO PROFISSIONALIZANTE: LICENCIATURA EM PSICOLOGIA"]]),
      ...psiRow(310, "PSI7707", ["Seminários Integrados I:", "Introdução ao Campo (1ª", "ênfase escolhida)"]),
      ...line(360, HEADING, [[275, "8ª FASE - NÚCLEO PROFISSIONALIZANTE: LICENCIATURA EM PSICOLOGIA"]]),
      ...psiRow(390, "MEN5602", ["Didática B"]),
    ]) +
    page([
      ...psiHeader("Bacharelado e Psicólogo"),
      ...line(100, HEADING, [[275, "Fase 08 - NÚCLEO PROFISSIONALIZANTE: BACHARELADO"]]),
      ...psiRow(130, "PSI7808", ["Seminários Integrados I :", "Introdução ao Campo"], "36"),
    ]) +
    page([
      ...psiHeader("Bacharelado em Psicologia"),
      ...line(100, HEADING, [[275, "Fase 07 - NÚCLEO PROFISSIONALIZANTE : BACHARELADO"]]),
      ...line(115, DESC, [[82, "(*) ÊNFASE A - SAÚDE E PROCESSOS CLÍNICOS"]]),
      ...line(123, DESC, [[82, "ÊNFASE B - PSICOLOGIA ESCOLAR/EDUCACIONAL"]]),
      ...enfaseRows(140, "Estágio I", [["PSI7013", "A"], ["PSI7014", "B"]], "1"),
      ...line(220, HEADING, [[275, "Fase 09 - NÚCLEO PROFISSIONALIZANTE: BACHARELADO"]]),
      ...enfaseRows(250, "Estágio I", [["PSI7033", "A"], ["PSI7034", "B"]], "2"),
    ])
  );
}

test("ênfase versions are tagged per slot with the ênfase names from the PDF", () => {
  const { courses, enfases } = parseCurriculumBBox(psicologia2010());
  assert.deepEqual(enfases, [
    {
      label: "1ª ênfase",
      options: [
        { label: "A – Saúde e Processos Clínicos", name: "Saúde e Processos Clínicos" },
        { label: "B – Psicologia Escolar/Educacional", name: "Psicologia Escolar/Educacional" },
      ],
    },
    {
      label: "2ª ênfase",
      options: [
        { label: "A – Saúde e Processos Clínicos", name: "Saúde e Processos Clínicos" },
        { label: "B – Psicologia Escolar/Educacional", name: "Psicologia Escolar/Educacional" },
      ],
    },
  ]);
  const ref = (id: string) => courses.find((c) => c[0] === id)?.[10];
  assert.deepEqual(ref("PSI7013"), [0, 0]);
  assert.deepEqual(ref("PSI7014"), [0, 1]);
  assert.deepEqual(ref("PSI7034"), [1, 1]);
  assert.equal(ref("PSI7709"), undefined);
  assert.deepEqual(viewOf(courses, 0, [1, 0]), [
    "PSI7101@1",
    "PSI7201@2",
    "PSI7709@7",
    "PSI7808@8",
    "PSI7014@7",
    "PSI7033@9",
  ]);
});

test("the Licenciatura núcleo is taken on top of the Bacharelado, with its own seminars", () => {
  const { courses, habilitacoes } = parseCurriculumBBox(psicologia2010());
  assert.deepEqual(habilitacoes, [
    { label: "Bacharelado", name: "Bacharelado" },
    { label: "Bacharelado + Licenciatura", name: "Bacharelado e Licenciatura em Psicologia" },
  ]);
  // Every Bacharelado course and the chosen ênfases, plus the Licenciatura's…
  assert.deepEqual(viewOf(courses, 1, [0, 1]), [
    "PSI7101@1",
    "PSI7201@2",
    "PSI7709@7",
    "PSI7707@7",
    "MEN5602@8",
    "PSI7013@7",
    "PSI7034@9",
  ]);
  // …whose 72 h/a seminar replaces the Bacharelado's 36 h/a one: still takeable.
  const psi7808 = courses.find((c) => c[0] === "PSI7808")!;
  assert.deepEqual(psi7808[9], { "0": [true, 8], "1": [false, null] });
  // Courses now in both views are plain shared courses again.
  assert.equal(courses.find((c) => c[0] === "PSI7709")![9], undefined);
  assert.equal(courses.find((c) => c[0] === "PSI7013")![9], null);
});

test("section titles stamped on regardless of content are not tracks (Psicologia 1991.1)", () => {
  const html = page([
    ...psiHeader("Licenciatura em Psicologia"),
    ...line(100, HEADING, [[275, "Fase 01"]]),
    ...psiRow(130, "PSI5126"),
    ...line(160, HEADING, [[275, "Fase 02"]]),
    ...psiRow(190, "PSI5145"),
    ...line(220, HEADING, [[275, "Fase 07 - NÚCLEO PROFISSIONALIZANTE : BACHARELADO"]]),
    ...psiRow(250, "EED5331"),
    ...line(280, HEADING, [[275, "Fase 08 - NÚCLEO PROFISSIONALIZANTE: BACHARELADO"]]),
    ...psiRow(310, "PSI5321"),
    ...line(340, HEADING, [[275, "8ª FASE - NÚCLEO PROFISSIONALIZANTE: LICENCIATURA EM PSICOLOGIA"]]),
    ...psiRow(370, "EED5331"),
  ]);
  assert.equal(parseCurriculumBBox(html).habilitacoes, undefined);
});

test("a course every track requires in the same phase keeps section-title tracks", () => {
  const html = page([
    ...psiHeader("Licenciatura em Educação Física"),
    ...line(100, HEADING, [[275, "Fase 01"]]),
    ...psiRow(130, "DEF5101"),
    ...line(160, HEADING, [[275, "Fase 02"]]),
    ...psiRow(190, "DEF5201"),
    ...line(220, HEADING, [[275, "APROFUNDAMENTO I [Fase 7]-Esportes"]]),
    ...psiRow(250, "MEN5236"),
    ...psiRow(280, "DEF5134"),
    ...line(310, HEADING, [[275, "APROFUNDAMENTO III [Fase 7]-Educação Física Especial"]]),
    ...psiRow(340, "MEN5236"),
    ...psiRow(370, "DEF5136"),
  ]);
  const { courses, habilitacoes } = parseCurriculumBBox(html);
  assert.deepEqual(habilitacoes?.map((h) => h.label), ["Esportes", "Educação Física Especial"]);
  assert.deepEqual(viewOf(courses, 0), ["DEF5101@1", "DEF5201@2", "MEN5236@7", "DEF5134@7"]);
  assert.deepEqual(viewOf(courses, 1), ["DEF5101@1", "DEF5201@2", "MEN5236@7", "DEF5136@7"]);
});

test("enfaseVariant and titleCaseIfUpper", () => {
  assert.deepEqual(enfaseVariant("Estágio Profissionalizante I A (1ª ênfase escolhida)"), { slot: 1, letter: "A" });
  assert.deepEqual(enfaseVariant("Fundamentação da Ênfase IIB (1ª ênfase escolhida)"), { slot: 1, letter: "B" });
  assert.deepEqual(enfaseVariant("Fundamentação da Ênfase II C : ( 2ª ênfase escolhida)"), { slot: 2, letter: "C" });
  assert.equal(enfaseVariant("Seminários Integrados I: Introdução ao Campo (1ª ênfase escolhida)"), null);
  assert.equal(titleCaseIfUpper("PSICOLOGIA ESCOLAR/EDUCACIONAL"), "Psicologia Escolar/Educacional");
  assert.equal(titleCaseIfUpper("TRABALHO, ORGANIZAÇÕES E GESTÃO"), "Trabalho, Organizações e Gestão");
  assert.equal(titleCaseIfUpper("Já Formatado"), "Já Formatado");
});
