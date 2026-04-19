"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
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
      studentStore.setAuthStatus(true, result.hashedUsername);
      studentStore.setAuthCheckCompleted(true);

      // Navigate to home page
      router.push("/");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Invalid username or password",
      );
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1 className="auth-heading">
          Entrar
        </h1>

        {error && (
          <div className="auth-error">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="username"
              className="form-label"
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
              className="form-input"
              required
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="form-label"
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
              className="form-input"
              required
            />
          </div>

          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? "Entrando..." : "Entrar"}
          </Button>
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
