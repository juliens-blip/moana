'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { Anchor } from 'lucide-react';
import { loginSchema, type LoginInput } from '@/lib/validations';
import { Button, Input } from '@/components/ui';

export function LoginForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginInput) => {
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          broker: data.broker,
          password: data.password,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error || 'Identifiants invalides');
      } else {
        toast.success('Connexion réussie!');
        router.push('/dashboard');
        router.refresh();
      }
    } catch (error) {
      console.error('Login error:', error);
      toast.error('Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-secondary-50 px-4 animate-fade-in">
      <div className="w-full max-w-md">
        {/* Logo & Title */}
        <div className="text-center mb-8 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-primary-600 to-secondary-600 rounded-2xl mb-4 transition-smooth hover:scale-110 hover:rotate-3">
            <Anchor className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Moana Yachting</h1>
          <p className="text-gray-600 mt-2">Connexion Broker</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8 animate-scale-in hw-accelerate" style={{ animationDelay: '250ms' }}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="animate-fade-in" style={{ animationDelay: '400ms' }}>
              <Input
                label="Nom d'utilisateur"
                placeholder="Votre identifiant broker"
                error={errors.broker?.message}
                required
                autoComplete="username"
                {...register('broker')}
              />
            </div>

            <div className="animate-fade-in" style={{ animationDelay: '500ms' }}>
              <Input
                label="Mot de passe"
                type="password"
                placeholder="••••••••"
                error={errors.password?.message}
                required
                autoComplete="current-password"
                {...register('password')}
              />
            </div>

            <div className="animate-fade-in" style={{ animationDelay: '600ms' }}>
              <Button
                type="submit"
                className="w-full"
                loading={loading}
                disabled={loading}
              >
                Se connecter
              </Button>
            </div>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center text-sm text-gray-500 animate-fade-in" style={{ animationDelay: '700ms' }}>
            <p>Besoin d'aide? Contactez l'administrateur</p>
          </div>
        </div>
      </div>
    </div>
  );
}
