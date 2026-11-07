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
