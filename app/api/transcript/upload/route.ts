import { NextRequest, NextResponse } from "next/server";
import { parseTranscriptPdf } from "@/parsers/transcript-parser";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: "Nenhum arquivo enviado" },
        { status: 400 },
      );
    }

    const fileName = file.name?.toLowerCase() ?? "";
    if (!fileName.endsWith(".pdf")) {
      return NextResponse.json(
        { error: "Apenas arquivos PDF são aceitos" },
        { status: 400 },
      );
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
    const data = await parseTranscriptPdf(buffer);

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Erro desconhecido";
    console.error("Erro ao processar PDF do histórico:", message);
    return NextResponse.json(
      { error: `Falha ao processar o PDF: ${message}` },
      { status: 500 },
    );
  }
}
