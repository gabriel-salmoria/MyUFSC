import type { Metadata } from "next";
import SetupClient from "./setup-client";

export const metadata: Metadata = {
  title: "Configuração Inicial",
  description:
    "Escolha seu curso na UFSC e comece a usar o MyUFSC sem precisar criar uma conta.",
  alternates: {
    canonical: "/setup",
  },
};

export default function SetupPage() {
  return <SetupClient />;
}
