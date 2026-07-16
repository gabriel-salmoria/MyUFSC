import type { Metadata } from "next";
import LoginClient from "./login-client";

export const metadata: Metadata = {
  title: "Entrar",
  description:
    "Acesse sua conta MyUFSC para continuar organizando sua grade curricular da UFSC.",
  alternates: {
    canonical: "/login",
  },
};

export default function LoginPage() {
  return <LoginClient />;
}
