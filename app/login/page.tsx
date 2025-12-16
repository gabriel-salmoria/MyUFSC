"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import useEncryptedData from "@/hooks/setup/LoadUser";
import { useStudentStore } from "@/lib/student-store";
import { StudentInfo } from "@/types/student-plan";

export default function LoginPage() {
  const router = useRouter();
  const studentStore = useStudentStore();
  const { login, isLoading } = useEncryptedData({
    onLoadError: (error) => {
      setError(
        error instanceof Error ? error.message : "Failed to decrypt data",
      );
    },
  });

  const [formData, setFormData] = useState({
    username: "",
    password: "",
  });
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      const result = await login(formData.username, formData.password);

      if (!result.success) {
        throw new Error("Login failed");
      }

      // If login succeeded but no data was returned
      if (!result.data) {
        throw new Error("Failed to load user data hehe");
      }

      // Set the decrypted data in the global store
      studentStore.setStudentInfo(result.data as StudentInfo);

      // Navigate to home page
      router.push("/");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Invalid username or password",
      );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md p-8 space-y-6 bg-card rounded-lg shadow-lg">
        <h1 className="text-2xl font-bold text-center text-foreground">
          Entrar
        </h1>

        {error && (
          <div className="p-3 text-sm text-red-500 bg-red-100 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="username"
              className="block text-sm font-medium text-foreground"
            >
              Usuário
            </label>
            <input
              type="text"
              id="username"
              value={formData.username}
              onChange={(e) =>
                setFormData({ ...formData, username: e.target.value })
              }
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2"
              required
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-foreground"
            >
              Senha
            </label>
            <input
              type="password"
              id="password"
              value={formData.password}
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition disabled:opacity-50"
          >
            {isLoading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <div className="text-center text-sm text-foreground">
          Não tem uma conta?{" "}
          <Link href="/register" className="text-primary hover:underline">
            Registre-se aqui
          </Link>
        </div>
      </div>
    </div>
  );
}
