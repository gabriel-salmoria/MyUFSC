import type { Metadata } from "next";
import RegisterClient from "./register-client";

export const metadata: Metadata = {
  title: "Registrar",
  description:
    "Crie sua conta gratuita no MyUFSC e comece a planejar sua grade curricular da UFSC.",
  alternates: {
    canonical: "/register",
  },
};

export default function RegisterPage() {
  return <RegisterClient />;
}
