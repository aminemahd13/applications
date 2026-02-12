"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Loader2, Mail, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useAuth } from "@/lib/auth-context";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginValues = z.infer<typeof loginSchema>;

function isSafeReturnUrl(returnUrl: string | null): returnUrl is string {
  return (
    !!returnUrl && returnUrl.startsWith("/") && !returnUrl.startsWith("//")
  );
}

interface LoginUser {
  isGlobalAdmin: boolean;
  eventRoles?: Array<{ eventId: string }>;
}

function getDefaultPostLoginPath(user: LoginUser): string {
  if (user.isGlobalAdmin) return "/admin";
  if ((user.eventRoles?.length ?? 0) > 0) return "/staff";
  return "/dashboard";
}

function shouldUseReturnUrl(returnUrl: string, user: LoginUser): boolean {
  const [pathOnly] = returnUrl.split("?");

  // For staff users, "/dashboard" is a generic portal landing; prefer staff workspace.
  if (pathOnly === "/dashboard" && (user.eventRoles?.length ?? 0) > 0) {
    return false;
  }

  // Never send non-admin users to admin routes after login.
  if (pathOnly.startsWith("/admin") && !user.isGlobalAdmin) {
    return false;
  }

  // Validate event-scoped staff returnUrl against assigned events.
  if (pathOnly.startsWith("/staff/") && !user.isGlobalAdmin) {
    const targetEventId = pathOnly.split("/")[2] ?? "";
    const hasAccess =
      user.eventRoles?.some((r) => r.eventId === targetEventId) ?? false;
    if (!hasAccess) return false;
  }

  return true;
}

function LoginForm() {
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginValues) {
    setIsLoading(true);
    const user = await login(values.email, values.password);
    setIsLoading(false);
    if (user) {
      const returnUrl = searchParams.get("returnUrl");
      const defaultPath = getDefaultPostLoginPath(user);
      if (isSafeReturnUrl(returnUrl) && shouldUseReturnUrl(returnUrl, user)) {
        window.location.assign(returnUrl);
      } else {
        window.location.assign(defaultPath);
      }
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <div className="space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to your Math&Maroc account
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="you@example.com"
                        type="email"
                        className="pl-10"
                        autoComplete="email"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>Password</FormLabel>
                    <Link
                      href="/forgot-password"
                      className="text-xs text-primary hover:underline"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <FormControl>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="password"
                        placeholder="********"
                        className="pl-10"
                        autoComplete="current-password"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign in
            </Button>
          </form>
        </Form>

        <div className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="text-primary font-medium hover:underline"
          >
            Sign up
          </Link>
        </div>
      </div>
    </motion.div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
